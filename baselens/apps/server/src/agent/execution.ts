// ============================================
// Agent Execution Module (AgentKit)
// ============================================

import { parseEther, parseUnits, formatEther, formatUnits, type Address } from "viem";
import { logger } from "../logger.js";
import { getAgentWallet, getAgentAccount, getAgentEthBalance, getPublicClient } from "./wallet.js";
import { TREASURY_SWAP_ADDRESS, TREASURY_SWAP_ABI, ERC20_ABI, USDC_ADDRESS_BASE_SEPOLIA } from "./treasurySwapAbi.js";
import { config } from "../config.js";
import type { AgentPlan, PlanStep, ExecutionStatus, ExecutionState } from "./types.js";
import { randomUUID } from "crypto";
import { executeTool, getTool } from "./contractTools.js";

// Use public client from wallet module for reading blockchain state
const publicClient = getPublicClient();

// In-memory execution state storage (in production, use Redis or DB)
const executionStates = new Map<string, ExecutionState>();

/**
 * Start execution of an agent plan
 */
export async function startExecution(plan: AgentPlan): Promise<string> {
  const executionId = randomUUID();

  const executionState: ExecutionState = {
    executionId,
    plan,
    steps: plan.steps.map((step) => ({
      stepId: step.stepId,
      status: "pending",
    })),
    currentStep: 0,
    isComplete: false,
  };

  executionStates.set(executionId, executionState);

  logger.info(`[Execution] Started execution ${executionId} with ${plan.steps.length} steps`);

  return executionId;
}

/**
 * Get execution state
 */
export function getExecutionState(executionId: string): ExecutionState | null {
  return executionStates.get(executionId) || null;
}

/**
 * Execute Step 0 confirmation (verify funding transaction)
 */
