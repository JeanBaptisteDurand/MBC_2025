// ============================================
// Basescan Explorer API Client
// ============================================

import type { Network, AbiItem } from "@baselens/core";
import { config } from "../config.js";
import { logger } from "../logger.js";

// Basescan API base URLs
const BASESCAN_URLS = {
  "base-mainnet": "https://api.basescan.org/api",
  "base-sepolia": "https://api-sepolia.basescan.org/api",
} as const;

// ============================================
// Rate Limiter - 2 calls per second (strict)
// ============================================

const RATE_LIMIT_CALLS = 2;
const RATE_LIMIT_WINDOW_MS = 1000; // 1 second
const MIN_DELAY_BETWEEN_CALLS_MS = 500; // At least 500ms between calls
let lastCallTime = 0;
const callTimestamps: number[] = [];

/**
 * Wait if necessary to respect rate limits
 * Ensures max 2 calls per second with minimum 500ms between calls
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  
  // Ensure minimum delay between calls (500ms = max 2 per second)
  const timeSinceLastCall = now - lastCallTime;
  if (lastCallTime > 0 && timeSinceLastCall < MIN_DELAY_BETWEEN_CALLS_MS) {
    const waitTime = MIN_DELAY_BETWEEN_CALLS_MS - timeSinceLastCall + 10; // +10ms buffer
    logger.info(`[Basescan] ⏳ Rate limit: waiting ${waitTime}ms (min delay between calls)`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  
  // Also check sliding window (extra safety)
  const checkTime = Date.now();
  while (callTimestamps.length > 0 && callTimestamps[0] < checkTime - RATE_LIMIT_WINDOW_MS) {
    callTimestamps.shift();
  }
  
  if (callTimestamps.length >= RATE_LIMIT_CALLS) {
    const oldestCall = callTimestamps[0];
    const waitTime = oldestCall + RATE_LIMIT_WINDOW_MS - checkTime + 50;
    
    if (waitTime > 0) {
      logger.info(`[Basescan] ⏳ Rate limit: waiting ${waitTime}ms (${callTimestamps.length} calls in window)`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
  
  // Record this call
  lastCallTime = Date.now();
  callTimestamps.push(lastCallTime);
  
  // Keep only recent timestamps
  while (callTimestamps.length > 10) {
    callTimestamps.shift();
  }
  
  logger.debug(`[Basescan] Rate limit: ${callTimestamps.length}/${RATE_LIMIT_CALLS} calls in last second`);
}

// ============================================
// Types
// ============================================

interface BasescanResponse<T> {
  status: "0" | "1";
  message: string;
  result: T | string; // string when error
}

interface SourceCodeResult {
  SourceCode: string;
  ABI: string;
  ContractName: string;
  CompilerVersion: string;
  OptimizationUsed: string;
  Runs: string;
  ConstructorArguments: string;
  EVMVersion: string;
  Library: string;
  LicenseType: string;
  Proxy: string;
  Implementation: string;
  SwarmSource: string;
}

interface ContractCreationResult {
  contractAddress: string;
  contractCreator: string;
  txHash: string;
}

/**
 * Make a request to Basescan API (with rate limiting)
 */
