// ============================================
// AgentKit Setup and Initialization
// ============================================

import { logger } from "../logger.js";
import { config } from "../config.js";
import { getAgentWallet, getAgentAccount, getAgentWalletAddress } from "./wallet.js";

/**
 * AgentKit Tool Definition
 * Represents a tool that can be called by the LLM to interact with contracts
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      required?: boolean;
    }>;
    required?: string[];
  };
  handler: (params: Record<string, any>) => Promise<string>; // Returns transaction hash
}

/**
 * Initialize AgentKit tools
 * Uses existing private key wallet setup (AGENT_WALLET_PRIVATE_KEY)
 * 
 * NOTE: CDP API keys are NOT needed. We use a private key wallet directly.
 * CDP keys are only required if using Coinbase-managed wallets (CDP Wallet Provider).
 */
export async function initializeAgentKit() {
  const walletAddress = getAgentWalletAddress();

  logger.info(`[AgentKit] Initialized with private key wallet: ${walletAddress}`);
  logger.info(`[AgentKit] Network: Base Sepolia`);
  logger.info(`[AgentKit] Wallet Type: Private Key (no CDP keys needed)`);

  return {
    walletAddress,
    isInitialized: true,
    walletType: "private_key", // Using private key wallet, not CDP managed
  };
}

/**
 * Get AgentKit instance info
 */
export function getAgentKitInfo() {
  return {
    walletAddress: getAgentWalletAddress(),
    network: "base-sepolia",
    chainId: 84532,
  };
}