export async function confirmStep0(
  executionId: string,
  txHash: string,
  expectedToken: "ETH" | "USDC",
  expectedAmount: string
): Promise<{ success: boolean; error?: string }> {
  const state = executionStates.get(executionId);
  if (!state) {
    return { success: false, error: "Execution not found" };
  }

  try {
    // Wait for transaction to be mined
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    if (receipt.status === "reverted") {
      return { success: false, error: "Transaction reverted" };
    }

    // Verify the agent wallet received the funds
    const agentAddress = getAgentAccount().address;

    // Store original user amount for rollback tracking
    let amountWei: bigint;
    if (expectedToken === "ETH") {
      amountWei = parseEther(expectedAmount);
      const balance = await publicClient.getBalance({ address: agentAddress });
      logger.info(`[Execution] Agent ETH balance: ${formatEther(balance)}`);
    } else if (expectedToken === "USDC") {
      amountWei = parseUnits(expectedAmount, 6);
      const usdcAddress = (config.USDC_ADDRESS_BASE_SEPOLIA || USDC_ADDRESS_BASE_SEPOLIA) as Address;
      const balance = await publicClient.readContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [agentAddress],
      });
      logger.info(`[Execution] Agent USDC balance: ${formatUnits(balance as bigint, 6)}`);
    } else {
      throw new Error(`Unsupported token: ${expectedToken}`);
    }

    // Store original user amount for rollback (to return only what user sent, not entire wallet balance)
    state.originalUserAmount = {
      token: expectedToken,
      amount: expectedAmount,
      amountWei,
    };
    logger.info(`[Execution] 💾 Stored original user amount: ${expectedAmount} ${expectedToken} (${amountWei.toString()} wei)`);

    // Initialize context balance - what user should receive
    // Start with original amount, will be updated after swaps
    if (expectedToken === "ETH") {
      state.userShouldReceive = {
        ethAmount: amountWei,
        usdcAmount: 0n,
      };
    } else {
      state.userShouldReceive = {
        ethAmount: 0n,
        usdcAmount: amountWei,
      };
    }
    logger.info(`[Execution] 📊 Initialized context balance - User should receive: ${expectedAmount} ${expectedToken}`);

    // Mark Step 0 as completed
    state.steps[0] = {
      stepId: 0,
      status: "completed",
      txHash,
      result: `Received ${expectedAmount} ${expectedToken}`,
    };

    // Start executing remaining steps
    executeRemainingSteps(executionId).catch((error) => {
      logger.error(`[Execution] Failed to execute remaining steps:`, error);
    });

    return { success: true };
  } catch (error) {
    logger.error(`[Execution] Step 0 confirmation failed:`, error);
    state.steps[0] = {
      stepId: 0,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Verify funds are received after a step execution
 * Waits and retries until funds are confirmed in wallet
 */
async function verifyFundsReceived(step: PlanStep, txHash: string, balanceBefore?: { eth?: bigint; usdc?: bigint }): Promise<void> {
  logger.info(`[Execution] 🔍 Verifying funds received after ${step.action}...`);

  const account = getAgentAccount();

  // Wait initial delay for state to update
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Verify based on action type
  if (step.action === "swap_eth_to_usdc") {
    // Verify USDC was received - check if balance increased
    const usdcAddress = (config.USDC_ADDRESS_BASE_SEPOLIA || USDC_ADDRESS_BASE_SEPOLIA) as Address;
    let verified = false;
    const beforeBalance = balanceBefore?.usdc || 0n;

    for (let attempt = 0; attempt < 10; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between retries
      }

      const balance = await publicClient.readContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account.address],
      }) as bigint;

      const received = balance - beforeBalance;

      logger.info(`[Execution] Verification attempt ${attempt + 1}/10: USDC balance = ${formatUnits(balance, 6)} USDC (was ${formatUnits(beforeBalance, 6)}, received ${formatUnits(received, 6)})`);

      if (balance > beforeBalance) {
        verified = true;
        logger.info(`[Execution] ✅ Verified: USDC received! Received ${formatUnits(received, 6)} USDC. Total: ${formatUnits(balance, 6)} USDC`);
        break;
      }
    }

    if (!verified) {
      logger.warn(`[Execution] ⚠️  Could not verify USDC receipt after 10 attempts. Balance unchanged. Transaction: ${txHash}`);
      throw new Error(`Failed to verify USDC receipt: balance did not increase after swap transaction`);
    }
  } else if (step.action === "swap_usdc_to_eth") {
    // Verify ETH was received - check if balance increased
    let verified = false;
    const beforeBalance = balanceBefore?.eth || 0n;

    for (let attempt = 0; attempt < 10; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between retries
      }

      const balance = await getAgentEthBalance();
      const received = balance - beforeBalance;

      logger.info(`[Execution] Verification attempt ${attempt + 1}/10: ETH balance = ${formatEther(balance)} ETH (was ${formatEther(beforeBalance)}, received ${formatEther(received)})`);

      if (balance > beforeBalance) {
        verified = true;
        logger.info(`[Execution] ✅ Verified: ETH received! Received ${formatEther(received)} ETH. Total: ${formatEther(balance)} ETH`);
        break;
      }
    }

    if (!verified) {
      logger.warn(`[Execution] ⚠️  Could not verify ETH receipt after 10 attempts. Balance unchanged. Transaction: ${txHash}`);
      throw new Error(`Failed to verify ETH receipt: balance did not increase after swap transaction`);
    }
  } else if (step.action === "unstake_eth") {
    // Verify ETH was received from unstaking - check if balance increased
    let verified = false;
    const beforeBalance = balanceBefore?.eth || 0n;
    const expectedAmount = step.parameters.amount && step.parameters.amount !== "ALL"
      ? parseEther(step.parameters.amount)
      : 0n;

    for (let attempt = 0; attempt < 10; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const balance = await getAgentEthBalance();
      const received = balance - beforeBalance;

      logger.info(`[Execution] Verification attempt ${attempt + 1}/10: ETH balance = ${formatEther(balance)} ETH (was ${formatEther(beforeBalance)}, received ${formatEther(received)})`);

      if (expectedAmount > 0n) {
        // Verify we received at least the expected amount
        if (received >= expectedAmount) {
          verified = true;
          logger.info(`[Execution] ✅ Verified: ETH unstaked! Received ${formatEther(received)} ETH (expected: ${formatEther(expectedAmount)} ETH)`);
          break;
        }
      } else {
        // Just verify balance increased
        if (balance > beforeBalance) {
          verified = true;
          logger.info(`[Execution] ✅ Verified: ETH unstaked! Received ${formatEther(received)} ETH`);
          break;
        }
      }
    }

    if (!verified) {
      logger.warn(`[Execution] ⚠️  Could not verify ETH unstaking after 10 attempts. Balance unchanged. Transaction: ${txHash}`);
      throw new Error(`Failed to verify ETH unstaking: balance did not increase after transaction`);
    }
  } else if (step.action === "unstake_usdc") {
    // Verify USDC was received from unstaking - check if balance increased
    const usdcAddress = (config.USDC_ADDRESS_BASE_SEPOLIA || USDC_ADDRESS_BASE_SEPOLIA) as Address;
    let verified = false;
    const beforeBalance = balanceBefore?.usdc || 0n;
    const expectedAmount = step.parameters.amount && step.parameters.amount !== "ALL"
      ? parseUnits(step.parameters.amount, 6)
      : 0n;

    for (let attempt = 0; attempt < 10; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const balance = await publicClient.readContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account.address],
      }) as bigint;

      const received = balance - beforeBalance;

      logger.info(`[Execution] Verification attempt ${attempt + 1}/10: USDC balance = ${formatUnits(balance, 6)} USDC (was ${formatUnits(beforeBalance, 6)}, received ${formatUnits(received, 6)})`);

      if (expectedAmount > 0n) {
        if (received >= expectedAmount) {
          verified = true;
          logger.info(`[Execution] ✅ Verified: USDC unstaked! Received ${formatUnits(received, 6)} USDC (expected: ${formatUnits(expectedAmount, 6)} USDC)`);
          break;
        }
      } else {
        if (balance > beforeBalance) {
          verified = true;
          logger.info(`[Execution] ✅ Verified: USDC unstaked! Received ${formatUnits(received, 6)} USDC`);
          break;
        }
      }
    }

    if (!verified) {
      logger.warn(`[Execution] ⚠️  Could not verify USDC unstaking after 10 attempts. Balance unchanged. Transaction: ${txHash}`);
      throw new Error(`Failed to verify USDC unstaking: balance did not increase after transaction`);
    }
  } else {
    // For other actions (stake, etc.), just log that we're skipping verification
    logger.info(`[Execution] ⏭️  Skipping verification for action: ${step.action}`);
  }
}

/**
 * Execute remaining steps (1..N) using AgentKit
 */
