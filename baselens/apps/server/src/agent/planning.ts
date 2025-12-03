// ============================================
// LLM Planning Module
// ============================================

import { chatCompletion } from "../ai/openai.js";
import { prisma } from "../db/prismaClient.js";
import { logger } from "../logger.js";
import { getAgentWalletAddress } from "./wallet.js";
import type { AgentPlan, PlanStep, SupportedToken, SupportedAction } from "./types.js";
import { parseEther, formatEther, parseUnits, formatUnits } from "viem";
import { getAvailableTools, CONTRACT_TOOLS, getTool } from "./contractTools.js";

const SUPPORTED_TOKENS = ["ETH", "USDC"];

// Get supported actions from AgentKit tools
const SUPPORTED_ACTIONS = getAvailableTools();

/**
 * Validate user message and extract tokens/actions
 */
export async function validateAndPlan(
  userMessage: string,
  userEOA: string,
  userSmartWallet?: string | null
): Promise<AgentPlan> {
  logger.info(`[Planning] Validating and planning for user ${userEOA}`);

  const agentWalletAddress = getAgentWalletAddress();

  // Get destination address (user-specified > smart wallet > EOA)
  const destinationAddress = await resolveDestinationAddress(
    userMessage,
    userEOA,
    userSmartWallet
  );

  // Build system prompt for LLM
  const systemPrompt = buildSystemPrompt(agentWalletAddress, destinationAddress);

  // Build user prompt
  const userPrompt = buildUserPrompt(userMessage, userEOA, userSmartWallet);

  try {
    // Call OpenAI to generate plan
    const planJson = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        model: "gpt-4o-mini",
        maxTokens: 2000,
        temperature: 0.3, // Lower temperature for more deterministic planning
      }
    );

    // Parse LLM response
    const plan = parsePlanResponse(planJson, agentWalletAddress, destinationAddress);

    // Validate the plan
    const validation = validatePlan(plan, userMessage);
    if (!validation.isValid) {
      return {
        isValid: false,
        error: validation.error,
        steps: [],
        initialToken: "ETH",
        initialAmount: "0",
      };
    }

    logger.info(`[Planning] Generated plan with ${plan.steps.length} steps`);
    return plan;
  } catch (error) {
    logger.error("[Planning] Failed to generate plan:", error);
    return {
      isValid: false,
      error: `Failed to generate plan: ${error instanceof Error ? error.message : "Unknown error"}`,
      steps: [],
      initialToken: "ETH",
      initialAmount: "0",
    };
  }
}

/**
 * Build system prompt for LLM
 */
