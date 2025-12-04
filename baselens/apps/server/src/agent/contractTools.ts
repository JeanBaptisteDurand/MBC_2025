// ============================================
// Contract Tools - AgentKit Tool Definitions
// Automatically handles contract interactions using tool-based architecture
// ============================================

import { parseEther, parseUnits, formatEther, formatUnits, type Address } from "viem";
import { logger } from "../logger.js";
import { getAgentWallet, getAgentAccount, getAgentEthBalance, getPublicClient } from "./wallet.js";
import { TREASURY_SWAP_ADDRESS, TREASURY_SWAP_ABI, ERC20_ABI, USDC_ADDRESS_BASE_SEPOLIA } from "./treasurySwapAbi.js";
import { config } from "../config.js";
import type { AgentTool } from "./agentKitSetup.js";

const publicClient = getPublicClient();

/**
 * Safely serialize arguments for logging (handles BigInt)
 */
function serializeArgs(args: any[]): string {
  return JSON.stringify(
    args.map((arg) => {
      if (typeof arg === "bigint") {
        return arg.toString();
      }
      if (Array.isArray(arg)) {
        return arg.map((item) => (typeof item === "bigint" ? item.toString() : item));
      }
      return arg;
    })
  );
}

/**
 * Generic contract invocation helper
 * Handles all the boilerplate: logging, gas estimation, transaction, confirmation
 */