async function executeRemainingSteps(executionId: string): Promise<void> {
  const state = executionStates.get(executionId);
  if (!state) {
    throw new Error("Execution not found");
  }

  const agentSteps = state.plan.steps.filter((s) => s.stepId > 0);

  for (let i = 0; i < agentSteps.length; i++) {
    const step = agentSteps[i];
    state.currentStep = step.stepId;

    // Mark step as running
    const stepStatus = state.steps.find((s) => s.stepId === step.stepId);
    if (stepStatus) {
      stepStatus.status = "running";
    }

    try {
      let txHash: string | undefined;
      let result: string | undefined;

      // Use AgentKit tools for contract interactions
      if (step.action === "send_remaining") {
        // send_remaining is a special action, not a contract tool
        txHash = await executeSendRemaining(executionId, step);
        result = "Sent remaining funds to user";
      } else {
        // All other actions use AgentKit tools
        const tool = getTool(step.action);

        if (!tool) {
          throw new Error(`Unknown action: ${step.action}. This action is not available as an AgentKit tool.`);
        }

        logger.info(`[Execution] Using AgentKit tool: ${step.action}`);

        // Extract parameters from step and execute tool
        const toolParams: Record<string, any> = {};
        if (step.parameters.amount) {
          // If "ALL" is requested, use only the user's contribution from context, not full wallet balance
          if (step.parameters.amount === "ALL" && state.userShouldReceive) {
            if (step.action === "swap_eth_to_usdc" || step.action === "stake_eth") {
              // For ETH actions, use user's ETH contribution from context
              const userEthAmount = state.userShouldReceive.ethAmount;
              if (userEthAmount > 0n) {
                toolParams.amount = formatEther(userEthAmount);
                logger.info(`[Execution] 🔄 Replaced "ALL" with user's ETH contribution: ${formatEther(userEthAmount)} ETH`);
              } else {
                throw new Error("Cannot swap/stake ALL: user has no ETH contribution remaining");
              }
            } else if (step.action === "swap_usdc_to_eth" || step.action === "stake_usdc") {
              // For USDC actions, use user's USDC contribution from context
              const userUsdcAmount = state.userShouldReceive.usdcAmount;
              if (userUsdcAmount > 0n) {
                toolParams.amount = formatUnits(userUsdcAmount, 6);
                logger.info(`[Execution] 🔄 Replaced "ALL" with user's USDC contribution: ${formatUnits(userUsdcAmount, 6)} USDC`);
              } else {
                throw new Error("Cannot swap/stake ALL: user has no USDC contribution remaining");
              }
            } else {
              // For other actions, keep "ALL" as is
              toolParams.amount = step.parameters.amount;
            }
          } else {
            // For specific amounts, validate we're not exceeding user's contribution
            if (state.userShouldReceive && step.parameters.amount) {
              if (step.action === "swap_eth_to_usdc" || step.action === "stake_eth") {
                const requestedAmount = parseEther(step.parameters.amount);
                const userAvailable = state.userShouldReceive.ethAmount;
                if (requestedAmount > userAvailable) {
                  logger.warn(`[Execution] ⚠️  Requested ${formatEther(requestedAmount)} ETH but user only has ${formatEther(userAvailable)} ETH. Limiting to user's contribution.`);
                  toolParams.amount = formatEther(userAvailable);
                } else {
                  toolParams.amount = step.parameters.amount;
                }
              } else if (step.action === "swap_usdc_to_eth" || step.action === "stake_usdc") {
                const requestedAmount = parseUnits(step.parameters.amount, 6);
                const userAvailable = state.userShouldReceive.usdcAmount;
                if (requestedAmount > userAvailable) {
                  logger.warn(`[Execution] ⚠️  Requested ${formatUnits(requestedAmount, 6)} USDC but user only has ${formatUnits(userAvailable, 6)} USDC. Limiting to user's contribution.`);
                  toolParams.amount = formatUnits(userAvailable, 6);
                } else {
                  toolParams.amount = step.parameters.amount;
                }
              } else {
                toolParams.amount = step.parameters.amount;
              }
            } else {
              toolParams.amount = step.parameters.amount;
            }
          }
        }

        // Get balance BEFORE transaction for verification
        const balanceBefore: { eth?: bigint; usdc?: bigint } = {};
        const account = getAgentAccount();
        const usdcAddress = (config.USDC_ADDRESS_BASE_SEPOLIA || USDC_ADDRESS_BASE_SEPOLIA) as Address;

        // Always track both balances before any transaction
        balanceBefore.eth = await getAgentEthBalance();
        balanceBefore.usdc = await publicClient.readContract({
          address: usdcAddress,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [account.address],
        }) as bigint;

        logger.info(`[Execution] 📊 Balance before ${step.action}: ETH = ${formatEther(balanceBefore.eth)}, USDC = ${formatUnits(balanceBefore.usdc, 6)}`);

        txHash = await executeTool(step.action, toolParams);

        // Update context balance after swaps - read actual balance to determine what user should receive
        if (state.userShouldReceive && txHash) {
          if (step.action === "swap_eth_to_usdc") {
            // User swapped ETH to USDC - calculate what was received (difference from before)
            const usdcAddress = (config.USDC_ADDRESS_BASE_SEPOLIA || USDC_ADDRESS_BASE_SEPOLIA) as Address;
            const account = getAgentAccount();
            const usdcBefore = balanceBefore.usdc || 0n;

            // Wait a moment for state to update after transaction
            await new Promise(resolve => setTimeout(resolve, 500));

            // Retry reading balance (state might not be updated immediately)
            let usdcBalanceAfter = 0n;
            for (let attempt = 0; attempt < 5; attempt++) {
              if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms between retries
              }

              usdcBalanceAfter = await publicClient.readContract({
                address: usdcAddress,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [account.address],
              }) as bigint;

              const received = usdcBalanceAfter - usdcBefore;
              logger.info(`[Execution] Balance read attempt ${attempt + 1}: USDC balance = ${formatUnits(usdcBalanceAfter, 6)} (was ${formatUnits(usdcBefore, 6)}, received ${formatUnits(received, 6)})`);

              if (received > 0n) {
                break; // Found received amount, stop retrying
              }
            }

            // Calculate what was actually received from the swap
            const usdcReceived = usdcBalanceAfter - usdcBefore;

            if (usdcReceived <= 0n) {
              logger.warn(`[Execution] ⚠️  No USDC received from swap. Balance unchanged or decreased.`);
            }

            // Update context with only what was received, not the full balance
            state.userShouldReceive = {
              ethAmount: 0n,
              usdcAmount: usdcReceived > 0n ? usdcReceived : 0n,
            };
            logger.info(`[Execution] 📊 Updated context balance after swap: User should receive ${formatUnits(usdcReceived, 6)} USDC (received from swap, not full wallet balance)`);
          } else if (step.action === "swap_usdc_to_eth") {
            // User swapped USDC to ETH - calculate what was received (difference from before)
            const ethBefore = balanceBefore.eth || 0n;

            // Wait a moment for state to update after transaction
            await new Promise(resolve => setTimeout(resolve, 500));

            // Retry reading balance (state might not be updated immediately)
            let ethBalanceAfter = await getAgentEthBalance();

            for (let attempt = 0; attempt < 5; attempt++) {
              if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms between retries
              }

              ethBalanceAfter = await getAgentEthBalance();
              const received = ethBalanceAfter - ethBefore;

              logger.info(`[Execution] Balance read attempt ${attempt + 1}: ETH balance = ${formatEther(ethBalanceAfter)} (was ${formatEther(ethBefore)}, received ${formatEther(received)})`);

              if (received > 0n) {
                break; // Found received amount, stop retrying
              }
            }

            // Calculate what was actually received from the swap
            const ethReceived = ethBalanceAfter - ethBefore;

            if (ethReceived <= 0n) {
              logger.warn(`[Execution] ⚠️  No ETH received from swap. Balance unchanged or decreased.`);
            }

            // Update context with only what was received, not the full balance
            state.userShouldReceive = {
              ethAmount: ethReceived > 0n ? ethReceived : 0n,
              usdcAmount: 0n,
            };
            logger.info(`[Execution] 📊 Updated context balance after swap: User should receive ${formatEther(ethReceived)} ETH (received from swap, not full wallet balance)`);
          } else if (step.action === "stake_eth") {
            // User staked ETH - deduct from context balance
            const stakedAmount = step.parameters.amount === "ALL"
              ? state.userShouldReceive.ethAmount
              : parseEther(step.parameters.amount || "0");

            state.userShouldReceive = {
              ethAmount: state.userShouldReceive.ethAmount - stakedAmount,
              usdcAmount: state.userShouldReceive.usdcAmount,
            };
            logger.info(`[Execution] 📊 Updated context balance after stake: Deducted ${formatEther(stakedAmount)} ETH from return. Remaining: ${formatEther(state.userShouldReceive.ethAmount)} ETH`);
          } else if (step.action === "stake_usdc") {
            // User staked USDC - deduct from context balance
            const stakedAmount = step.parameters.amount === "ALL"
              ? state.userShouldReceive.usdcAmount
              : parseUnits(step.parameters.amount || "0", 6);

            state.userShouldReceive = {
              ethAmount: state.userShouldReceive.ethAmount,
              usdcAmount: state.userShouldReceive.usdcAmount - stakedAmount,
            };
            logger.info(`[Execution] 📊 Updated context balance after stake: Deducted ${formatUnits(stakedAmount, 6)} USDC from return. Remaining: ${formatUnits(state.userShouldReceive.usdcAmount, 6)} USDC`);
          } else if (step.action === "unstake_eth") {
            // User unstaked ETH - calculate what was received (difference from before)
            const ethBefore = balanceBefore.eth || 0n;

            // Wait a moment for state to update
            await new Promise(resolve => setTimeout(resolve, 500));

            // Read balance after unstaking and calculate difference
            let ethBalanceAfter = await getAgentEthBalance();

            for (let attempt = 0; attempt < 5; attempt++) {
              if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }

              ethBalanceAfter = await getAgentEthBalance();
              const received = ethBalanceAfter - ethBefore;

              if (received > 0n) {
                break;
              }
            }

            // Calculate what was actually received from unstaking
            const unstakedAmount = ethBalanceAfter - ethBefore;

            if (unstakedAmount <= 0n) {
              logger.warn(`[Execution] ⚠️  No ETH received from unstaking. Balance unchanged.`);
            }

            // Add only what was received, not the full balance
            state.userShouldReceive = {
              ethAmount: state.userShouldReceive.ethAmount + (unstakedAmount > 0n ? unstakedAmount : 0n),
              usdcAmount: state.userShouldReceive.usdcAmount,
            };
            logger.info(`[Execution] 📊 Updated context balance after unstake: Added ${formatEther(unstakedAmount)} ETH to return (received from unstaking, not full wallet balance). Total: ${formatEther(state.userShouldReceive.ethAmount)} ETH`);
          } else if (step.action === "unstake_usdc") {
            // User unstaked USDC - calculate what was received (difference from before)
            const usdcBefore = balanceBefore.usdc || 0n;
            const usdcAddress = (config.USDC_ADDRESS_BASE_SEPOLIA || USDC_ADDRESS_BASE_SEPOLIA) as Address;

            // Wait a moment for state to update
            await new Promise(resolve => setTimeout(resolve, 500));

            // Read balance after unstaking and calculate difference
            let usdcBalanceAfter = await publicClient.readContract({
              address: usdcAddress,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [getAgentAccount().address],
            }) as bigint;

            for (let attempt = 0; attempt < 5; attempt++) {
              if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }

              usdcBalanceAfter = await publicClient.readContract({
                address: usdcAddress,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [getAgentAccount().address],
              }) as bigint;

              const received = usdcBalanceAfter - usdcBefore;

              if (received > 0n) {
                break;
              }
            }

            // Calculate what was actually received from unstaking
            const unstakedAmount = usdcBalanceAfter - usdcBefore;

            if (unstakedAmount <= 0n) {
              logger.warn(`[Execution] ⚠️  No USDC received from unstaking. Balance unchanged.`);
            }

            // Add only what was received, not the full balance
            state.userShouldReceive = {
              ethAmount: state.userShouldReceive.ethAmount,
              usdcAmount: state.userShouldReceive.usdcAmount + (unstakedAmount > 0n ? unstakedAmount : 0n),
            };
            logger.info(`[Execution] 📊 Updated context balance after unstake: Added ${formatUnits(unstakedAmount, 6)} USDC to return (received from unstaking, not full wallet balance). Total: ${formatUnits(state.userShouldReceive.usdcAmount, 6)} USDC`);
          }
        }

        // Generate result message from tool description
        result = tool.description.split(".")[0] || step.action;

        // Verify funds are received before proceeding to next step
        if (txHash) {
          await verifyFundsReceived(step, txHash, balanceBefore);
        }
      }

      // Mark step as completed
      if (stepStatus) {
        stepStatus.status = "completed";
        stepStatus.txHash = txHash;
        stepStatus.result = result;
      }

      logger.info(`[Execution] Step ${step.stepId} completed: ${step.action}`);
    } catch (error) {
      logger.error(`[Execution] Step ${step.stepId} failed:`, error);

      // Mark step as error
      if (stepStatus) {
        stepStatus.status = "error";
        stepStatus.error = error instanceof Error ? error.message : "Unknown error";
      }

      state.isComplete = true;
      state.error = `Step ${step.stepId} failed: ${error instanceof Error ? error.message : "Unknown error"}`;

      // Add rollback step to plan
      state.steps.push({
        stepId: 999,
        status: "running",
        result: "Returning user funds...",
      });

      // Attempt rollback - send back whatever assets exist
      // Wait for rollback to complete so we know if it succeeded
      try {
        await attemptRollback(executionId, step.stepId);

        // Mark rollback as completed
        const rollbackStep = state.steps.find((s) => s.stepId === 999);
        if (rollbackStep) {
          rollbackStep.status = "completed";
          rollbackStep.result = "User funds returned";
        }
      } catch (rollbackError) {
        logger.error(`[Execution] Rollback failed:`, rollbackError);

        // Mark rollback as error but don't fail the whole execution
        const rollbackStep = state.steps.find((s) => s.stepId === 999);
        if (rollbackStep) {
          rollbackStep.status = "error";
          rollbackStep.error = rollbackError instanceof Error ? rollbackError.message : "Failed to return funds";
        }
      }

      return;
    }
  }

  state.isComplete = true;
  logger.info(`[Execution] Execution ${executionId} completed successfully`);
}

