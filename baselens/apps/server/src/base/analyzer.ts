// ============================================
// Base Analyzer - Main analysis logic
// Queue-based exploration with no depth limit
// ============================================

import type { Address, Hex } from "viem";
import type {
  Network,
  ContractKindOnChain,
  SourceType,
  ContractTags,
  AbiItem,
} from "@baselens/core";
import { prisma } from "../db/prismaClient.js";
import { logger } from "../logger.js";
import * as rpc from "./client.js";
import * as explorer from "./explorer.js";
import { decompileContract } from "./decompiler.js";

// ============================================
// Configuration
// ============================================

// Maximum number of contracts to analyze per analysis (safety guardrail)
const MAX_CONTRACTS_PER_ANALYSIS = 100;

// Maximum number of hardcoded addresses to extract from a single source file
const MAX_HARDCODED_ADDRESSES_PER_FILE = 20;

// ============================================
// Types
// ============================================

export interface AnalysisContext {
  analysisId: string;
  network: Network;
  rootAddress: string;
  maxDepth: number; // Kept for backwards compatibility but not strictly enforced
  visited: Set<string>;
  queue: AnalysisQueueItem[];
  onProgress?: (progress: number, message: string) => void;
}

export interface AnalysisQueueItem {
  address: string;
  reason: RecursionReason;
  sourceAddress?: string; // The address that led us to enqueue this one
}

export type RecursionReason =
  | "ROOT"
  | "PROXY_IMPLEMENTATION"
  | "FACTORY_CREATOR"
  | "CREATED_CONTRACT"
  | "RUNTIME_CALLEE"
  | "HARDCODED_ADDRESS";

export interface ContractInfo {
  address: string;
  kindOnChain: ContractKindOnChain;
  verified: boolean;
  sourceType: SourceType;
  name?: string;
  bytecode?: string;
  abi?: AbiItem[];
  abiRaw?: string;
  sourceFiles?: { path: string; content: string; sourceType: "verified" | "decompiled" }[];
  creatorAddress?: string;
  creationTxHash?: string;
  tags: ContractTags;
  proxyInfo?: {
    implementationAddress?: string;
    adminAddress?: string;
    beaconAddress?: string;
  };
  // Basescan metadata
  compilerVersion?: string;
  optimizationUsed?: string;
  runs?: string;
  evmVersion?: string;
  library?: string;
  licenseType?: string;
  constructorArguments?: string;
  swarmSource?: string;
  decompileError?: string;
  // Recursion tracking
  recursionReason?: RecursionReason;
  recursionSource?: string;
}

// ============================================
// Address Detection in Source Code
// ============================================

/**
 * Extract hardcoded Ethereum addresses from source code
 * Matches patterns like 0x followed by 40 hex characters
 */