async function invokeContract(params: {
  contractAddress: Address;
  abi: readonly any[];
  functionName: string;
  args?: any[];
  value?: bigint;
  description: string;
}): Promise<string> {
  const wallet = getAgentWallet();
  const account = getAgentAccount();

  logger.info(`[AgentKit Tool] 📞 Calling contract: ${params.contractAddress}`);
  logger.info(`[AgentKit Tool] 📝 Function: ${params.functionName}`);
  logger.info(`[AgentKit Tool] 📋 Description: ${params.description}`);
  logger.info(`[AgentKit Tool] 👤 From: ${account.address}`);

  if (params.value) {
    logger.info(`[AgentKit Tool] 💰 Value: ${formatEther(params.value)} ETH (${params.value.toString()} wei)`);
  }

  if (params.args && params.args.length > 0) {
    logger.info(`[AgentKit Tool] 📥 Arguments: ${serializeArgs(params.args)}`);
  }

  // Estimate gas
  try {
    const estimatedGas = await publicClient.estimateGas({
      account,
      to: params.contractAddress,
      value: params.value || 0n,
      data: params.value ? "0x" as `0x${string}` : undefined,
    });
    logger.info(`[AgentKit Tool] ⛽ Estimated gas: ${estimatedGas.toString()}`);
  } catch (gasError: any) {
    logger.warn(`[AgentKit Tool] ⚠️  Could not estimate gas: ${gasError?.message}`);
  }

  // Send transaction
  logger.info(`[AgentKit Tool] 🚀 Sending transaction...`);

  const hash = await wallet.writeContract({
    account,
    address: params.contractAddress,
    abi: params.abi,
    functionName: params.functionName,
    args: params.args || [],
    value: params.value,
  });

  logger.info(`[AgentKit Tool] ✅ Transaction sent! Hash: ${hash}`);
  logger.info(`[AgentKit Tool] 📋 View on Basescan: https://sepolia.basescan.org/tx/${hash}`);

  // Wait for confirmation
  logger.info(`[AgentKit Tool] ⏳ Waiting for confirmation...`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  logger.info(`[AgentKit Tool] 📦 Transaction confirmed!`);
  logger.info(`[AgentKit Tool]    Block: ${receipt.blockNumber}`);
  logger.info(`[AgentKit Tool]    Gas used: ${receipt.gasUsed.toString()}`);
  logger.info(`[AgentKit Tool]    Status: ${receipt.status === "success" ? "✅ Success" : "❌ Reverted"}`);

  if (receipt.status === "reverted") {
    // Try to get revert reason if available
    let revertReason = "Unknown revert reason";
    try {
      // Attempt to decode revert reason if available in logs
      if (receipt.logs && receipt.logs.length > 0) {
        // Could decode logs here if needed
      }
    } catch (e) {
      // Ignore decode errors
    }

    logger.error(`[AgentKit Tool] ❌ Transaction reverted for: ${params.description}`);
    logger.error(`[AgentKit Tool]    Transaction hash: ${hash}`);
    logger.error(`[AgentKit Tool]    Block: ${receipt.blockNumber}`);
    logger.error(`[AgentKit Tool]    Gas used: ${receipt.gasUsed.toString()}`);

    throw new Error(`Transaction reverted: ${params.description}. Check treasury liquidity and contract reserves.`);
  }

  return hash;
}

/**
 * Get balance helper for amount resolution
 */
async function resolveAmount(
  amount: string,
  token: "ETH" | "USDC",
  balanceGetter: () => Promise<bigint>
): Promise<bigint> {
  if (amount === "ALL") {
    return await balanceGetter();
  }
  return token === "ETH" ? parseEther(amount) : parseUnits(amount, 6);
}

/**
 * Tool: Swap ETH to USDC
 */
export const swapEthToUsdcTool: AgentTool = {
  name: "swap_eth_to_usdc",
  description: "Swap ETH to USDC using the TreasurySwap contract. The ETH amount will be converted to USDC at a fixed 1:1 rate.",
  parameters: {
    type: "object",
    properties: {
      amount: {
        type: "string",
        description: "Amount of ETH to swap (e.g., '0.1' for 0.1 ETH) or 'ALL' to swap entire balance",
        required: true,
      },
    },
    required: ["amount"],
  },
  handler: async (params: { amount: string }) => {
    const balance = await getAgentEthBalance();

    // Reserve ETH for gas - we need gas for this swap AND future transactions
    // Reserve 0.0002 ETH for gas (0.0001 for swap + 0.0001 for future operations like send_remaining)
    const gasReserve = parseEther("0.0002");

    // Calculate available balance (after reserving gas)
    const availableBalance = balance > gasReserve ? balance - gasReserve : 0n;

    if (availableBalance === 0n) {
      throw new Error(`Cannot swap: insufficient ETH. Balance: ${formatEther(balance)} ETH, need at least ${formatEther(gasReserve)} ETH for gas.`);
    }

    // Resolve amount - if "ALL", use available balance (not full balance)
    const requestedAmount = await resolveAmount(params.amount, "ETH", () => Promise.resolve(availableBalance));

    // Ensure we don't swap more than available (after gas reserve)
    const amount = requestedAmount > availableBalance ? availableBalance : requestedAmount;

    if (amount === 0n) {
      throw new Error(`Cannot swap: available ETH (${formatEther(availableBalance)} ETH) is 0 after reserving gas.`);
    }

    logger.info(`[AgentKit Tool] 💰 Total balance: ${formatEther(balance)} ETH`);
    logger.info(`[AgentKit Tool] ⛽ Gas reserve: ${formatEther(gasReserve)} ETH`);
    logger.info(`[AgentKit Tool] 💸 Swapping: ${formatEther(amount)} ETH (${formatEther(availableBalance)} ETH available)`);

    // Preview the swap to validate amount and get expected USDC output
    try {
      const expectedUsdc = await publicClient.readContract({
        address: TREASURY_SWAP_ADDRESS,
        abi: TREASURY_SWAP_ABI,
        functionName: "previewSwapEthForUsdc",
        args: [amount],
      }) as bigint;

      logger.info(`[AgentKit Tool] Preview: ${formatEther(amount)} ETH → ${formatUnits(expectedUsdc, 6)} USDC`);

      if (expectedUsdc === 0n) {
        throw new Error(`Amount too small: ${formatEther(amount)} ETH converts to 0 USDC. Minimum is ~0.000001 ETH (1e-6)`);
      }
    } catch (previewError: any) {
      if (previewError?.message?.includes("Too small")) {
        throw new Error(`Amount too small to swap. Minimum is ~0.000001 ETH (0.000001 ETH = 1 USDC unit)`);
      }
      logger.warn(`[AgentKit Tool] Preview check failed: ${previewError?.message}`);
      // Continue anyway - the contract will reject if invalid
    }

    // Check treasury liquidity before swapping
    try {
      const treasuryBalances = await publicClient.readContract({
        address: TREASURY_SWAP_ADDRESS,
        abi: TREASURY_SWAP_ABI,
        functionName: "getTreasuryBalances",
        args: [],
      }) as [bigint, bigint];

      const [treasuryEth, treasuryUsdc] = treasuryBalances;
      const expectedUsdc = await publicClient.readContract({
        address: TREASURY_SWAP_ADDRESS,
        abi: TREASURY_SWAP_ABI,
        functionName: "previewSwapEthForUsdc",
        args: [amount],
      }) as bigint;

      logger.info(`[AgentKit Tool] Treasury balances: ${formatEther(treasuryEth)} ETH, ${formatUnits(treasuryUsdc, 6)} USDC`);
      logger.info(`[AgentKit Tool] Required USDC: ${formatUnits(expectedUsdc, 6)} USDC`);

      if (treasuryUsdc < expectedUsdc) {
        throw new Error(`Insufficient treasury USDC. Treasury has ${formatUnits(treasuryUsdc, 6)} USDC, need ${formatUnits(expectedUsdc, 6)} USDC. Please fund the treasury.`);
      }
    } catch (liquidityError: any) {
      if (liquidityError?.message?.includes("Insufficient")) {
        throw liquidityError;
      }
      logger.warn(`[AgentKit Tool] Liquidity check failed: ${liquidityError?.message}`);
      // Continue anyway - contract will reject if insufficient
    }

    return await invokeContract({
      contractAddress: TREASURY_SWAP_ADDRESS,
      abi: TREASURY_SWAP_ABI,
      functionName: "swapEthForUsdc",
      value: amount,
      description: `Swap ${formatEther(amount)} ETH to USDC`,
    });
  },
};

/**
 * Tool: Swap USDC to ETH
 */
export const swapUsdcToEthTool: AgentTool = {
  name: "swap_usdc_to_eth",
  description: "Swap USDC to ETH using the TreasurySwap contract. The USDC amount will be converted to ETH at a fixed 1:1 rate. Requires USDC approval first.",
  parameters: {
    type: "object",
    properties: {
      amount: {
        type: "string",
        description: "Amount of USDC to swap (e.g., '100' for 100 USDC) or 'ALL' to swap entire balance",
        required: true,
      },
    },
    required: ["amount"],
  },
  handler: async (params: { amount: string }) => {
    const usdcAddress = (config.USDC_ADDRESS_BASE_SEPOLIA || USDC_ADDRESS_BASE_SEPOLIA) as Address;
    const account = getAgentAccount();

    // Get USDC balance
    const usdcBalance = await publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    }) as bigint;

    const amount = await resolveAmount(params.amount, "USDC", () => Promise.resolve(usdcBalance));

    if (amount === 0n) {
      throw new Error("Cannot swap: agent wallet has no USDC balance");
    }

    // Preview the swap to validate amount and get expected ETH output
    try {
      const expectedEth = await publicClient.readContract({
        address: TREASURY_SWAP_ADDRESS,
        abi: TREASURY_SWAP_ABI,
        functionName: "previewSwapUsdcForEth",
        args: [amount],
      }) as bigint;

      logger.info(`[AgentKit Tool] Preview: ${formatUnits(amount, 6)} USDC → ${formatEther(expectedEth)} ETH`);

      if (expectedEth === 0n) {
        throw new Error(`Amount too small: ${formatUnits(amount, 6)} USDC converts to 0 ETH`);
      }
    } catch (previewError: any) {
      logger.warn(`[AgentKit Tool] Preview check failed: ${previewError?.message}`);
      // Continue anyway - the contract will reject if invalid
    }

    // Check treasury liquidity before swapping
    try {
      const treasuryBalances = await publicClient.readContract({
        address: TREASURY_SWAP_ADDRESS,
        abi: TREASURY_SWAP_ABI,
        functionName: "getTreasuryBalances",
        args: [],
      }) as [bigint, bigint];

      const [treasuryEth, treasuryUsdc] = treasuryBalances;
      const expectedEth = await publicClient.readContract({
        address: TREASURY_SWAP_ADDRESS,
        abi: TREASURY_SWAP_ABI,
        functionName: "previewSwapUsdcForEth",
        args: [amount],
      }) as bigint;

      logger.info(`[AgentKit Tool] Treasury balances: ${formatEther(treasuryEth)} ETH, ${formatUnits(treasuryUsdc, 6)} USDC`);
      logger.info(`[AgentKit Tool] Required ETH: ${formatEther(expectedEth)} ETH`);

      if (treasuryEth < expectedEth) {
        throw new Error(`Insufficient treasury ETH. Treasury has ${formatEther(treasuryEth)} ETH, need ${formatEther(expectedEth)} ETH. Please fund the treasury.`);
      }
    } catch (liquidityError: any) {
      if (liquidityError?.message?.includes("Insufficient")) {
        throw liquidityError;
      }
      logger.warn(`[AgentKit Tool] Liquidity check failed: ${liquidityError?.message}`);
      // Continue anyway - contract will reject if insufficient
    }

    // First, approve TreasurySwap to spend USDC
    logger.info(`[AgentKit Tool] 🔐 Approving ${formatUnits(amount, 6)} USDC for swap...`);

    const approveHash = await invokeContract({
      contractAddress: usdcAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [TREASURY_SWAP_ADDRESS, amount],
      description: `Approve ${formatUnits(amount, 6)} USDC for swap`,
    });

    await publicClient.waitForTransactionReceipt({ hash: approveHash as `0x${string}` });

    // Then swap
    return await invokeContract({
      contractAddress: TREASURY_SWAP_ADDRESS,
      abi: TREASURY_SWAP_ABI,
      functionName: "swapUsdcForEth",
      args: [amount],
      description: `Swap ${formatUnits(amount, 6)} USDC to ETH`,
    });
  },
};