// Contract execution functions have been moved to contractTools.ts
// They are now AgentKit tools that can be called by name

/**
 * Send exact amounts of ETH and/or USDC to destination
 * Used for rollback to return only the user's original amount
 */
async function sendExactAmounts(
  destination: Address,
  ethAmount: bigint,
  usdcAmount: bigint
): Promise<string> {
  const wallet = getAgentWallet();
  const account = getAgentAccount();
  const usdcAddress = (config.USDC_ADDRESS_BASE_SEPOLIA || USDC_ADDRESS_BASE_SEPOLIA) as Address;
  let txHashes: string[] = [];

  logger.info(`[SendExactAmounts] 📤 Sending exact amounts to ${destination}`);
  if (ethAmount > 0n) {
    logger.info(`[SendExactAmounts]    ETH: ${formatEther(ethAmount)} ETH`);
  }
  if (usdcAmount > 0n) {
    logger.info(`[SendExactAmounts]    USDC: ${formatUnits(usdcAmount, 6)} USDC`);
  }

  // Calculate gas reserve needed (one transaction if only ETH or USDC, two if both)
  const hasEth = ethAmount > 0n;
  const hasUsdc = usdcAmount > 0n;
  const numTransactions = (hasEth ? 1 : 0) + (hasUsdc ? 1 : 0);
  const gasReservePerTx = parseEther("0.0001");
  const totalGasNeeded = gasReservePerTx * BigInt(numTransactions);

  // Get current ETH balance to check if we have enough for gas
  const currentEthBalance = await getAgentEthBalance();

  // Send ETH if specified
  if (ethAmount > 0n) {
    // Make sure we have enough ETH for the transfer + gas
    if (currentEthBalance < ethAmount + totalGasNeeded) {
      logger.warn(`[SendExactAmounts] ⚠️  Not enough ETH. Have: ${formatEther(currentEthBalance)}, Need: ${formatEther(ethAmount + totalGasNeeded)}`);
      logger.warn(`[SendExactAmounts]    Will send what we can after reserving gas`);

      // Adjust amount to what we can send
      if (currentEthBalance <= totalGasNeeded) {
        logger.warn(`[SendExactAmounts] ⚠️  Cannot send ETH - insufficient for gas`);
        ethAmount = 0n;
      } else {
        const adjustedAmount = currentEthBalance - totalGasNeeded;
        logger.info(`[SendExactAmounts] 💡 Adjusting ETH amount to ${formatEther(adjustedAmount)} (after gas reserve)`);
        ethAmount = adjustedAmount;
      }
    }

    if (ethAmount > 0n) {
      try {
        logger.info(`[SendExactAmounts] 🚀 Sending ${formatEther(ethAmount)} ETH...`);
        const hash = await wallet.sendTransaction({
          account,
          to: destination,
          value: ethAmount,
        });
        logger.info(`[SendExactAmounts] ✅ ETH transaction sent! Hash: ${hash}`);
        logger.info(`[SendExactAmounts] 📋 View on Basescan: https://sepolia.basescan.org/tx/${hash}`);
        txHashes.push(hash);

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === "success") {
          logger.info(`[SendExactAmounts] ✅✅ ETH transfer confirmed! Block: ${receipt.blockNumber}`);
        } else {
          throw new Error("ETH transfer reverted");
        }
      } catch (error: any) {
        logger.error(`[SendExactAmounts] ❌ Failed to send ETH: ${error?.message}`);
        throw error;
      }
    }
  }

  // Send USDC if specified
  if (usdcAmount > 0n) {
    try {
      logger.info(`[SendExactAmounts] 🚀 Sending ${formatUnits(usdcAmount, 6)} USDC...`);
      const hash = await wallet.writeContract({
        account,
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [destination, usdcAmount],
      });
      logger.info(`[SendExactAmounts] ✅ USDC transaction sent! Hash: ${hash}`);
      logger.info(`[SendExactAmounts] 📋 View on Basescan: https://sepolia.basescan.org/tx/${hash}`);
      txHashes.push(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") {
        logger.info(`[SendExactAmounts] ✅✅ USDC transfer confirmed! Block: ${receipt.blockNumber}`);
      } else {
        throw new Error("USDC transfer reverted");
      }
    } catch (error: any) {
      logger.error(`[SendExactAmounts] ❌ Failed to send USDC: ${error?.message}`);
      throw error;
    }
  }

  if (txHashes.length === 0) {
    logger.warn(`[SendExactAmounts] ⚠️  No transactions were sent`);
    return "";
  }

  logger.info(`[SendExactAmounts] ✅ Completed - ${txHashes.length} transaction(s) sent`);
  return txHashes[0];
}