function buildSystemPrompt(
  agentWalletAddress: string,
  destinationAddress: string
): string {
  // Get available AgentKit tools dynamically
  const availableTools = getAvailableTools();
  const toolsList = availableTools.map(toolName => {
    const tool = CONTRACT_TOOLS[toolName];
    return `  * ${toolName}: ${tool.description}`;
  }).join("\n");

  return `You are an onchain agent planner. Your job is to analyze user requests and generate a structured execution plan.

CONSTRAINTS:
- SUPPORTED TOKENS: ETH and USDC are both fully supported. USDC uses 6 decimals.
- ONLY support ETH and USDC tokens. Reject any other tokens.
- AVAILABLE AgentKit TOOLS (these are executed automatically):
${toolsList}
  * fund_agent: User sends tokens to agent wallet (Step 0 only, type: "onchainkit")
  * send_remaining: Send remaining funds back to user (final step, type: "agentkit")

NOTE: The above tools use AgentKit - they automatically handle contract interactions, gas estimation, transaction sending, and confirmation. You only need to specify the action name and parameters.

PLANNING RULES:
1. ALWAYS include Step 0 (fund_agent) as the first step with type "onchainkit"
   - Extract the token (must be exactly "ETH" or "USDC" - case-sensitive) and amount from user message
   - If user wants to send USDC, use token: "USDC" (uppercase)
   - If user wants to send ETH, use token: "ETH" (uppercase)
   - Set from: userEOA, to: agentWalletAddress
   
2. Generate Steps 1..N based on user's request (type: "agentkit")
   - Only use available AgentKit tools listed above
   - Map user intent to specific tool names (e.g., "swap_eth_to_usdc", "stake_usdc")
   - AgentKit tools automatically handle contract calls, gas, and confirmations
   
3. ALWAYS end with a send_remaining step (type: "agentkit")
   - Send all remaining ETH and USDC to destinationAddress

4. Amounts should be in human-readable format (e.g., "0.1" for ETH, "0.01" or "100" for USDC)
   - For ETH: use decimal format like "0.1", "0.5", etc. (18 decimals)
   - For USDC: use decimal format like "0.01", "0.1", "100", "1000", etc. (6 decimals)
   - USDC supports decimals: "0.01" means 0.01 USDC, "100" means 100 USDC
   - Always use the EXACT amount the user specifies, preserving decimals if mentioned
   - If user says "0.01 USDC", use "0.01" (not "100" or any other value)

5. If user requests unsupported tokens or actions, return an error in the error field.

OUTPUT FORMAT (valid JSON only):
{
  "isValid": true/false,
  "error": "Error message if invalid",
  "initialToken": "ETH" | "USDC",
  "initialAmount": "0.1",
  "steps": [
    {
      "stepId": 0,
      "type": "onchainkit",
      "action": "fund_agent",
      "parameters": {
        "token": "ETH",
        "amount": "0.1",
        "from": "0x...",
        "to": "${agentWalletAddress}",
        "label": "Send 0.1 ETH from user to agent wallet"
      }
    },
    {
      "stepId": 1,
      "type": "agentkit",
      "action": "swap_eth_to_usdc",
      "parameters": {
        "amount": "ALL",
        "label": "Swap all ETH to USDC"
      }
    },
    {
      "stepId": 2,
      "type": "agentkit",
      "action": "send_remaining",
      "parameters": {
        "destination": "${destinationAddress}",
        "label": "Send remaining funds to user"
      }
    }
  ]
}`;
}

/**
 * Build user prompt
 */
function buildUserPrompt(
  userMessage: string,
  userEOA: string,
  userSmartWallet?: string | null
): string {
  let prompt = `User message: "${userMessage}"\n\n`;
  prompt += `User EOA address: ${userEOA}\n`;
  if (userSmartWallet) {
    prompt += `User smart wallet address: ${userSmartWallet}\n`;
  }
  prompt += `\nGenerate a step-by-step plan to execute the user's request.`;
  return prompt;
}

/**
 * Parse LLM response into AgentPlan
 */
function parsePlanResponse(
  response: string,
  agentWalletAddress: string,
  destinationAddress: string
): AgentPlan {
  try {
    // Extract JSON from response (may be wrapped in markdown code blocks)
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);

    // Ensure all steps have proper structure
    const steps: PlanStep[] = (parsed.steps || []).map((step: any) => {
      const parameters = step.parameters || {};

      // Normalize token in Step 0 to uppercase (ETH or USDC)
      if (step.stepId === 0 && parameters.token) {
        const tokenUpper = String(parameters.token).toUpperCase();
        if (tokenUpper === "ETH" || tokenUpper === "USDC") {
          parameters.token = tokenUpper;
        }
      }

      return {
        stepId: step.stepId ?? 0,
        type: step.type === "onchainkit" ? "onchainkit" : "agentkit",
        action: step.action as SupportedAction,
        parameters,
      };
    });

    return {
      isValid: parsed.isValid !== false,
      error: parsed.error,
      steps,
      initialToken: parsed.initialToken || "ETH",
      initialAmount: parsed.initialAmount || "0",
      destinationAddress,
    };
  } catch (error) {
    logger.error("[Planning] Failed to parse LLM response:", error);
    logger.error("[Planning] Response was:", response);
    return {
      isValid: false,
      error: `Failed to parse plan: ${error instanceof Error ? error.message : "Unknown error"}`,
      steps: [],
      initialToken: "ETH",
      initialAmount: "0",
    };
  }
}

/**
 * Validate the generated plan
 */
