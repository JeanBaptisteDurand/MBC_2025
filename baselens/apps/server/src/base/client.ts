// ============================================
// Base RPC Client - viem-based blockchain client
// ============================================

import { createPublicClient, http, type Address, type Hex, type PublicClient } from "viem";
import { base, baseSepolia } from "viem/chains";
import type { Network } from "@baselens/core";
import { config } from "../config.js";
import { logger } from "../logger.js";

// Chain configurations
const chainConfigs = {
  "base-mainnet": {
    chain: base,
    rpcUrl: config.BASE_RPC_URL,
  },
  "base-sepolia": {
    chain: baseSepolia,
    rpcUrl: config.BASE_SEPOLIA_RPC_URL,
  },
} as const;

// Client cache
const clientCache = new Map<Network, PublicClient>();

/**
 * Get a viem public client for the specified network
 */
export function getClient(network: Network): PublicClient {
  let client = clientCache.get(network);
  
  if (!client) {
    const chainConfig = chainConfigs[network];
    logger.debug(`[RPC] Creating new client for ${network} using ${chainConfig.rpcUrl}`);
    client = createPublicClient({
      chain: chainConfig.chain,
      transport: http(chainConfig.rpcUrl),
    });
    clientCache.set(network, client);
  }
  
  return client;
}

/**
 * Get the bytecode of a contract
 */
export async function getCode(
  network: Network,
  address: Address
): Promise<Hex | undefined> {
  logger.info(`[RPC] eth_getCode for ${address}...`);
  const startTime = Date.now();
  
  const client = getClient(network);
  try {
    const code = await client.getCode({ address });
    const duration = Date.now() - startTime;
    
    if (code && code !== "0x") {
      logger.info(`[RPC] ✅ Got bytecode (${code.length} chars) in ${duration}ms`);
    } else {
      logger.info(`[RPC] ✅ Address is EOA (no code) in ${duration}ms`);
    }
    
    return code;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[RPC] ❌ eth_getCode failed (${duration}ms):`, error);
    throw error;
  }
}

/**
 * Check if an address is a contract (has code) or EOA
 */
export async function isContract(
  network: Network,
  address: Address
): Promise<boolean> {
  const code = await getCode(network, address);
  const isContractResult = code !== undefined && code !== "0x";
  logger.debug(`[RPC] ${address} isContract: ${isContractResult}`);
  return isContractResult;
}

/**
 * Read a storage slot from a contract
 */
export async function getStorageAt(
  network: Network,
  address: Address,
  slot: Hex
): Promise<Hex> {
  logger.debug(`[RPC] eth_getStorageAt ${address} slot ${slot}...`);
  const startTime = Date.now();
  
  const client = getClient(network);
  try {
    const value = await client.getStorageAt({ address, slot });
    const duration = Date.now() - startTime;
    logger.debug(`[RPC] ✅ Storage value: ${value} (${duration}ms)`);
    return value ?? "0x0";
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[RPC] ❌ eth_getStorageAt failed (${duration}ms):`, error);
    throw error;
  }
}

/**
 * Get the balance of an address
 */
export async function getBalance(
  network: Network,
  address: Address
): Promise<bigint> {
  logger.debug(`[RPC] eth_getBalance ${address}...`);
  const client = getClient(network);
  const balance = await client.getBalance({ address });
  logger.debug(`[RPC] ✅ Balance: ${balance}`);
  return balance;
}

/**
 * Get a transaction by hash
 */
export async function getTransaction(
  network: Network,
  txHash: Hex
) {
  logger.info(`[RPC] eth_getTransactionByHash ${txHash}...`);
  const client = getClient(network);
  const tx = await client.getTransaction({ hash: txHash });
  logger.info(`[RPC] ✅ Got transaction`);
  return tx;
}

/**
 * Get a transaction receipt
 */
export async function getTransactionReceipt(
  network: Network,
  txHash: Hex
) {
  logger.info(`[RPC] eth_getTransactionReceipt ${txHash}...`);
  const client = getClient(network);
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  logger.info(`[RPC] ✅ Got receipt, status: ${receipt.status}`);
  return receipt;
}

/**
 * Get logs for a contract
 */