/**
 * Execute send remaining funds
 * Uses context balance to send only what user should receive based on swaps
 */
async function executeSendRemaining(executionId: string, step: PlanStep): Promise<string> {
  const wallet = getAgentWallet();
  const account = getAgentAccount();
  const destination = step.parameters.destination as Address;

  if (!destination) {
    throw new Error("Destination address not specified");
  }

  // Get execution state to access context balance
  const state = executionStates.get(executionId);
  if (!state) {
    throw new Error("Execution state not found");
  }

  let txHashes: string[] = [];

  // Get current balances
  logger.info(`[ExecuteSendRemaining] 📊 Checking current balances...`);
  const ethBalance = await getAgentEthBalance();
  const usdcAddress = (config.USDC_ADDRESS_BASE_SEPOLIA || USDC_ADDRESS_BASE_SEPOLIA) as Address;
  const usdcBalance = await publicClient.readContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  }) as bigint;

  logger.info(`[ExecuteSendRemaining] 💰 Current balances:`);
  logger.info(`[ExecuteSendRemaining]    ETH: ${formatEther(ethBalance)} ETH`);
  logger.info(`[ExecuteSendRemaining]    USDC: ${formatUnits(usdcBalance, 6)} USDC`);

  // Use context balance to determine what user should receive
  const userShouldReceive = state.userShouldReceive || {
    ethAmount: 0n,
    usdcAmount: 0n,
  };

  logger.info(`[ExecuteSendRemaining] 📋 Context balance - User should receive:`);
  logger.info(`[ExecuteSendRemaining]    ETH: ${formatEther(userShouldReceive.ethAmount)} ETH`);
  logger.info(`[ExecuteSendRemaining]    USDC: ${formatUnits(userShouldReceive.usdcAmount, 6)} USDC`);

  // IMPORTANT: Send USDC FIRST (doesn't require ETH for gas)
  // Send only what user should receive based on swaps
  const usdcToSend = userShouldReceive.usdcAmount > 0n
    ? (userShouldReceive.usdcAmount > usdcBalance ? usdcBalance : userShouldReceive.usdcAmount)
    : 0n;

  if (usdcToSend > 0n) {
    try {
      logger.info(`[ExecuteSendRemaining] 📤 Sending ${formatUnits(usdcToSend, 6)} USDC to ${destination} (from context balance)`);
      logger.info(`[ExecuteSendRemaining] 🚀 Executing USDC transfer...`);

      const hash = await wallet.writeContract({
        account,
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [destination, usdcToSend],
      });

      logger.info(`[ExecuteSendRemaining] ✅ USDC transaction sent! Hash: ${hash}`);
      logger.info(`[ExecuteSendRemaining] 📋 View on Basescan: https://sepolia.basescan.org/tx/${hash}`);
      txHashes.push(hash);

      logger.info(`[ExecuteSendRemaining] ⏳ Waiting for USDC confirmation...`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        logger.info(`[ExecuteSendRemaining] ✅✅ USDC transfer confirmed! Block: ${receipt.blockNumber}`);
      } else {
        logger.error(`[ExecuteSendRemaining] ❌ USDC transaction reverted!`);
        throw new Error("USDC transfer reverted");
      }
    } catch (error: any) {
      logger.error(`[ExecuteSendRemaining] ❌ Failed to send USDC: ${error}`);
      logger.error(`[ExecuteSendRemaining]    Error: ${error?.message}`);
      // Log but continue - try to send ETH anyway
    }
  }

  // Then send ETH if user should receive ETH - reserve gas for this
  const ethToSendFromContext = userShouldReceive.ethAmount > 0n
    ? (userShouldReceive.ethAmount > ethBalance ? ethBalance : userShouldReceive.ethAmount)
    : 0n;

  if (ethToSendFromContext > 0n) {
    // Use a smaller gas reserve (0.0001 ETH should be enough for Base Sepolia)
    const gasReserve = parseEther("0.0001");

    // Check if we already sent USDC (it needs gas, but USDC doesn't require ETH for gas)
    const hasUsdcSent = usdcToSend > 0n;

    logger.info(`[ExecuteSendRemaining] ⛽ Gas reserve: ${formatEther(gasReserve)} ETH`);
    logger.info(`[ExecuteSendRemaining] 💰 ETH to send (from context): ${formatEther(ethToSendFromContext)} ETH`);
    logger.info(`[ExecuteSendRemaining] 💰 Current ETH balance: ${formatEther(ethBalance)} ETH`);

    // Calculate sendable amount - reserve gas
    let ethToSend: bigint;

    if (ethBalance <= gasReserve) {
      // Balance is less than or equal to gas reserve - can't send anything
      logger.warn(`[ExecuteSendRemaining] ⚠️  Balance (${formatEther(ethBalance)}) is less than or equal to gas reserve (${formatEther(gasReserve)}).`);
      logger.warn(`[ExecuteSendRemaining]    Cannot return ETH - insufficient for gas.`);
      ethToSend = 0n; // Don't send
    } else if (ethToSendFromContext + gasReserve > ethBalance) {
      // Can't send full amount, but try to send what we can
      ethToSend = ethBalance - gasReserve;
      logger.info(`[ExecuteSendRemaining] 💸 Adjusted sendable (reserving gas): ${formatEther(ethToSend)} ETH`);
    } else {
      // We can send the full amount from context
      ethToSend = ethToSendFromContext;
      logger.info(`[ExecuteSendRemaining] 💸 Sending full context amount: ${formatEther(ethToSend)} ETH`);
    }

    // Try to send if we calculated an amount to send
    if (ethToSend > 0n) {
      try {
        logger.info(`[ExecuteSendRemaining] 📤 Attempting to send ${formatEther(ethToSend)} ETH to ${destination} (from context balance)`);
        logger.info(`[ExecuteSendRemaining] ⛽ Reserving ${formatEther(gasReserve)} ETH for gas`);

        logger.info(`[ExecuteSendRemaining] 🚀 Executing ETH transfer transaction...`);
        const hash = await wallet.sendTransaction({
          account,
          to: destination,
          value: ethToSend,
        });

        logger.info(`[ExecuteSendRemaining] ✅ Transaction sent! Hash: ${hash}`);
        logger.info(`[ExecuteSendRemaining] ⏳ Waiting for confirmation...`);

        txHashes.push(hash);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === "success") {
          logger.info(`[ExecuteSendRemaining] ✅✅ ETH transfer confirmed! Block: ${receipt.blockNumber}`);
        } else {
          logger.error(`[ExecuteSendRemaining] ❌ Transaction reverted!`);
          throw new Error("Transaction reverted");
        }
      } catch (error: any) {
        logger.error(`[ExecuteSendRemaining] ❌ Failed to send ETH: ${error}`);
        logger.error(`[ExecuteSendRemaining]    Error message: ${error?.message}`);
        logger.error(`[ExecuteSendRemaining]    Error details: ${JSON.stringify(error?.details || error, null, 2)}`);

        // If it's a gas error, try with even smaller amount (reserve more gas)
        if (error?.message?.includes("gas") || error?.message?.includes("allowance")) {
          logger.warn(`[ExecuteSendRemaining] ⚠️  Gas error - trying with larger gas reserve...`);

          // Try reserving more gas
          const largerReserve = parseEther("0.00015"); // Slightly larger
          if (ethBalance > largerReserve) {
            const ethToSendRetry = ethBalance - largerReserve;

            if (ethToSendRetry > 0n) {
              try {
                logger.info(`[ExecuteSendRemaining] 🔄 Retry: Sending ${formatEther(ethToSendRetry)} ETH with larger gas reserve (${formatEther(largerReserve)})`);

                const hash = await wallet.sendTransaction({
                  account,
                  to: destination,
                  value: ethToSendRetry,
                });

                logger.info(`[ExecuteSendRemaining] ✅ Retry transaction sent! Hash: ${hash}`);
                txHashes.push(hash);
                const receipt = await publicClient.waitForTransactionReceipt({ hash });

                if (receipt.status === "success") {
                  logger.info(`[ExecuteSendRemaining] ✅✅ ETH sent successfully on retry!`);
                } else {
                  throw new Error("Retry transaction reverted");
                }
              } catch (retryError: any) {
                logger.error(`[ExecuteSendRemaining] ❌ Failed even with larger reserve: ${retryError?.message}`);
                // Don't throw - we've tried our best
              }
            }
          }
        } else {
          // Re-throw non-gas errors
          throw error;
        }
      }
    }
  }


  if (txHashes.length === 0) {
    logger.warn(`[ExecuteSendRemaining] ⚠️  No transactions were sent - check logs above for reasons`);
  } else {
    logger.info(`[ExecuteSendRemaining] ✅ Completed - ${txHashes.length} transaction(s) sent`);
  }

  return txHashes[0] || ""; // Return first hash or empty
}