/**
 * Tool: Stake ETH (deposit into contract)
 */
export const stakeEthTool: AgentTool = {
  name: "stake_eth",
  description: "Deposit ETH into the TreasurySwap contract to stake it. The ETH will be credited to the agent's internal balance.",
  parameters: {
    type: "object",
    properties: {
      amount: {
        type: "string",
        description: "Amount of ETH to stake (e.g., '0.1' for 0.1 ETH) or 'ALL' to stake entire balance",
        required: true,
      },
    },
    required: ["amount"],
  },
  handler: async (params: { amount: string }) => {
    const balance = await getAgentEthBalance();

    // Reserve ETH for gas - we need gas for this stake transaction AND future transactions
    // Reserve 0.0002 ETH for gas (0.0001 for stake + 0.0001 for future operations like send_remaining)
    const gasReserve = parseEther("0.0002");

    // Calculate available balance (after reserving gas)
    const availableBalance = balance > gasReserve ? balance - gasReserve : 0n;

    if (availableBalance === 0n) {
      throw new Error(`Cannot stake: insufficient ETH. Balance: ${formatEther(balance)} ETH, need at least ${formatEther(gasReserve)} ETH for gas.`);
    }

    // Resolve amount - if "ALL", use available balance (not full balance)
    const requestedAmount = await resolveAmount(params.amount, "ETH", () => Promise.resolve(availableBalance));

    // Ensure we don't stake more than available (after gas reserve)
    const amount = requestedAmount > availableBalance ? availableBalance : requestedAmount;

    if (amount === 0n) {
      throw new Error(`Cannot stake: available ETH (${formatEther(availableBalance)} ETH) is 0 after reserving gas.`);
    }

    logger.info(`[AgentKit Tool] 💰 Total balance: ${formatEther(balance)} ETH`);
    logger.info(`[AgentKit Tool] ⛽ Gas reserve: ${formatEther(gasReserve)} ETH`);
    logger.info(`[AgentKit Tool] 💸 Staking: ${formatEther(amount)} ETH (${formatEther(availableBalance)} ETH available)`);

    return await invokeContract({
      contractAddress: TREASURY_SWAP_ADDRESS,
      abi: TREASURY_SWAP_ABI,
      functionName: "depositEth",
      value: amount,
      description: `Stake ${formatEther(amount)} ETH`,
    });
  },
};