export async function getLogs(
  network: Network,
  params: {
    address?: Address;
    fromBlock?: bigint;
    toBlock?: bigint | "latest";
  }
) {
  logger.info(`[RPC] eth_getLogs for ${params.address || "all"}...`);
  const startTime = Date.now();
  
  const client = getClient(network);
  try {
    // Get the latest block number if needed
    let toBlock = params.toBlock;
    if (toBlock === "latest") {
      toBlock = await client.getBlockNumber();
      logger.debug(`[RPC] Latest block: ${toBlock}`);
    }
    
    // Limit the range to avoid large queries
    const blockRange = 10000n;
    const from = params.fromBlock ?? (toBlock ? toBlock - blockRange : 0n);
    
    logger.debug(`[RPC] Fetching logs from block ${from} to ${toBlock}`);
    
    const logs = await client.getLogs({
      address: params.address,
      fromBlock: from,
      toBlock: toBlock,
    });
    
    const duration = Date.now() - startTime;
    logger.info(`[RPC] ✅ Got ${logs.length} logs (${duration}ms)`);
    return logs;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[RPC] ❌ eth_getLogs failed (${duration}ms):`, error);
    return [];
  }
}

/**
 * Get the current block number
 */
export async function getBlockNumber(network: Network): Promise<bigint> {
  logger.debug(`[RPC] eth_blockNumber...`);
  const client = getClient(network);
  const blockNumber = await client.getBlockNumber();
  logger.debug(`[RPC] ✅ Block number: ${blockNumber}`);
  return blockNumber;
}

/**
 * Get block details
 */
export async function getBlock(
  network: Network,
  blockNumber: bigint
) {
  logger.debug(`[RPC] eth_getBlockByNumber ${blockNumber}...`);
  const client = getClient(network);
  const block = await client.getBlock({ blockNumber });
  logger.debug(`[RPC] ✅ Got block ${blockNumber}`);
  return block;
}

// ============================================
// EIP-1967 Proxy Detection Slots
// ============================================

export const EIP1967_SLOTS = {
  // bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)
  IMPLEMENTATION: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as Hex,
  // bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
  ADMIN: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as Hex,
  // bytes32(uint256(keccak256('eip1967.proxy.beacon')) - 1)
  BEACON: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50" as Hex,
};

/**
 * Read an EIP-1967 slot and decode the address
 */
export async function readEip1967Slot(
  network: Network,
  contractAddress: Address,
  slot: Hex
): Promise<Address | null> {
  logger.debug(`[RPC] Reading EIP-1967 slot ${slot} for ${contractAddress}...`);
  
  try {
    const value = await getStorageAt(network, contractAddress, slot);
    
    // Check if the slot has a non-zero value
    if (value === "0x0" || value === "0x" + "0".repeat(64)) {
      logger.debug(`[RPC] Slot is empty/zero`);
      return null;
    }
    
    // Extract the address from the last 20 bytes (40 hex chars)
    const addressHex = "0x" + value.slice(-40);
    
    // Verify it's a valid address (not zero)
    if (addressHex === "0x" + "0".repeat(40)) {
      logger.debug(`[RPC] Extracted address is zero`);
      return null;
    }
    
    logger.debug(`[RPC] ✅ Extracted address: ${addressHex}`);
    return addressHex as Address;
  } catch (error) {
    logger.warn(`[RPC] Failed to read EIP-1967 slot ${slot}:`, error);
    return null;
  }
}

/**
 * Detect if a contract is an EIP-1967 proxy
 */
export async function detectEip1967Proxy(
  network: Network,
  address: Address
): Promise<{
  isProxy: boolean;
  implementationAddress: Address | null;
  adminAddress: Address | null;
  beaconAddress: Address | null;
}> {
  logger.info(`[RPC] Detecting EIP-1967 proxy pattern for ${address}...`);
  
  const [implementationAddress, adminAddress, beaconAddress] = await Promise.all([
    readEip1967Slot(network, address, EIP1967_SLOTS.IMPLEMENTATION),
    readEip1967Slot(network, address, EIP1967_SLOTS.ADMIN),
    readEip1967Slot(network, address, EIP1967_SLOTS.BEACON),
  ]);

  const isProxy = implementationAddress !== null || beaconAddress !== null;
  
  if (isProxy) {
    logger.info(`[RPC] ✅ ${address} IS an EIP-1967 proxy`);
    logger.info(`[RPC]   Implementation: ${implementationAddress || "N/A"}`);
    logger.info(`[RPC]   Admin: ${adminAddress || "N/A"}`);
    logger.info(`[RPC]   Beacon: ${beaconAddress || "N/A"}`);
  } else {
    logger.info(`[RPC] ${address} is NOT an EIP-1967 proxy`);
  }

  return {
    isProxy,
    implementationAddress,
    adminAddress,
    beaconAddress,
  };
}

// ============================================
// Minimal Proxy (EIP-1167) Detection
// ============================================

const MINIMAL_PROXY_PREFIX = "363d3d373d3d3d363d73";
const MINIMAL_PROXY_SUFFIX = "5af43d82803e903d91602b57fd5bf3";

/**
 * Detect if a contract is a minimal proxy (EIP-1167)
 */
export function detectMinimalProxy(bytecode: Hex): {
  isMinimalProxy: boolean;
  implementationAddress: Address | null;
} {
  logger.debug(`[RPC] Checking for EIP-1167 minimal proxy pattern...`);
  
  const cleanBytecode = bytecode.toLowerCase().replace("0x", "");
  
  if (
    cleanBytecode.startsWith(MINIMAL_PROXY_PREFIX) &&
    cleanBytecode.endsWith(MINIMAL_PROXY_SUFFIX)
  ) {
    // Extract the implementation address (20 bytes after prefix)
    const addressStart = MINIMAL_PROXY_PREFIX.length;
    const addressEnd = addressStart + 40;
    const implementationAddress = "0x" + cleanBytecode.slice(addressStart, addressEnd);
    
    logger.info(`[RPC] ✅ Detected EIP-1167 minimal proxy -> ${implementationAddress}`);
    
    return {
      isMinimalProxy: true,
      implementationAddress: implementationAddress as Address,
    };
  }
  
  logger.debug(`[RPC] Not a minimal proxy`);
  return {
    isMinimalProxy: false,
    implementationAddress: null,
  };
}

/**
 * Get RPC URL for a network (for external tools like Panoramix)
 */
export function getRpcUrl(network: Network): string {
  return chainConfigs[network].rpcUrl;
}