export function extractHardcodedAddresses(sourceCode: string): string[] {
  logger.debug(`[Analyzer] Extracting hardcoded addresses from source (${sourceCode.length} chars)...`);

  // Match addresses: 0x followed by exactly 40 hex chars
  // Must be on word boundary to avoid matching parts of longer hex strings
  const addressPattern = /\b(0x[a-fA-F0-9]{40})\b/g;

  const addresses = new Set<string>();
  let match;

  while ((match = addressPattern.exec(sourceCode)) !== null) {
    const address = match[1].toLowerCase();

    // Skip zero address and common sentinel values
    if (address === "0x0000000000000000000000000000000000000000") continue;
    if (address === "0xffffffffffffffffffffffffffffffffffffffff") continue;
    if (address === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") continue; // Native token placeholder

    addresses.add(address);

    // Safety limit
    if (addresses.size >= MAX_HARDCODED_ADDRESSES_PER_FILE) {
      logger.warn(`[Analyzer] Hit max hardcoded addresses limit (${MAX_HARDCODED_ADDRESSES_PER_FILE})`);
      break;
    }
  }

  const result = Array.from(addresses);
  logger.info(`[Analyzer] Found ${result.length} hardcoded addresses in source`);

  return result;
}

// ============================================
// Phase 1: On-chain Analysis
// ============================================

/**
 * Analyze a single contract on-chain
 */
export async function analyzeContractOnChain(
  address: string,
  network: Network
): Promise<ContractInfo> {
  const normalizedAddress = address.toLowerCase() as Address;

  logger.info(`[Analyzer] === Analyzing on-chain: ${normalizedAddress} ===`);

  // Step 1: Get bytecode to determine if EOA or contract
  logger.info(`[Analyzer] Step 1: Getting bytecode...`);
  const bytecode = await rpc.getCode(network, normalizedAddress);

  if (!bytecode || bytecode === "0x") {
    logger.info(`[Analyzer] ✅ ${normalizedAddress} is an EOA (no bytecode)`);
    return {
      address: normalizedAddress,
      kindOnChain: "EOA",
      verified: false,
      sourceType: "none",
      tags: {},
    };
  }

  logger.info(`[Analyzer] ${normalizedAddress} is a CONTRACT (${bytecode.length} chars bytecode)`);

  // Step 2: Detect proxy patterns
  logger.info(`[Analyzer] Step 2: Detecting proxy patterns...`);
  const [eip1967Info, minimalProxyInfo] = await Promise.all([
    rpc.detectEip1967Proxy(network, normalizedAddress),
    Promise.resolve(rpc.detectMinimalProxy(bytecode)),
  ]);

  // Determine contract kind
  let kindOnChain: ContractKindOnChain = "CONTRACT_SIMPLE";
  const tags: ContractTags = {};
  let proxyInfo: ContractInfo["proxyInfo"];

  if (eip1967Info.isProxy) {
    kindOnChain = "PROXY";
    tags.hasEip1967ImplSlot = true;
    tags.implementationAddress = eip1967Info.implementationAddress ?? undefined;
    if (eip1967Info.adminAddress) {
      tags.proxyAdmin = eip1967Info.adminAddress;
    }
    proxyInfo = {
      implementationAddress: eip1967Info.implementationAddress ?? undefined,
      adminAddress: eip1967Info.adminAddress ?? undefined,
      beaconAddress: eip1967Info.beaconAddress ?? undefined,
    };
    logger.info(`[Analyzer] ✅ Detected EIP-1967 PROXY -> impl: ${proxyInfo.implementationAddress}`);
  } else if (minimalProxyInfo.isMinimalProxy) {
    kindOnChain = "PROXY";
    tags.isMinimalProxy = true;
    tags.implementationAddress = minimalProxyInfo.implementationAddress ?? undefined;
    proxyInfo = {
      implementationAddress: minimalProxyInfo.implementationAddress ?? undefined,
    };
    logger.info(`[Analyzer] ✅ Detected EIP-1167 minimal PROXY -> impl: ${proxyInfo.implementationAddress}`);
  } else {
    logger.info(`[Analyzer] Contract is a simple CONTRACT (no proxy pattern)`);
  }

  return {
    address: normalizedAddress,
    kindOnChain,
    verified: false,
    sourceType: "none",
    bytecode,
    tags,
    proxyInfo,
  };
}

/**
 * Get contract creation info from Basescan (batch)
 */
export async function getContractCreationInfo(
  addresses: string[],
  network: Network
): Promise<Map<string, { creator: string; txHash: string }>> {
  logger.info(`[Analyzer] Fetching creation info for ${addresses.length} contracts via Basescan...`);
  return explorer.getContractCreation(network, addresses);
}

// ============================================
// Phase 2: Source Code Analysis
// ============================================

/**
 * Parse source files from Basescan's source code response
 */
function parseSourceFiles(
  sourceCodeRaw: string,
  contractName: string
): { path: string; content: string }[] {
  const sourceFiles: { path: string; content: string }[] = [];

  // Check if source code is a JSON object (multi-file format)
  if (sourceCodeRaw.startsWith("{") || sourceCodeRaw.startsWith("{{")) {
    try {
      // Handle double-braced format
      let sourceJson = sourceCodeRaw;
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
        logger.info(`[Analyzer] Parsed ${sourceFiles.length} source files (standard JSON format)`);
      } else {
        // Direct file mapping
        for (const [path, content] of Object.entries(parsed)) {
          if (typeof content === "string") {
            sourceFiles.push({ path, content });
          } else if ((content as { content: string }).content) {
            sourceFiles.push({ path, content: (content as { content: string }).content });
          }
        }
        logger.info(`[Analyzer] Parsed ${sourceFiles.length} source files (direct mapping)`);
      }
    } catch (e) {
      logger.warn(`[Analyzer] Failed to parse multi-file source, treating as single file:`, e);
      sourceFiles.push({
        path: `${contractName || "Contract"}.sol`,
        content: sourceCodeRaw,
      });
    }
  } else {
    // Single file source code
    sourceFiles.push({
      path: `${contractName || "Contract"}.sol`,
      content: sourceCodeRaw,
    });
    logger.info(`[Analyzer] Single source file: ${contractName || "Contract"}.sol (${sourceCodeRaw.length} chars)`);
  }

  return sourceFiles;
}

/**
 * Get and analyze source code for a contract
 * Uses the new getContractSourceInfo helper for full metadata
 */