/**
 * Tool: Stake USDC (deposit into contract)
 */
export const stakeUsdcTool: AgentTool = {
  name: "stake_usdc",
  description: "Deposit USDC into the TreasurySwap contract to stake it. The USDC will be credited to the agent's internal balance. Requires USDC approval first.",
  parameters: {
    type: "object",
    properties: {
      amount: {
        type: "string",
        description: "Amount of USDC to stake (e.g., '100' for 100 USDC) or 'ALL' to stake entire balance",
        required: true,
      },
    },
    required: ["amount"],
  },
  handler: async (params: { amount: string }) => {
    const usdcAddress = (config.USDC_ADDRESS_BASE_SEPOLIA || USDC_ADDRESS_BASE_SEPOLIA) as Address;
    const account = getAgentAccount();

    // Get USDC balance
    const usdcBalance = await publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    }) as bigint;

    const amount = await resolveAmount(params.amount, "USDC", () => Promise.resolve(usdcBalance));

    if (amount === 0n) {
      throw new Error("Cannot stake: agent wallet has no USDC balance");
    }

    // First, approve TreasurySwap to spend USDC
    logger.info(`[AgentKit Tool] 🔐 Approving ${formatUnits(amount, 6)} USDC for staking...`);

    const approveHash = await invokeContract({
      contractAddress: usdcAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [TREASURY_SWAP_ADDRESS, amount],
      description: `Approve ${formatUnits(amount, 6)} USDC for staking`,
    });

    await publicClient.waitForTransactionReceipt({ hash: approveHash as `0x${string}` });

    // Then deposit
    return await invokeContract({
      contractAddress: TREASURY_SWAP_ADDRESS,
      abi: TREASURY_SWAP_ABI,
      functionName: "depositUsdc",
      args: [amount],
      description: `Stake ${formatUnits(amount, 6)} USDC`,
    });
  },
};