/**
 * Attempt rollback on failure - send back whatever assets the user has
 */
async function attemptRollback(executionId: string, failedStepId: number): Promise<void> {
  logger.info("========================================");
  logger.info(`[Execution] 🔄 STARTING ROLLBACK after step ${failedStepId} failure`);
  logger.info("========================================");

  const state = executionStates.get(executionId);
  if (!state) {
    logger.error("[Execution] ❌ Cannot rollback - execution state not found");
    return;
  }

  // For rollback, ALWAYS use user's EOA address from step 0 (where funds came from)
  // This ensures funds go back to the original sender, not to a smart wallet
  const step0 = state.plan.steps.find((s) => s.stepId === 0);
  let destination: Address | null = null;

  if (step0 && step0.parameters.from) {
    destination = step0.parameters.from as Address;
    logger.info(`[Execution] 📍 Using user EOA from step 0 as rollback destination: ${destination}`);
  } else if (state.plan.destinationAddress) {
    destination = state.plan.destinationAddress as Address;
    logger.info(`[Execution] 📍 Using plan destination address: ${destination}`);
  } else {
    logger.error("[Execution] ❌ Cannot rollback - cannot determine user address");
    logger.error("[Execution]    Step 0: ", JSON.stringify(step0, null, 2));
    logger.error("[Execution]    Plan destination: ", state.plan.destinationAddress);
    return;
  }

  // Determine what to return based on original user amount
  const originalAmount = state.originalUserAmount;
  if (!originalAmount) {
    logger.error("[Execution] ❌ Cannot rollback - original user amount not tracked");
    logger.error("[Execution]    This should not happen - Step 0 should have stored the amount");
    return;
  }

  logger.info(`[Execution] 🎯 Goal: Return user's original amount (${originalAmount.amount} ${originalAmount.token}) to ${destination}`);
  logger.info(`[Execution] 💾 Original amount in wei: ${originalAmount.amountWei.toString()}`);

  try {
    // Check agent wallet balances
    logger.info("[Execution] 📊 Checking agent wallet balances...");
    const ethBalance = await getAgentEthBalance();
    const account = getAgentAccount();
    const usdcAddress = (config.USDC_ADDRESS_BASE_SEPOLIA || USDC_ADDRESS_BASE_SEPOLIA) as Address;

    logger.info(`[Execution] 💰 Agent wallet ETH balance: ${formatEther(ethBalance)} ETH`);
    logger.info(`[Execution] 🔑 Agent wallet address: ${account.address}`);

    let usdcBalance = 0n;
    try {
      usdcBalance = await publicClient.readContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account.address],
      }) as bigint;
      logger.info(`[Execution] 💰 Agent wallet USDC balance: ${formatUnits(usdcBalance, 6)} USDC`);
    } catch (error) {
      logger.warn("[Execution] ⚠️  Could not check USDC balance:", error);
    }

    // Calculate what to return based on original amount and current balances
    let ethToReturn = 0n;
    let usdcToReturn = 0n;

    if (originalAmount.token === "ETH") {
      // User sent ETH - return the original ETH amount (or as much as we have)
      ethToReturn = originalAmount.amountWei <= ethBalance ? originalAmount.amountWei : ethBalance;
      logger.info(`[Execution] 💸 User sent ETH - will return ${formatEther(ethToReturn)} ETH (original: ${formatEther(originalAmount.amountWei)})`);

      if (ethBalance < originalAmount.amountWei) {
        logger.warn(`[Execution] ⚠️  Wallet has less ETH (${formatEther(ethBalance)}) than original amount (${formatEther(originalAmount.amountWei)})`);
        logger.warn(`[Execution]    Some ETH may have been spent on gas. Returning available amount.`);
      }
    } else if (originalAmount.token === "USDC") {
      // User sent USDC - return the original USDC amount (or as much as we have)
      usdcToReturn = originalAmount.amountWei <= usdcBalance ? originalAmount.amountWei : usdcBalance;
      logger.info(`[Execution] 💸 User sent USDC - will return ${formatUnits(usdcToReturn, 6)} USDC (original: ${formatUnits(originalAmount.amountWei, 6)})`);

      if (usdcBalance < originalAmount.amountWei) {
        logger.warn(`[Execution] ⚠️  Wallet has less USDC (${formatUnits(usdcBalance, 6)}) than original amount (${formatUnits(originalAmount.amountWei, 6)})`);
      }
    }

    if (ethToReturn === 0n && usdcToReturn === 0n) {
      logger.warn("[Execution] ⚠️  No assets to return (original amount not available in wallet)");
      logger.warn("[Execution]    Balance may have been spent on gas or failed transactions");
      return;
    }

    logger.info("[Execution] ✅ Assets calculated - proceeding with return...");
    if (ethToReturn > 0n) {
      logger.info(`[Execution]    ETH to return: ${formatEther(ethToReturn)} ETH`);
    }
    if (usdcToReturn > 0n) {
      logger.info(`[Execution]    USDC to return: ${formatUnits(usdcToReturn, 6)} USDC`);
    }

    // Create a custom send step that only returns the original amount
    logger.info("[Execution] 🚀 Calling executeSendRemaining to return funds...");

    let returnTxHash: string | undefined;
    try {
      // Send exact amounts (not all remaining funds)
      returnTxHash = await sendExactAmounts(destination, ethToReturn, usdcToReturn);

      if (returnTxHash) {
        logger.info(`[Execution] ✅ Return transaction hash: ${returnTxHash}`);
        logger.info(`[Execution] 📋 View on Basescan: https://sepolia.basescan.org/tx/${returnTxHash}`);

        // Update rollback step with transaction hash
        const rollbackStepStatus = state.steps.find((s) => s.stepId === 999);
        if (rollbackStepStatus) {
          rollbackStepStatus.txHash = returnTxHash;
        }
      } else {
        logger.warn(`[Execution] ⚠️  executeSendRemaining returned no transaction hash`);
      }
    } catch (sendError: any) {
      logger.error(`[Execution] ❌ executeSendRemaining threw error: ${sendError}`);
      logger.error(`[Execution]    Error message: ${sendError?.message}`);
      logger.error(`[Execution]    Error stack: ${sendError?.stack}`);
      throw sendError; // Re-throw so caller knows it failed
    }

    // Verify balances after sending
    logger.info("[Execution] 🔍 Verifying balances after return...");
    const finalEthBalance = await getAgentEthBalance();
    logger.info(`[Execution] 💰 Final agent wallet ETH balance: ${formatEther(finalEthBalance)} ETH`);

    logger.info("========================================");
    logger.info("[Execution] ✅ ROLLBACK COMPLETED - User funds returned");
    if (returnTxHash) {
      logger.info(`[Execution] 📋 Transaction: https://sepolia.basescan.org/tx/${returnTxHash}`);
    }
    logger.info("========================================");
  } catch (error: any) {
    logger.error("========================================");
    logger.error("[Execution] ❌ ROLLBACK FAILED");
    logger.error("========================================");
    logger.error("[Execution] Error details:", error);
    logger.error("[Execution] Error message:", error?.message);
    logger.error("[Execution] Error stack:", error?.stack);

    // If it's a gas error, log it but don't throw - we've done our best
    if (error?.message?.includes("gas") || error?.message?.includes("allowance")) {
      logger.error("[Execution] ⚠️  GAS ERROR: Agent wallet has insufficient gas to return funds");
      logger.error("[Execution] ⚠️  User should contact support to recover funds");
    }

    // Re-throw so caller knows rollback failed
    throw error;
  }
}