export async function analyzeContractSource(
  contractInfo: ContractInfo,
  network: Network
): Promise<ContractInfo> {
  const address = contractInfo.address;

  logger.info(`[Analyzer] === Analyzing source: ${address} ===`);

  // Step 1: Try to get verified source from Basescan using full metadata API
  logger.info(`[Analyzer] Step 1: Checking Basescan for verified source (full metadata)...`);
  const sourceInfo = await explorer.getContractSourceInfo(network, address);

  if (sourceInfo.hasSource && sourceInfo.sourceCodeRaw) {
    logger.info(`[Analyzer] ✅ Found VERIFIED source: ${sourceInfo.contractName}`);
    logger.info(`[Analyzer]   - Compiler: ${sourceInfo.compilerVersion}`);
    logger.info(`[Analyzer]   - Optimization: ${sourceInfo.optimizationUsed} (${sourceInfo.runs} runs)`);
    logger.info(`[Analyzer]   - Proxy flag: ${sourceInfo.proxyFlag}`);

    // Parse source files
    const sourceFiles = parseSourceFiles(sourceInfo.sourceCodeRaw, sourceInfo.contractName || "Contract");
    logger.info(`[Analyzer]   - ${sourceFiles.length} source files`);

    // Parse ABI if available
    let abi: AbiItem[] | undefined;
    if (sourceInfo.abiRaw) {
      try {
        abi = JSON.parse(sourceInfo.abiRaw);
        logger.info(`[Analyzer]   - ${abi?.length || 0} ABI items`);
      } catch (e) {
        logger.warn(`[Analyzer] Failed to parse ABI: ${e}`);
      }
    }

    contractInfo.verified = true;
    contractInfo.sourceType = "verified";
    contractInfo.name = sourceInfo.contractName;
    contractInfo.abi = abi;
    contractInfo.abiRaw = sourceInfo.abiRaw;
    contractInfo.sourceFiles = sourceFiles.map((f) => ({
      ...f,
      sourceType: "verified" as const,
    }));

    // Store all metadata
    contractInfo.compilerVersion = sourceInfo.compilerVersion;
    contractInfo.optimizationUsed = sourceInfo.optimizationUsed;
    contractInfo.runs = sourceInfo.runs;
    contractInfo.evmVersion = sourceInfo.evmVersion;
    contractInfo.library = sourceInfo.library;
    contractInfo.licenseType = sourceInfo.licenseType;
    contractInfo.constructorArguments = sourceInfo.constructorArguments;
    contractInfo.swarmSource = sourceInfo.swarmSource;

    // Update proxy info from Basescan if available
    if (sourceInfo.proxyFlag === "1" && sourceInfo.implementation) {
      logger.info(`[Analyzer] Basescan indicates this is a proxy -> ${sourceInfo.implementation}`);
      contractInfo.kindOnChain = "PROXY";
      contractInfo.proxyInfo = contractInfo.proxyInfo || {};
      contractInfo.proxyInfo.implementationAddress = sourceInfo.implementation;
      contractInfo.tags.proxyFlag = "1";
      contractInfo.tags.implementationAddress = sourceInfo.implementation;
    }

    // Store metadata in tags
    contractInfo.tags.compilerVersion = sourceInfo.compilerVersion;
    contractInfo.tags.optimizationUsed = sourceInfo.optimizationUsed;
    contractInfo.tags.runs = sourceInfo.runs;
    contractInfo.tags.evmVersion = sourceInfo.evmVersion;
    contractInfo.tags.swarmSource = sourceInfo.swarmSource;

  } else {
    // Step 1.5: If this is a PROXY, try to get source from IMPLEMENTATION address
    if (contractInfo.kindOnChain === "PROXY" && contractInfo.proxyInfo?.implementationAddress) {
      const implAddress = contractInfo.proxyInfo.implementationAddress;
      logger.info(`[Analyzer] Step 1.5: Proxy detected, trying implementation address: ${implAddress}`);

      const implSourceInfo = await explorer.getContractSourceInfo(network, implAddress);

      if (implSourceInfo.hasSource && implSourceInfo.sourceCodeRaw) {
        logger.info(`[Analyzer] ✅ Found VERIFIED source from IMPLEMENTATION: ${implSourceInfo.contractName}`);
        logger.info(`[Analyzer]   - Compiler: ${implSourceInfo.compilerVersion}`);

        // Parse source files from implementation
        const sourceFiles = parseSourceFiles(implSourceInfo.sourceCodeRaw, implSourceInfo.contractName || "Implementation");
        logger.info(`[Analyzer]   - ${sourceFiles.length} source files from implementation`);

        // Parse ABI if available
        let abi: AbiItem[] | undefined;
        if (implSourceInfo.abiRaw) {
          try {
            abi = JSON.parse(implSourceInfo.abiRaw);
            logger.info(`[Analyzer]   - ${abi?.length || 0} ABI items from implementation`);
          } catch (e) {
            logger.warn(`[Analyzer] Failed to parse implementation ABI: ${e}`);
          }
        }

        // Use implementation's source but mark as proxy
        contractInfo.verified = true; // Implementation is verified
        contractInfo.sourceType = "verified";
        contractInfo.name = implSourceInfo.contractName;
        contractInfo.abi = abi;
        contractInfo.abiRaw = implSourceInfo.abiRaw;
        contractInfo.sourceFiles = sourceFiles.map((f) => ({
          ...f,
          sourceType: "verified" as const,
        }));

        // Store implementation metadata
        contractInfo.compilerVersion = implSourceInfo.compilerVersion;
        contractInfo.optimizationUsed = implSourceInfo.optimizationUsed;
        contractInfo.runs = implSourceInfo.runs;
        contractInfo.evmVersion = implSourceInfo.evmVersion;
        contractInfo.tags.compilerVersion = implSourceInfo.compilerVersion;
        contractInfo.tags.optimizationUsed = implSourceInfo.optimizationUsed;

        return contractInfo;
      } else {
        logger.info(`[Analyzer] Implementation ${implAddress} also not verified, continuing...`);
      }
    }

    // Step 2: No verified source - try to get ABI-only
    logger.info(`[Analyzer] Step 2: No verified source, checking for ABI-only...`);
    const abiResult = await explorer.getContractAbiOnly(network, address);

    if (abiResult.hasAbi && abiResult.abiRaw) {
      logger.info(`[Analyzer] ✅ Found ABI without verified source`);
      try {
        contractInfo.abi = JSON.parse(abiResult.abiRaw);
        contractInfo.abiRaw = abiResult.abiRaw;
        logger.info(`[Analyzer]   - ${contractInfo.abi?.length || 0} ABI items`);
      } catch (e) {
        logger.warn(`[Analyzer] Failed to parse ABI-only: ${e}`);
      }
    }

    // Step 3: Try Panoramix decompilation (only if no verified source)
    logger.info(`[Analyzer] Step 3: Trying Panoramix decompilation...`);
    logger.info(`[Analyzer] Bytecode available: ${contractInfo.bytecode ? "YES" : "NO"} (${contractInfo.bytecode?.length || 0} chars)`);

    const decompResult = await decompileContract(
      address,
      network,
      contractInfo.bytecode
    );

    if (decompResult.success) {
      logger.info(`[Analyzer] ✅ Panoramix decompilation SUCCESSFUL via ${decompResult.method}`);
      logger.info(`[Analyzer]   - Output size: ${decompResult.decompiled.length} chars`);

      contractInfo.verified = false;
      contractInfo.sourceType = "decompiled";
      contractInfo.sourceFiles = [
        {
          path: "Decompiled.sol",
          content: decompResult.decompiled,
          sourceType: "decompiled" as const,
        },
      ];
    } else {
      logger.warn(`[Analyzer] ❌ Panoramix decompilation FAILED: ${decompResult.error}`);
      contractInfo.sourceType = "none";
      contractInfo.decompileError = decompResult.error;
      contractInfo.tags.decompileError = decompResult.error;
    }
  }

  return contractInfo;
}