/**
 * Tool: Unstake/Withdraw ETH (withdraw from contract)
 */
export const unstakeEthTool: AgentTool = {
  name: "unstake_eth",
  description: "Withdraw ETH from the TreasurySwap contract. The ETH will be sent back to the agent wallet from the internal balance.",
  parameters: {
    type: "object",
    properties: {
      amount: {
        type: "string",
        description: "Amount of ETH to unstake/withdraw (e.g., '0.1' for 0.1 ETH) or 'ALL' to unstake entire staked balance",
        required: true,
      },
    },
    required: ["amount"],
  },
  handler: async (params: { amount: string }) => {
    const account = getAgentAccount();

    // Get staked balance from contract using getUserBalances
    const userBalances = await publicClient.readContract({
      address: TREASURY_SWAP_ADDRESS,
      abi: TREASURY_SWAP_ABI,
      functionName: "getUserBalances",
      args: [account.address],
    }) as [bigint, bigint];

    const stakedBalance = userBalances[0]; // ETH balance

    if (stakedBalance === 0n) {
      throw new Error("Cannot unstake: agent wallet has no staked ETH balance");
    }

    const amount = params.amount === "ALL"
      ? stakedBalance
      : parseEther(params.amount);

    if (amount > stakedBalance) {
      throw new Error(`Cannot unstake ${formatEther(amount)} ETH: only ${formatEther(stakedBalance)} ETH is staked`);
    }

    return await invokeContract({
      contractAddress: TREASURY_SWAP_ADDRESS,
      abi: TREASURY_SWAP_ABI,
      functionName: "withdrawEth",
      args: [amount],
      description: `Unstake ${formatEther(amount)} ETH`,
    });
  },
};

