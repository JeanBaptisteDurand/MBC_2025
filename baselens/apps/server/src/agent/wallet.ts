// ============================================
// Agent Wallet Management with Persistent Storage
// ============================================

import { createWalletClient, createPublicClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

let agentWallet: ReturnType<typeof createWalletClient> | null = null;
let agentAccount: ReturnType<typeof privateKeyToAccount> | null = null;

// Public client for reading blockchain state (balances, etc.)
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(config.BASE_SEPOLIA_RPC_URL),
});

// Persistent wallet storage path
const WALLET_DATA_DIR = join(process.cwd(), "data");
const WALLET_KEY_FILE = join(WALLET_DATA_DIR, "agent-wallet.key");

/**
 * Ensure data directory exists
 */
function ensureDataDirectory(): void {
  if (!existsSync(WALLET_DATA_DIR)) {
    mkdirSync(WALLET_DATA_DIR, { recursive: true });
    logger.info(`[AgentWallet] Created data directory: ${WALLET_DATA_DIR}`);
  }
}

/**
 * Load private key from persistent storage or environment
 * If neither exists, generate and save a new one
 */
function loadOrGeneratePrivateKey(): string {
  // Priority 1: Check persistent storage
  if (existsSync(WALLET_KEY_FILE)) {
    try {
      const storedKey = readFileSync(WALLET_KEY_FILE, "utf-8").trim();
      if (storedKey && storedKey.length >= 64) {
        logger.info(`[AgentWallet] Loaded private key from persistent storage`);
        return storedKey.startsWith("0x") ? storedKey : `0x${storedKey}`;
      }
    } catch (error) {
      logger.warn(`[AgentWallet] Failed to read wallet file, falling back to env: ${error}`);
    }
  }

  // Priority 2: Check environment variable
  if (config.AGENT_WALLET_PRIVATE_KEY) {
    const envKey = config.AGENT_WALLET_PRIVATE_KEY;
    logger.info(`[AgentWallet] Using private key from environment variable`);

    // Save to persistent storage for future use
    ensureDataDirectory();
    const cleanKey = envKey.startsWith("0x") ? envKey.slice(2) : envKey;
    writeFileSync(WALLET_KEY_FILE, cleanKey, "utf-8");
    logger.info(`[AgentWallet] Saved private key to persistent storage`);

    return envKey.startsWith("0x") ? envKey : `0x${envKey}`;
  }

  // Priority 3: Generate new key and save it
  logger.info(`[AgentWallet] No existing key found, generating new wallet...`);
  ensureDataDirectory();

  const newPrivateKey = generatePrivateKey();
  const cleanKey = newPrivateKey.startsWith("0x") ? newPrivateKey.slice(2) : newPrivateKey;

  writeFileSync(WALLET_KEY_FILE, cleanKey, "utf-8");
  logger.info(`[AgentWallet] ✅ Generated and saved new wallet private key`);
  logger.info(`[AgentWallet] Wallet file: ${WALLET_KEY_FILE}`);

  return newPrivateKey;
}

/**
 * Initialize the agent wallet with persistent storage
 * The wallet will be the same across server restarts
 */
export function initializeAgentWallet(): {
  account: ReturnType<typeof privateKeyToAccount>;
  wallet: ReturnType<typeof createWalletClient>;
} {
  if (agentWallet && agentAccount) {
    return { account: agentAccount, wallet: agentWallet };
  }

  // Load or generate private key (persistent)
  const privateKey = loadOrGeneratePrivateKey();

  // Ensure private key format
  const cleanPrivateKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;

  if (cleanPrivateKey.length !== 66) {
    throw new Error(`Invalid private key length: ${cleanPrivateKey.length}. Expected 66 characters (0x + 64 hex chars)`);
  }

  agentAccount = privateKeyToAccount(cleanPrivateKey as `0x${string}`);

  agentWallet = createWalletClient({
    account: agentAccount,
    chain: baseSepolia, // ✅ Base Sepolia configuration
    transport: http(config.BASE_SEPOLIA_RPC_URL),
  });

  logger.info(`[AgentWallet] ✅ Initialized agent wallet: ${agentAccount.address}`);
  logger.info(`[AgentWallet] Network: Base Sepolia (chainId: ${baseSepolia.id})`);
  logger.info(`[AgentWallet] RPC: ${config.BASE_SEPOLIA_RPC_URL}`);

  return { account: agentAccount, wallet: agentWallet };
}

/**
 * Get the agent wallet address
 */
export function getAgentWalletAddress(): Address {
  const { account } = initializeAgentWallet();
  return account.address;
}

/**
 * Get the agent wallet client
 */
export function getAgentWallet() {
  return initializeAgentWallet().wallet;
}

/**
 * Get the agent account
 */
export function getAgentAccount() {
  return initializeAgentWallet().account;
}

/**
 * Get ETH balance of agent wallet
 */
export async function getAgentEthBalance(): Promise<bigint> {
  const { account } = initializeAgentWallet();

  try {
    const balance = await publicClient.getBalance({ address: account.address });
    return balance;
  } catch (error) {
    logger.error("[AgentWallet] Failed to get ETH balance:", error);
    throw error;
  }
}

/**
 * Get the public client for reading blockchain state
 */
export function getPublicClient() {
  return publicClient;
}

/**
 * Get the wallet file path (for informational purposes)
 */
export function getWalletFilePath(): string {
  return WALLET_KEY_FILE;
}