function validatePlan(plan: AgentPlan, userMessage: string): {
  isValid: boolean;
  error?: string;
} {
  // Check if plan has error
  if (!plan.isValid || plan.error) {
    return { isValid: false, error: plan.error || "Plan marked as invalid" };
  }

  // Check for Step 0
  if (plan.steps.length === 0 || plan.steps[0].stepId !== 0) {
    return { isValid: false, error: "Plan must start with Step 0 (fund_agent)" };
  }

  const step0 = plan.steps[0];
  if (step0.type !== "onchainkit" || step0.action !== "fund_agent") {
    return { isValid: false, error: "Step 0 must be type 'onchainkit' with action 'fund_agent'" };
  }

  // Validate Step 0 token parameter - must be ETH or USDC
  const step0TokenRaw = step0.parameters?.token as string | undefined;
  if (!step0TokenRaw) {
    return {
      isValid: false,
      error: `Step 0 is missing token parameter. Must be ETH or USDC.`,
    };
  }
  const step0Token = step0TokenRaw.toUpperCase();
  if (!SUPPORTED_TOKENS.includes(step0Token)) {
    return {
      isValid: false,
      error: `Unsupported token in Step 0: "${step0TokenRaw}". Only ETH and USDC are supported.`,
    };
  }

  // Validate tokens mentioned in user message
  const mentionedTokens = extractTokensFromMessage(userMessage);
  for (const token of mentionedTokens) {
    if (!SUPPORTED_TOKENS.includes(token.toUpperCase())) {
      return {
        isValid: false,
        error: `Only ETH and USDC are supported at the moment. Token "${token}" is not supported.`,
      };
    }
  }

  // Validate actions in steps - check against AgentKit tools
  for (const step of plan.steps) {
    if (step.stepId === 0) continue; // Step 0 is validated above

    // Check if action is a valid AgentKit tool or send_remaining
    if (step.action !== "send_remaining" && !getTool(step.action)) {
      return {
        isValid: false,
        error: `Action "${step.action}" is not supported. Available AgentKit tools: ${SUPPORTED_ACTIONS.join(", ")}, plus send_remaining.`,
      };
    }
  }

  // Check for send_remaining at the end
  const lastStep = plan.steps[plan.steps.length - 1];
  if (lastStep.action !== "send_remaining") {
    return {
      isValid: false,
      error: "Plan must end with a send_remaining step",
    };
  }

  return { isValid: true };
}

/**
 * Extract tokens mentioned in user message (simple heuristic)
 */
function extractTokensFromMessage(message: string): string[] {
  const tokens: string[] = [];
  const upperMessage = message.toUpperCase();

  // Common token patterns
  if (upperMessage.includes("ETH") || upperMessage.includes("ETHER")) {
    tokens.push("ETH");
  }
  if (upperMessage.includes("USDC")) {
    tokens.push("USDC");
  }

  // Check for other common tokens that should be rejected
  const unsupportedTokens = ["BTC", "BTC", "USDT", "DAI", "WETH", "WBTC"];
  for (const token of unsupportedTokens) {
    if (upperMessage.includes(token)) {
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * Resolve destination address for remaining funds
 */
async function resolveDestinationAddress(
  userMessage: string,
  userEOA: string,
  userSmartWallet?: string | null
): Promise<string> {
  // Check if user explicitly mentioned a destination address
  const addressRegex = /0x[a-fA-F0-9]{40}/g;
  const mentionedAddresses = userMessage.match(addressRegex);

  if (mentionedAddresses && mentionedAddresses.length > 0) {
    logger.info(`[Planning] User specified destination: ${mentionedAddresses[0]}`);
    return mentionedAddresses[0];
  }

  // Check for "smart wallet" mention
  if (userMessage.toLowerCase().includes("smart wallet") && userSmartWallet) {
    logger.info(`[Planning] Using user's smart wallet: ${userSmartWallet}`);
    return userSmartWallet;
  }

  // Default: use smart wallet if available, otherwise EOA
  if (userSmartWallet) {
    logger.info(`[Planning] Using user's smart wallet as default: ${userSmartWallet}`);
    return userSmartWallet;
  }

  logger.info(`[Planning] Using user's EOA as default: ${userEOA}`);
  return userEOA;
}