/**
 * Tool: Unstake/Withdraw USDC (withdraw from contract)
 */
export const unstakeUsdcTool: AgentTool = {
  name: "unstake_usdc",
  description: "Withdraw USDC from the TreasurySwap contract. The USDC will be sent back to the agent wallet from the internal balance.",
  parameters: {
    type: "object",
    properties: {
      amount: {
        type: "string",
        description: "Amount of USDC to unstake/withdraw (e.g., '100' for 100 USDC) or 'ALL' to unstake entire staked balance",
        required: true,
      },
    },
    required: ["amount"],
  },
  handler: async (params: { amount: string }) => {
    const account = getAgentAccount();

    // Get staked balance from contract using getUserBalances
    const userBalances = await publicClient.readContract({
      address: TREASURY_SWAP_ADDRESS,
      abi: TREASURY_SWAP_ABI,
      functionName: "getUserBalances",
      args: [account.address],
    }) as [bigint, bigint];

    const stakedBalance = userBalances[1]; // USDC balance

    if (stakedBalance === 0n) {
      throw new Error("Cannot unstake: agent wallet has no staked USDC balance");
    }

    const amount = params.amount === "ALL"
      ? stakedBalance
      : parseUnits(params.amount, 6);

    if (amount > stakedBalance) {
      throw new Error(`Cannot unstake ${formatUnits(amount, 6)} USDC: only ${formatUnits(stakedBalance, 6)} USDC is staked`);
    }

    return await invokeContract({
      contractAddress: TREASURY_SWAP_ADDRESS,
      abi: TREASURY_SWAP_ABI,
      functionName: "withdrawUsdc",
      args: [amount],
      description: `Unstake ${formatUnits(amount, 6)} USDC`,
    });
  },
};

/**
 * Tool Registry - All available tools
 */
export const CONTRACT_TOOLS: Record<string, AgentTool> = {
  swap_eth_to_usdc: swapEthToUsdcTool,
  swap_usdc_to_eth: swapUsdcToEthTool,
  stake_eth: stakeEthTool,
  stake_usdc: stakeUsdcTool,
  unstake_eth: unstakeEthTool,
  unstake_usdc: unstakeUsdcTool,
};

/**
 * Get tool by name
 */
export function getTool(toolName: string): AgentTool | undefined {
  return CONTRACT_TOOLS[toolName];
}

/**
 * Get all available tool names
 */
export function getAvailableTools(): string[] {
  return Object.keys(CONTRACT_TOOLS);
}

/**
 * Execute a tool by name
 */
export async function executeTool(toolName: string, parameters: Record<string, any>): Promise<string> {
  const tool = getTool(toolName);

  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}. Available tools: ${getAvailableTools().join(", ")}`);
  }

  logger.info(`[AgentKit] 🛠️  Executing tool: ${toolName}`);
  logger.info(`[AgentKit] 📋 Parameters: ${JSON.stringify(parameters, null, 2)}`);

  try {
    const txHash = await tool.handler(parameters);
    logger.info(`[AgentKit] ✅ Tool ${toolName} executed successfully. TX: ${txHash}`);
    return txHash;
  } catch (error: any) {
    logger.error(`[AgentKit] ❌ Tool ${toolName} failed: ${error?.message}`);
    throw error;
  }
}