async function basescanRequest<T>(
  network: Network,
  params: Record<string, string>
): Promise<T | null> {
  // Wait for rate limit before making the request
  await waitForRateLimit();
  
  const baseUrl = BASESCAN_URLS[network];
  const apiKey = config.BASESCAN_API_KEY;
  
  const searchParams = new URLSearchParams({
    ...params,
    apikey: apiKey || "",
  });
  
  const url = `${baseUrl}?${searchParams.toString()}`;
  const action = params.action || "unknown";
  
  logger.info(`[Basescan] API call: ${params.module}/${action} for ${params.address || params.contractaddresses || "N/A"}`);
  logger.debug(`[Basescan] Full URL: ${url.replace(apiKey || "", "***API_KEY***")}`);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(url);
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      logger.error(`[Basescan] ❌ HTTP error: ${response.status} ${response.statusText} (${duration}ms)`);
      return null;
    }
    
    const data = (await response.json()) as BasescanResponse<T>;
    
    if (data.status === "0") {
      // Check if it's a rate limit or actual error
      if (typeof data.result === "string" && data.result.includes("rate limit")) {
        logger.warn(`[Basescan] ⚠️ Rate limit hit despite throttling, waiting 2s... (${duration}ms)`);
        await new Promise((r) => setTimeout(r, 2000));
        return basescanRequest(network, params);
      }
      
      // "Contract source code not verified" is expected for unverified contracts
      if (typeof data.result === "string" && data.result.includes("not verified")) {
        logger.info(`[Basescan] Contract not verified (${duration}ms)`);
        return null;
      }
      
      logger.warn(`[Basescan] ⚠️ API returned status 0: ${data.message} - ${data.result} (${duration}ms)`);
      return null;
    }
    
    logger.info(`[Basescan] ✅ ${action} success (${duration}ms)`);
    return data.result as T;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[Basescan] ❌ Request failed (${duration}ms):`, error);
    return null;
  }
}

/**
 * Get contract ABI from Basescan
 */
export async function getContractAbi(
  network: Network,
  address: string
): Promise<AbiItem[] | null> {
  logger.info(`[Basescan] Fetching ABI for ${address}...`);
  
  const result = await basescanRequest<string>(network, {
    module: "contract",
    action: "getabi",
    address,
  });
  
  if (!result) {
    logger.warn(`[Basescan] No ABI found for ${address}`);
    return null;
  }
  
  try {
    const abi = JSON.parse(result) as AbiItem[];
    logger.info(`[Basescan] ✅ Parsed ABI with ${abi.length} items`);
    return abi;
  } catch (e) {
    logger.error(`[Basescan] ❌ Failed to parse ABI JSON for ${address}:`, e);
    return null;
  }
}

/**
 * Get contract source code from Basescan
 */
export async function getContractSourceCode(
  network: Network,
  address: string
): Promise<{
  verified: boolean;
  contractName: string;
  compilerVersion: string;
  abi: AbiItem[];
  sourceFiles: { path: string; content: string }[];
  isProxy: boolean;
  implementationAddress: string | null;
} | null> {
  logger.info(`[Basescan] Fetching source code for ${address}...`);
  
  const result = await basescanRequest<SourceCodeResult[]>(network, {
    module: "contract",
    action: "getsourcecode",
    address,
  });
  
  if (!result || result.length === 0) {
    logger.warn(`[Basescan] No source code result for ${address}`);
    return null;
  }
  
  const data = result[0];
  
  // Check if source is verified
  if (!data.SourceCode || data.ABI === "Contract source code not verified") {
    logger.info(`[Basescan] Contract ${address} is NOT verified`);
    return {
      verified: false,
      contractName: "",
      compilerVersion: "",
      abi: [],
      sourceFiles: [],
      isProxy: false,
      implementationAddress: null,
    };
  }
  
  logger.info(`[Basescan] ✅ Contract ${address} IS verified: ${data.ContractName}`);
  logger.debug(`[Basescan] Compiler: ${data.CompilerVersion}, Proxy: ${data.Proxy}, Impl: ${data.Implementation || "N/A"}`);
  
  // Parse ABI
  let abi: AbiItem[] = [];
  try {
    abi = JSON.parse(data.ABI) as AbiItem[];
    logger.debug(`[Basescan] Parsed ${abi.length} ABI items`);
  } catch (e) {
    logger.warn(`[Basescan] Failed to parse ABI for ${address}:`, e);
  }
  
  // Parse source files
  const sourceFiles: { path: string; content: string }[] = [];
  
  // Check if source code is a JSON object (multi-file format)
  if (data.SourceCode.startsWith("{") || data.SourceCode.startsWith("{{")) {
    try {
      // Handle double-braced format
      let sourceJson = data.SourceCode;
      if (sourceJson.startsWith("{{")) {
        sourceJson = sourceJson.slice(1, -1);
      }
      
      const parsed = JSON.parse(sourceJson);
      
      // Check for "sources" key (Solidity standard JSON input format)
      if (parsed.sources) {
        for (const [path, fileData] of Object.entries(parsed.sources)) {
          const content = (fileData as { content: string }).content;
          if (content) {
            sourceFiles.push({ path, content });
          }
        }
        logger.info(`[Basescan] Parsed ${sourceFiles.length} source files (standard JSON format)`);
      } else {
        // Direct file mapping
        for (const [path, content] of Object.entries(parsed)) {
          if (typeof content === "string") {
            sourceFiles.push({ path, content });
          } else if ((content as { content: string }).content) {
            sourceFiles.push({ path, content: (content as { content: string }).content });
          }
        }
        logger.info(`[Basescan] Parsed ${sourceFiles.length} source files (direct mapping)`);
      }
    } catch (e) {
      logger.warn(`[Basescan] Failed to parse multi-file source for ${address}, treating as single file:`, e);
      sourceFiles.push({
        path: `${data.ContractName || "Contract"}.sol`,
        content: data.SourceCode,
      });
    }
  } else {
    // Single file source code
    sourceFiles.push({
      path: `${data.ContractName || "Contract"}.sol`,
      content: data.SourceCode,
    });
    logger.info(`[Basescan] Single source file: ${data.ContractName || "Contract"}.sol (${data.SourceCode.length} chars)`);
  }
  
  return {
    verified: true,
    contractName: data.ContractName,
    compilerVersion: data.CompilerVersion,
    abi,
    sourceFiles,
    isProxy: data.Proxy === "1",
    implementationAddress: data.Implementation || null,
  };
}

/**
 * Get contract creator and creation transaction
 */
export async function getContractCreation(
  network: Network,
  addresses: string[]
): Promise<Map<string, { creator: string; txHash: string }>> {
  logger.info(`[Basescan] Fetching creation info for ${addresses.length} contracts...`);
  
  const result = new Map<string, { creator: string; txHash: string }>();
  
  // Basescan supports up to 5 addresses per request
  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += 5) {
    chunks.push(addresses.slice(i, i + 5));
  }
  
  logger.debug(`[Basescan] Split into ${chunks.length} chunks of max 5 addresses`);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    logger.debug(`[Basescan] Fetching chunk ${i + 1}/${chunks.length}: ${chunk.join(", ")}`);
    
    const data = await basescanRequest<ContractCreationResult[]>(network, {
      module: "contract",
      action: "getcontractcreation",
      contractaddresses: chunk.join(","),
    });
    
    if (data) {
      for (const item of data) {
        result.set(item.contractAddress.toLowerCase(), {
          creator: item.contractCreator,
          txHash: item.txHash,
        });
        logger.debug(`[Basescan] Creator of ${item.contractAddress.slice(0, 10)}...: ${item.contractCreator.slice(0, 10)}...`);
      }
    }
  }
  
  logger.info(`[Basescan] ✅ Found creation info for ${result.size}/${addresses.length} contracts`);
  return result;
}

/**
 * Check if a contract is verified
 */
export async function isContractVerified(
  network: Network,
  address: string
): Promise<boolean> {
  logger.info(`[Basescan] Checking verification status for ${address}...`);
  const sourceCode = await getContractSourceCode(network, address);
  const verified = sourceCode?.verified ?? false;
  logger.info(`[Basescan] ${address} verified: ${verified}`);
  return verified;
}

/**
 * Check Proxy Contract Verification Status
 */
export async function getProxyVerificationStatus(
  network: Network,
  address: string
): Promise<{
  isProxy: boolean;
  implementationAddress: string | null;
  proxyType: string | null;
} | null> {
  logger.info(`[Basescan] Checking proxy status for ${address}...`);
  
  const sourceCode = await getContractSourceCode(network, address);
  
  if (!sourceCode) {
    logger.warn(`[Basescan] No source code data for proxy check on ${address}`);
    return null;
  }
  
  if (sourceCode.isProxy && sourceCode.implementationAddress) {
    logger.info(`[Basescan] ✅ ${address} IS a proxy -> implementation: ${sourceCode.implementationAddress}`);
    return {
      isProxy: true,
      implementationAddress: sourceCode.implementationAddress,
      proxyType: "verified",
    };
  }
  
  logger.info(`[Basescan] ${address} is NOT marked as proxy in Basescan`);
  return {
    isProxy: false,
    implementationAddress: null,
    proxyType: null,
  };
}

/**
 * Get verified proxy implementation details
 */
export async function getProxyImplementationDetails(
  network: Network,
  proxyAddress: string
): Promise<{
  hasVerifiedImplementation: boolean;
  implementationAddress: string | null;
  implementationName: string | null;
  implementationVerified: boolean;
} | null> {
  logger.info(`[Basescan] Fetching proxy implementation details for ${proxyAddress}...`);
  
  const proxyStatus = await getProxyVerificationStatus(network, proxyAddress);
  
  if (!proxyStatus || !proxyStatus.isProxy || !proxyStatus.implementationAddress) {
    logger.info(`[Basescan] ${proxyAddress} is not a proxy or has no implementation`);
    return null;
  }
  
  // Get implementation contract details
  logger.info(`[Basescan] Fetching implementation ${proxyStatus.implementationAddress}...`);
  const implSource = await getContractSourceCode(network, proxyStatus.implementationAddress);
  
  const result = {
    hasVerifiedImplementation: implSource?.verified ?? false,
    implementationAddress: proxyStatus.implementationAddress,
    implementationName: implSource?.contractName || null,
    implementationVerified: implSource?.verified ?? false,
  };
  
  logger.info(`[Basescan] ✅ Proxy implementation: ${result.implementationName || "Unknown"}, verified: ${result.implementationVerified}`);
  return result;
}

/**
 * Get transaction list for an address (limited)
 */
export async function getTransactionList(
  network: Network,
  address: string,
  options: {
    page?: number;
    offset?: number;
    sort?: "asc" | "desc";
  } = {}
): Promise<
  {
    hash: string;
    from: string;
    to: string;
    value: string;
    blockNumber: string;
    timeStamp: string;
    methodId: string;
    functionName: string;
  }[]
> {
  logger.info(`[Basescan] Fetching transaction list for ${address}...`);
  
  const result = await basescanRequest<
    {
      hash: string;
      from: string;
      to: string;
      value: string;
      blockNumber: string;
      timeStamp: string;
      methodId: string;
      functionName: string;
    }[]
  >(network, {
    module: "account",
    action: "txlist",
    address,
    page: String(options.page ?? 1),
    offset: String(options.offset ?? 100),
    sort: options.sort ?? "desc",
  });
  
  const txList = result ?? [];
  logger.info(`[Basescan] ✅ Found ${txList.length} transactions`);
  return txList;
}

/**
 * Get internal transactions for an address
 */
export async function getInternalTransactions(
  network: Network,
  address: string,
  options: {
    page?: number;
    offset?: number;
  } = {}
): Promise<
  {
    hash: string;
    from: string;
    to: string;
    value: string;
    type: string;
    contractAddress: string;
    traceId: string;
  }[]
> {
  logger.info(`[Basescan] Fetching internal transactions for ${address}...`);
  
  const result = await basescanRequest<
    {
      hash: string;
      from: string;
      to: string;
      value: string;
      type: string;
      contractAddress: string;
      traceId: string;
    }[]
  >(network, {
    module: "account",
    action: "txlistinternal",
    address,
    page: String(options.page ?? 1),
    offset: String(options.offset ?? 100),
  });
  
  const txList = result ?? [];
  logger.info(`[Basescan] ✅ Found ${txList.length} internal transactions`);
  return txList;
}

/**
 * Get Basescan URL for a contract
 */
export function getBasescanUrl(network: Network, address: string): string {
  const baseUrl = network === "base-mainnet"
    ? "https://basescan.org"
    : "https://sepolia.basescan.org";
  
  return `${baseUrl}/address/${address}`;
}

/**
 * Get Basescan URL for a transaction
 */
export function getBasescanTxUrl(network: Network, txHash: string): string {
  const baseUrl = network === "base-mainnet"
    ? "https://basescan.org"
    : "https://sepolia.basescan.org";
  
  return `${baseUrl}/tx/${txHash}`;
}