// ============================================
// Type Detection from Source Code
// ============================================

export interface DetectedType {
  name: string;
  kind: "INTERFACE" | "ABSTRACT_CONTRACT" | "CONTRACT_IMPL" | "LIBRARY";
  instanciable: boolean;
  parents: string[];
  interfaces: string[];
  libraries: string[];
}

/**
 * Parse Solidity source to detect type definitions
 */
export function parseSourceForTypes(sourceCode: string): DetectedType[] {
  logger.debug(`[Analyzer] Parsing source for type definitions (${sourceCode.length} chars)...`);

  const types: DetectedType[] = [];

  // Regex patterns for different type definitions
  const patterns = [
    {
      regex: /interface\s+(\w+)(?:\s+is\s+([^{]+))?\s*\{/g,
      kind: "INTERFACE" as const,
      instanciable: false,
    },
    {
      regex: /abstract\s+contract\s+(\w+)(?:\s+is\s+([^{]+))?\s*\{/g,
      kind: "ABSTRACT_CONTRACT" as const,
      instanciable: false,
    },
    {
      regex: /library\s+(\w+)\s*\{/g,
      kind: "LIBRARY" as const,
      instanciable: false,
    },
    {
      regex: /(?<!abstract\s)contract\s+(\w+)(?:\s+is\s+([^{]+))?\s*\{/g,
      kind: "CONTRACT_IMPL" as const,
      instanciable: true,
    },
  ];

  for (const { regex, kind, instanciable } of patterns) {
    let match;
    while ((match = regex.exec(sourceCode)) !== null) {
      const name = match[1];
      const inheritanceClause = match[2] || "";

      const parents: string[] = [];
      const interfaces: string[] = [];

      if (inheritanceClause) {
        const inherited = inheritanceClause.split(",").map((s) => s.trim());
        for (const parent of inherited) {
          const parentName = parent.split("(")[0].trim();
          if (parentName.startsWith("I") && parentName.length > 1 && parentName[1] === parentName[1].toUpperCase()) {
            interfaces.push(parentName);
          } else {
            parents.push(parentName);
          }
        }
      }

      types.push({
        name,
        kind,
        instanciable,
        parents,
        interfaces,
        libraries: [],
      });
    }
  }

  // Parse library usage
  const usingPattern = /using\s+(\w+)\s+for\s+([^;]+);/g;
  let usingMatch;
  while ((usingMatch = usingPattern.exec(sourceCode)) !== null) {
    const libraryName = usingMatch[1];
    for (const type of types) {
      if (type.kind === "CONTRACT_IMPL" || type.kind === "ABSTRACT_CONTRACT") {
        if (!type.libraries.includes(libraryName)) {
          type.libraries.push(libraryName);
        }
      }
    }
  }

  logger.info(`[Analyzer] Parsed ${types.length} type definitions from source`);
  for (const t of types) {
    logger.debug(`[Analyzer]   - ${t.kind}: ${t.name} (parents: ${t.parents.length}, interfaces: ${t.interfaces.length})`);
  }

  return types;
}

// ============================================
// Runtime Callee Detection
// ============================================

/**
 * Get contracts that this contract calls at runtime (via internal transactions)
 */
export async function detectRuntimeCallees(
  address: string,
  network: Network
): Promise<string[]> {
  logger.info(`[Analyzer] Detecting runtime callees for ${address}...`);

  try {
    const internalTxs = await explorer.getInternalTransactions(network, address, {
      page: 1,
      offset: 50, // Get recent internal txs
    });

    const callees = new Set<string>();

    for (const tx of internalTxs) {
      // Check if this contract called another contract
      if (tx.from.toLowerCase() === address.toLowerCase() && tx.to) {
        const callee = tx.to.toLowerCase();
        if (callee !== address.toLowerCase()) {
          callees.add(callee);
        }
      }
    }

    const result = Array.from(callees);
    logger.info(`[Analyzer] Found ${result.length} runtime callees`);

    return result;
  } catch (error) {
    logger.warn(`[Analyzer] Failed to get runtime callees:`, error);
    return [];
  }
}

// ============================================
// Full Analysis Pipeline
// ============================================

/**
 * Run the full analysis pipeline
 * Uses queue-based exploration with no strict depth limit
 */
export async function runAnalysis(ctx: AnalysisContext): Promise<void> {
  const { analysisId, network, rootAddress, onProgress } = ctx;

  logger.info(`[Analyzer] ========================================`);
  logger.info(`[Analyzer] STARTING ANALYSIS`);
  logger.info(`[Analyzer] Analysis ID: ${analysisId}`);
  logger.info(`[Analyzer] Root Address: ${rootAddress}`);
  logger.info(`[Analyzer] Network: ${network}`);
  logger.info(`[Analyzer] Max Contracts: ${MAX_CONTRACTS_PER_ANALYSIS}`);
  logger.info(`[Analyzer] ========================================`);

  onProgress?.(10, "Starting analysis...");

  // Initialize queue with root address
  ctx.queue = [{ address: rootAddress.toLowerCase(), reason: "ROOT" }];
  ctx.visited = new Set();

  const allContracts: ContractInfo[] = [];
  const addressRelations: Map<string, { source: string; reason: RecursionReason }[]> = new Map();

  // ============================================
  // Phase 1: On-chain exploration (queue-based)
  // ============================================

  logger.info(`[Analyzer] ========================================`);
  logger.info(`[Analyzer] PHASE 1: ON-CHAIN EXPLORATION`);
  logger.info(`[Analyzer] ========================================`);

  onProgress?.(15, "Phase 1: On-chain exploration...");

  let explorationCount = 0;

  while (ctx.queue.length > 0 && allContracts.length < MAX_CONTRACTS_PER_ANALYSIS) {
    const { address, reason, sourceAddress } = ctx.queue.shift()!;

    if (ctx.visited.has(address)) {
      logger.debug(`[Analyzer] Skipping already visited: ${address}`);
      continue;
    }

    ctx.visited.add(address);
    explorationCount++;

    // Track the relation
    if (sourceAddress) {
      const relations = addressRelations.get(address) || [];
      relations.push({ source: sourceAddress, reason });
      addressRelations.set(address, relations);
    }

    logger.info(`[Analyzer] --- Exploring #${explorationCount}: ${address} (${reason}) ---`);

    try {
      const contractInfo = await analyzeContractOnChain(address, network);
      contractInfo.recursionReason = reason;
      contractInfo.recursionSource = sourceAddress;

      allContracts.push(contractInfo);

      // Enqueue proxy implementation
      if (contractInfo.proxyInfo?.implementationAddress) {
        const implAddress = contractInfo.proxyInfo.implementationAddress.toLowerCase();
        if (!ctx.visited.has(implAddress)) {
          logger.info(`[Analyzer] Queueing proxy implementation: ${implAddress}`);
          ctx.queue.push({
            address: implAddress,
            reason: "PROXY_IMPLEMENTATION",
            sourceAddress: address,
          });
        }
      }

    } catch (error) {
      logger.error(`[Analyzer] ❌ Failed to analyze ${address}:`, error);
    }
  }

  if (allContracts.length >= MAX_CONTRACTS_PER_ANALYSIS) {
    logger.warn(`[Analyzer] Hit max contracts limit (${MAX_CONTRACTS_PER_ANALYSIS}), stopping exploration`);
  }

  logger.info(`[Analyzer] Phase 1 complete: explored ${allContracts.length} addresses`);
  onProgress?.(30, `Found ${allContracts.length} contracts on-chain`);

  // ============================================
  // Get creation info for all contracts
  // ============================================

  const contractAddresses = allContracts
    .filter((c) => c.kindOnChain !== "EOA")
    .map((c) => c.address);

  if (contractAddresses.length > 0) {
    logger.info(`[Analyzer] Fetching creation info for ${contractAddresses.length} contracts...`);
    const creationInfo = await getContractCreationInfo(contractAddresses, network);

    for (const contract of allContracts) {
      const info = creationInfo.get(contract.address.toLowerCase());
      if (info) {
        contract.creatorAddress = info.creator;
        contract.creationTxHash = info.txHash;
        logger.debug(`[Analyzer] ${contract.address.slice(0, 10)}... created by ${info.creator.slice(0, 10)}...`);

        // Check if creator is a contract (factory pattern) and not already visited
        if (!ctx.visited.has(info.creator.toLowerCase())) {
          const creatorCode = await rpc.getCode(network, info.creator as Address);
          if (creatorCode && creatorCode !== "0x") {
            // Mark the creator as a factory if we're exploring it
            const shouldExploreFactory = allContracts.length < MAX_CONTRACTS_PER_ANALYSIS;

            if (shouldExploreFactory) {
              logger.info(`[Analyzer] Creator ${info.creator} is a contract (factory), queueing...`);
              ctx.queue.push({
                address: info.creator.toLowerCase(),
                reason: "FACTORY_CREATOR",
                sourceAddress: contract.address,
              });
            }
          }
        }
      }
    }

    // Process any newly queued factory contracts
    while (ctx.queue.length > 0 && allContracts.length < MAX_CONTRACTS_PER_ANALYSIS) {
      const { address, reason, sourceAddress } = ctx.queue.shift()!;

      if (ctx.visited.has(address)) continue;
      ctx.visited.add(address);

      logger.info(`[Analyzer] --- Exploring factory: ${address} ---`);

      try {
        const contractInfo = await analyzeContractOnChain(address, network);
        contractInfo.recursionReason = reason;
        contractInfo.recursionSource = sourceAddress;
        contractInfo.tags.isFactory = true;

        allContracts.push(contractInfo);
      } catch (error) {
        logger.error(`[Analyzer] ❌ Failed to analyze factory ${address}:`, error);
      }
    }
  }

  onProgress?.(40, "Phase 1 complete. Starting Phase 2...");

  // ============================================
  // Phase 2: Source code analysis
  // ============================================

  logger.info(`[Analyzer] ========================================`);
  logger.info(`[Analyzer] PHASE 2: SOURCE CODE ANALYSIS`);
  logger.info(`[Analyzer] ========================================`);

  onProgress?.(45, "Phase 2: Fetching source code...");

  // Prioritize: root contract, proxies, factories, implementations
  const priorityOrder = [
    rootAddress.toLowerCase(),
    ...allContracts.filter((c) => c.kindOnChain === "PROXY").map((c) => c.address),
    ...allContracts.filter((c) => c.tags.isFactory).map((c) => c.address),
    ...allContracts.filter((c) => c.kindOnChain !== "PROXY" && c.kindOnChain !== "EOA" && !c.tags.isFactory).map((c) => c.address),
  ];

  const processedAddresses = new Set<string>();
  let sourceProgress = 45;
  const progressPerContract = 30 / Math.max(1, priorityOrder.length);
  let sourceCount = 0;

  // Track hardcoded addresses found in source
  const hardcodedAddresses = new Set<string>();

  for (const address of priorityOrder) {
    if (processedAddresses.has(address)) continue;
    processedAddresses.add(address);

    const contractIndex = allContracts.findIndex((c) => c.address === address);
    if (contractIndex === -1) continue;

    sourceCount++;
    logger.info(`[Analyzer] --- Source analysis #${sourceCount}: ${address} ---`);

    try {
      allContracts[contractIndex] = await analyzeContractSource(allContracts[contractIndex], network);

      // Extract hardcoded addresses from source files
      const contract = allContracts[contractIndex];
      if (contract.sourceFiles) {
        for (const file of contract.sourceFiles) {
          const addresses = extractHardcodedAddresses(file.content);
          for (const addr of addresses) {
            if (addr !== contract.address && !ctx.visited.has(addr)) {
              hardcodedAddresses.add(addr);
            }
          }
        }
      }

    } catch (error) {
      logger.error(`[Analyzer] ❌ Failed to get source for ${address}:`, error);
    }

    sourceProgress += progressPerContract;
    onProgress?.(Math.round(sourceProgress), `Analyzed source: ${address.slice(0, 10)}...`);
  }

  // Enqueue hardcoded addresses (limited)
  if (hardcodedAddresses.size > 0 && allContracts.length < MAX_CONTRACTS_PER_ANALYSIS) {
    const hardcodedToAnalyze = Array.from(hardcodedAddresses).slice(0, 10); // Limit to 10
    logger.info(`[Analyzer] Found ${hardcodedAddresses.size} hardcoded addresses, analyzing ${hardcodedToAnalyze.length}...`);

    for (const addr of hardcodedToAnalyze) {
      if (allContracts.length >= MAX_CONTRACTS_PER_ANALYSIS) break;
      if (ctx.visited.has(addr)) continue;
      ctx.visited.add(addr);

      try {
        const contractInfo = await analyzeContractOnChain(addr, network);
        contractInfo.recursionReason = "HARDCODED_ADDRESS";
        allContracts.push(contractInfo);

        // Get source for hardcoded contracts too
        const index = allContracts.length - 1;
        allContracts[index] = await analyzeContractSource(allContracts[index], network);
      } catch (error) {
        logger.warn(`[Analyzer] Failed to analyze hardcoded address ${addr}:`, error);
      }
    }
  }

  logger.info(`[Analyzer] Phase 2 complete: analyzed source for ${sourceCount} contracts`);
  onProgress?.(75, "Saving to database...");

  // ============================================
  // Save to database
  // ============================================

  logger.info(`[Analyzer] ========================================`);
  logger.info(`[Analyzer] SAVING TO DATABASE`);
  logger.info(`[Analyzer] ========================================`);

  for (const contract of allContracts) {
    logger.debug(`[Analyzer] Saving contract: ${contract.address} (${contract.kindOnChain}, ${contract.sourceType})`);

    await prisma.contract.upsert({
      where: {
        analysisId_address: {
          analysisId,
          address: contract.address,
        },
      },
      create: {
        analysisId,
        address: contract.address,
        name: contract.name,
        kindOnChain: contract.kindOnChain,
        network,
        verified: contract.verified,
        sourceType: contract.sourceType,
        tagsJson: contract.tags,
        abiJson: contract.abi,
        sourceCode: contract.sourceFiles?.[0]?.content,
        creatorAddress: contract.creatorAddress,
        creationTxHash: contract.creationTxHash,
        compilerVersion: contract.compilerVersion,
        optimizationUsed: contract.optimizationUsed,
        runs: contract.runs,
        evmVersion: contract.evmVersion,
        library: contract.library,
        licenseType: contract.licenseType,
        constructorArguments: contract.constructorArguments,
        proxyFlag: contract.tags.proxyFlag,
        implementationAddress: contract.proxyInfo?.implementationAddress,
        swarmSource: contract.swarmSource,
        decompileError: contract.decompileError,
      },
      update: {
        name: contract.name,
        kindOnChain: contract.kindOnChain,
        verified: contract.verified,
        sourceType: contract.sourceType,
        tagsJson: contract.tags,
        abiJson: contract.abi,
        sourceCode: contract.sourceFiles?.[0]?.content,
        creatorAddress: contract.creatorAddress,
        creationTxHash: contract.creationTxHash,
        compilerVersion: contract.compilerVersion,
        optimizationUsed: contract.optimizationUsed,
        runs: contract.runs,
        evmVersion: contract.evmVersion,
        library: contract.library,
        licenseType: contract.licenseType,
        constructorArguments: contract.constructorArguments,
        proxyFlag: contract.tags.proxyFlag,
        implementationAddress: contract.proxyInfo?.implementationAddress,
        swarmSource: contract.swarmSource,
        decompileError: contract.decompileError,
      },
    });

    // Save source files
    if (contract.sourceFiles) {
      for (const file of contract.sourceFiles) {
        logger.debug(`[Analyzer] Saving source file: ${file.path} (${file.content.length} chars)`);
        await prisma.sourceFile.create({
          data: {
            analysisId,
            contractAddress: contract.address,
            path: file.path,
            sourceType: file.sourceType,
            content: file.content,
          },
        });
      }
    }
  }

  logger.info(`[Analyzer] Saved ${allContracts.length} contracts to database`);
  onProgress?.(85, "Building graph edges...");

  // ============================================
  // Build edges
  // ============================================

  logger.info(`[Analyzer] ========================================`);
  logger.info(`[Analyzer] BUILDING GRAPH EDGES`);
  logger.info(`[Analyzer] ========================================`);

  let edgeCount = 0;

  for (const contract of allContracts) {
    // Proxy edges
    if (contract.proxyInfo?.implementationAddress) {
      logger.debug(`[Analyzer] Creating IS_PROXY_OF edge: ${contract.address} -> ${contract.proxyInfo.implementationAddress}`);
      await prisma.edge.create({
        data: {
          analysisId,
          fromNodeId: `contract:${contract.address}`,
          toNodeId: `contract:${contract.proxyInfo.implementationAddress.toLowerCase()}`,
          kind: "IS_PROXY_OF",
          evidenceJson: {
            implementationSlot: contract.tags.hasEip1967ImplSlot
              ? rpc.EIP1967_SLOTS.IMPLEMENTATION
              : undefined,
            isMinimalProxy: contract.tags.isMinimalProxy,
          },
        },
      });
      edgeCount++;
    }

    // Creator edges - point to the creator address or contract
    if (contract.creatorAddress) {
      const creatorLower = contract.creatorAddress.toLowerCase();
      const creatorIsContract = allContracts.some((c) => c.address === creatorLower);

      logger.debug(`[Analyzer] Creating CREATED_BY edge: ${contract.address} -> ${creatorLower}`);
      await prisma.edge.create({
        data: {
          analysisId,
          fromNodeId: `contract:${contract.address}`,
          toNodeId: creatorIsContract ? `contract:${creatorLower}` : `address:${creatorLower}`,
          kind: "CREATED_BY",
          evidenceJson: {
            txHash: contract.creationTxHash,
          },
        },
      });
      edgeCount++;

      // Also create CREATED edge from creator to this contract
      if (creatorIsContract) {
        await prisma.edge.create({
          data: {
            analysisId,
            fromNodeId: `contract:${creatorLower}`,
            toNodeId: `contract:${contract.address}`,
            kind: "CREATED",
            evidenceJson: {
              txHash: contract.creationTxHash,
            },
          },
        });
        edgeCount++;
      }
    }

    // Source file edges
    if (contract.sourceFiles) {
      for (const file of contract.sourceFiles) {
        const sourceFileId = `source:${contract.address}:${file.path}`;

        await prisma.edge.create({
          data: {
            analysisId,
            fromNodeId: `contract:${contract.address}`,
            toNodeId: sourceFileId,
            kind: "HAS_SOURCE_FILE",
          },
        });
        edgeCount++;

        // Parse types from source
        const types = parseSourceForTypes(file.content);

        for (const type of types) {
          const typeId = `typedef:${contract.address}:${type.name}`;
          const isRootType = contract.address === rootAddress.toLowerCase() && type.instanciable;

          // Save type definition
          const sourceFile = await prisma.sourceFile.findFirst({
            where: {
              analysisId,
              contractAddress: contract.address,
              path: file.path,
            },
          });

          if (sourceFile) {
            await prisma.typeDef.create({
              data: {
                analysisId,
                sourceFileId: sourceFile.id,
                name: type.name,
                kind: type.kind,
                instanciable: type.instanciable,
                isRootContractType: isRootType,
                metadataJson: {
                  parents: type.parents,
                  interfaces: type.interfaces,
                  libraries: type.libraries,
                },
              },
            });
          }

          // DECLARES_TYPE edge
          await prisma.edge.create({
            data: {
              analysisId,
              fromNodeId: sourceFileId,
              toNodeId: typeId,
              kind: "DECLARES_TYPE",
            },
          });
          edgeCount++;

          // DEFINED_BY edge (for root contract)
          if (isRootType) {
            await prisma.edge.create({
              data: {
                analysisId,
                fromNodeId: `contract:${contract.address}`,
                toNodeId: typeId,
                kind: "DEFINED_BY",
              },
            });
            edgeCount++;
          }

          // Inheritance edges
          for (const parent of type.parents) {
            await prisma.edge.create({
              data: {
                analysisId,
                fromNodeId: typeId,
                toNodeId: `typedef:${contract.address}:${parent}`,
                kind: "EXTENDS_CONTRACT",
              },
            });
            edgeCount++;
          }

          // Interface edges
          for (const iface of type.interfaces) {
            await prisma.edge.create({
              data: {
                analysisId,
                fromNodeId: typeId,
                toNodeId: `typedef:${contract.address}:${iface}`,
                kind: "IMPLEMENTS_INTERFACE",
              },
            });
            edgeCount++;
          }

          // Library edges
          for (const lib of type.libraries) {
            await prisma.edge.create({
              data: {
                analysisId,
                fromNodeId: typeId,
                toNodeId: `typedef:${contract.address}:${lib}`,
                kind: "USES_LIBRARY",
              },
            });
            edgeCount++;
          }
        }

        // Create REFERENCES_ADDRESS edges for hardcoded addresses
        const hardcodedInFile = extractHardcodedAddresses(file.content);
        for (const addr of hardcodedInFile) {
          const addrIsContract = allContracts.some((c) => c.address === addr);

          await prisma.edge.create({
            data: {
              analysisId,
              fromNodeId: `contract:${contract.address}`,
              toNodeId: addrIsContract ? `contract:${addr}` : `address:${addr}`,
              kind: "REFERENCES_ADDRESS",
              evidenceJson: {
                foundInFile: file.path,
              },
            },
          });
          edgeCount++;
        }
      }
    }
  }

  logger.info(`[Analyzer] Created ${edgeCount} graph edges`);
  logger.info(`[Analyzer] ========================================`);
  logger.info(`[Analyzer] ANALYSIS COMPLETE`);
  logger.info(`[Analyzer] ========================================`);

  onProgress?.(90, "Analysis complete");
}
