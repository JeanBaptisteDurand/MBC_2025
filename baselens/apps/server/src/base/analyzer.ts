// ============================================
// Base Analyzer - Main analysis logic
// Queue-based exploration with aggressive recursion
// EVERY contract gets FULL analysis like root
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
const MAX_HARDCODED_ADDRESSES_PER_FILE = 50;

// Maximum number of hardcoded addresses to enqueue per contract
const MAX_HARDCODED_TO_ENQUEUE = 20;

// ============================================
// Types
// ============================================

export type QueueReason =
  | "ROOT"
  | "PROXY_IMPLEMENTATION"
  | "CREATOR_CONTRACT"
  | "FACTORY_CREATED"
  | "RUNTIME_CALLEE"
  | "HARDCODED_ADDRESS"
  | "SOURCE_DECLARED_IMPL";

export interface QueueItem {
  address: string;
  reason: QueueReason;
  sourceAddress?: string;
}

export interface AnalysisContext {
  analysisId: string;
  network: Network;
  rootAddress: string;
  queue: QueueItem[];
  visited: Set<string>;
  pending: Set<string>;
  bytecodeCache: Map<string, string>;
  onProgress?: (progress: number, message: string) => void;
  maxDepth: number;
}

export interface AnalyzedContract {
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
  creatorIsContract?: boolean;
  creationTxHash?: string;
  implementationAddress?: string;
  runtimeCallees?: string[];
  createdContracts?: string[];
  tags: ContractTags;
  compilerVersion?: string;
  optimizationUsed?: string;
  runs?: string;
  evmVersion?: string;
  library?: string;
  licenseType?: string;
  constructorArguments?: string;
  swarmSource?: string;
  decompileError?: string;
  recursionReason?: QueueReason;
  recursionSource?: string;
  // Track all discovered implementations (from various sources)
  discoveredImplementations?: string[];
  // Flag when panoramix fails to decompile (no usable source at all)
  noSource?: boolean;
  // Previous source type (for upgrade detection)
  previousSourceType?: SourceType;
}

export interface AnalyzedSource {
  files: {
    path: string;
    content: string;
    sourceType: "verified" | "decompiled";
  }[];
  typeDefs: DetectedType[];
  hardcodedAddresses: string[];
  declaredImplementations: string[]; // Implementation addresses found in patterns
}

export interface DetectedType {
  name: string;
  kind: "INTERFACE" | "ABSTRACT_CONTRACT" | "CONTRACT_IMPL" | "LIBRARY";
  instanciable: boolean;
  isRootContractType: boolean;
  parents: string[];
  interfaces: string[];
  libraries: string[];
  sourcePath: string; // The source file path that declares this type
}

// ============================================
// Queue Management
// ============================================

function enqueue(ctx: AnalysisContext, item: QueueItem): boolean {
  const addr = item.address.toLowerCase();

  if (ctx.visited.has(addr)) {
    logger.debug(`[Analyzer] Skip enqueue ${addr.slice(0, 10)}... - already visited`);
    return false;
  }

  if (ctx.pending.has(addr)) {
    logger.debug(`[Analyzer] Skip enqueue ${addr.slice(0, 10)}... - already pending`);
    return false;
  }

  const totalCount = ctx.visited.size + ctx.pending.size;
  if (totalCount >= MAX_CONTRACTS_PER_ANALYSIS) {
    logger.warn(`[Analyzer] Skip enqueue ${addr.slice(0, 10)}... - at capacity (${totalCount}/${MAX_CONTRACTS_PER_ANALYSIS})`);
    return false;
  }

  ctx.queue.push({ ...item, address: addr });
  ctx.pending.add(addr);

  logger.info(`[Analyzer] ✅ ENQUEUED: ${addr} (${item.reason}) from ${item.sourceAddress?.slice(0, 10) || "root"}`);
  return true;
}

async function isAddressContract(ctx: AnalysisContext, address: string): Promise<boolean> {
  const addr = address.toLowerCase();

  if (ctx.bytecodeCache.has(addr)) {
    const cached = ctx.bytecodeCache.get(addr)!;
    return cached !== "0x" && cached.length > 2;
  }

  try {
    const bytecode = await rpc.getCode(ctx.network, addr as Address);
    const code = bytecode || "0x";
    ctx.bytecodeCache.set(addr, code);
    return code !== "0x" && code.length > 2;
  } catch (error) {
    logger.warn(`[Analyzer] Failed to check if ${addr} is contract:`, error);
    ctx.bytecodeCache.set(addr, "0x");
    return false;
  }
}

async function getBytecode(ctx: AnalysisContext, address: string): Promise<string> {
  const addr = address.toLowerCase();

  if (ctx.bytecodeCache.has(addr)) {
    return ctx.bytecodeCache.get(addr)!;
  }

  try {
    const bytecode = await rpc.getCode(ctx.network, addr as Address);
    const code = bytecode || "0x";
    ctx.bytecodeCache.set(addr, code);
    return code;
  } catch (error) {
    logger.warn(`[Analyzer] Failed to get bytecode for ${addr}:`, error);
    return "0x";
  }
}

// ============================================
// Address Detection in Source Code
// ============================================

/**
 * Extract hardcoded Ethereum addresses from source code
 */
export function extractHardcodedAddresses(sourceCode: string): string[] {
  const addressPattern = /\b(0x[a-fA-F0-9]{40})\b/g;
  const addresses = new Set<string>();
  let match;

  while ((match = addressPattern.exec(sourceCode)) !== null) {
    const address = match[1].toLowerCase();

    // Skip zero address and common sentinel values
    if (address === "0x0000000000000000000000000000000000000000") continue;
    if (address === "0xffffffffffffffffffffffffffffffffffffffff") continue;
    if (address === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") continue;
    if (address.match(/^0x0{38}0[1-9]$/)) continue;

    addresses.add(address);

    if (addresses.size >= MAX_HARDCODED_ADDRESSES_PER_FILE) {
      logger.warn(`[Analyzer] Hit max hardcoded addresses limit (${MAX_HARDCODED_ADDRESSES_PER_FILE})`);
      break;
    }
  }

  const result = Array.from(addresses);
  if (result.length > 0) {
    logger.info(`[Analyzer] Found ${result.length} hardcoded addresses in source`);
  }
  return result;
}

/**
 * Extract implementation addresses from source code patterns
 * Looks for common proxy patterns that declare implementation addresses
 */
export function extractDeclaredImplementations(sourceCode: string): string[] {
  const implementations = new Set<string>();

  // Pattern 1: address implementation = 0x...
  const implPattern1 = /(?:implementation|_implementation|impl|_impl)\s*=\s*(0x[a-fA-F0-9]{40})/gi;

  // Pattern 2: IMPLEMENTATION_SLOT, implementation storage patterns
  const implPattern2 = /(?:IMPLEMENTATION|Implementation).*?(0x[a-fA-F0-9]{40})/gi;

  // Pattern 3: upgradeTo(0x...), upgradeToAndCall(0x...)
  const implPattern3 = /upgradeTo(?:AndCall)?\s*\(\s*(0x[a-fA-F0-9]{40})/gi;

  // Pattern 4: _setImplementation(0x...)
  const implPattern4 = /_setImplementation\s*\(\s*(0x[a-fA-F0-9]{40})/gi;

  // Pattern 5: Beacon pattern - beacon address
  const beaconPattern = /(?:beacon|_beacon)\s*=\s*(0x[a-fA-F0-9]{40})/gi;

  const patterns = [implPattern1, implPattern2, implPattern3, implPattern4, beaconPattern];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sourceCode)) !== null) {
      const addr = match[1].toLowerCase();
      if (addr !== "0x0000000000000000000000000000000000000000") {
        implementations.add(addr);
      }
    }
  }

  const result = Array.from(implementations);
  if (result.length > 0) {
    logger.info(`[Analyzer] Found ${result.length} declared implementation addresses in source patterns`);
  }
  return result;
}

// ============================================
// Phase 1: On-chain Analysis (RPC + Basescan)
// ============================================

async function analyzeContractOnChain(
  address: string,
  ctx: AnalysisContext
): Promise<AnalyzedContract> {
  const normalizedAddress = address.toLowerCase() as Address;

  logger.info(`[Analyzer] ════════════════════════════════════════`);
  logger.info(`[Analyzer] ON-CHAIN ANALYSIS: ${normalizedAddress}`);
  logger.info(`[Analyzer] ════════════════════════════════════════`);

  // Step 1: Get bytecode via RPC
  logger.info(`[Analyzer] [1/5] Getting bytecode from RPC...`);
  const bytecode = await getBytecode(ctx, normalizedAddress);

  if (!bytecode || bytecode === "0x") {
    logger.info(`[Analyzer] ⚪ ${normalizedAddress} is an EOA (no bytecode)`);
    return {
      address: normalizedAddress,
      kindOnChain: "EOA",
      verified: false,
      sourceType: "none",
      tags: {},
    };
  }

  logger.info(`[Analyzer] ✅ CONTRACT detected (${bytecode.length} chars bytecode)`);

  // Step 2: Detect proxy patterns via RPC (EIP-1967, EIP-1167)
  logger.info(`[Analyzer] [2/5] Detecting proxy patterns via RPC...`);
  const [eip1967Info, minimalProxyInfo] = await Promise.all([
    rpc.detectEip1967Proxy(ctx.network, normalizedAddress),
    Promise.resolve(rpc.detectMinimalProxy(bytecode as Hex)),
  ]);

  let kindOnChain: ContractKindOnChain = "CONTRACT_SIMPLE";
  const tags: ContractTags = {};
  let implementationAddress: string | undefined;
  const discoveredImplementations: string[] = [];

  if (eip1967Info.isProxy) {
    kindOnChain = "PROXY";
    tags.hasEip1967ImplSlot = true;
    implementationAddress = eip1967Info.implementationAddress?.toLowerCase();
    tags.implementationAddress = implementationAddress;
    if (implementationAddress) {
      discoveredImplementations.push(implementationAddress);
    }
    if (eip1967Info.adminAddress) {
      tags.proxyAdmin = eip1967Info.adminAddress;
    }
    logger.info(`[Analyzer] 🔗 EIP-1967 PROXY detected → impl: ${implementationAddress}`);
  } else if (minimalProxyInfo.isMinimalProxy) {
    kindOnChain = "PROXY";
    tags.isMinimalProxy = true;
    implementationAddress = minimalProxyInfo.implementationAddress?.toLowerCase();
    tags.implementationAddress = implementationAddress;
    if (implementationAddress) {
      discoveredImplementations.push(implementationAddress);
    }
    logger.info(`[Analyzer] 🔗 EIP-1167 minimal PROXY detected → impl: ${implementationAddress}`);
  } else {
    logger.info(`[Analyzer] ⚪ Simple CONTRACT (no proxy pattern from RPC)`);
  }

  // Step 3: Get creator info from Basescan (ALWAYS for every contract!)
  logger.info(`[Analyzer] [3/5] Getting creator info from Basescan...`);
  const creatorInfo = await explorer.getContractCreatorAndCreationTx(ctx.network, normalizedAddress);

  let creatorAddress: string | undefined;
  let creatorIsContract = false;
  let creationTxHash: string | undefined;

  if (creatorInfo.creatorAddress) {
    creatorAddress = creatorInfo.creatorAddress.toLowerCase();
    creationTxHash = creatorInfo.creationTxHash;

    // Check if creator is a contract (factory pattern)
    creatorIsContract = await isAddressContract(ctx, creatorAddress);

    logger.info(`[Analyzer] 📦 Creator: ${creatorAddress}`);
    logger.info(`[Analyzer]    - Is contract (factory): ${creatorIsContract}`);
    logger.info(`[Analyzer]    - Creation tx: ${creationTxHash}`);
  } else {
    logger.info(`[Analyzer] ⚠️ No creator info found from Basescan`);
  }

  // Step 4: Detect contracts created by this contract (factory forward)
  logger.info(`[Analyzer] [4/5] Detecting created contracts (factory forward)...`);
  const createdContracts = await detectCreatedContracts(normalizedAddress, ctx);
  if (createdContracts.length > 0) {
    tags.isFactory = true;
    logger.info(`[Analyzer] 🏭 FACTORY detected - created ${createdContracts.length} contracts`);
    for (const created of createdContracts.slice(0, 5)) {
      logger.info(`[Analyzer]    - ${created}`);
    }
    if (createdContracts.length > 5) {
      logger.info(`[Analyzer]    - ... and ${createdContracts.length - 5} more`);
    }
  }

  // Step 5: Detect runtime callees
  logger.info(`[Analyzer] [5/5] Detecting runtime callees...`);
  const runtimeCallees = await detectRuntimeCallees(normalizedAddress, ctx);
  if (runtimeCallees.length > 0) {
    logger.info(`[Analyzer] 📞 Found ${runtimeCallees.length} runtime callees`);
  }

  return {
    address: normalizedAddress,
    kindOnChain,
    verified: false,
    sourceType: "none",
    bytecode,
    creatorAddress,
    creatorIsContract,
    creationTxHash,
    implementationAddress,
    discoveredImplementations,
    runtimeCallees,
    createdContracts,
    tags,
  };
}

async function detectCreatedContracts(address: string, ctx: AnalysisContext): Promise<string[]> {
  try {
    const internalTxs = await explorer.getInternalTransactions(ctx.network, address, {
      page: 1,
      offset: 100,
    });

    const created = new Set<string>();

    for (const tx of internalTxs) {
      if (
        tx.from.toLowerCase() === address.toLowerCase() &&
        tx.type === "create" &&
        tx.contractAddress
      ) {
        created.add(tx.contractAddress.toLowerCase());
      }
    }

    return Array.from(created);
  } catch (error) {
    logger.warn(`[Analyzer] Failed to detect created contracts:`, error);
    return [];
  }
}

async function detectRuntimeCallees(address: string, ctx: AnalysisContext): Promise<string[]> {
  try {
    const internalTxs = await explorer.getInternalTransactions(ctx.network, address, {
      page: 1,
      offset: 50,
    });

    const callees = new Set<string>();

    for (const tx of internalTxs) {
      if (tx.from.toLowerCase() === address.toLowerCase() && tx.to) {
        const callee = tx.to.toLowerCase();
        if (callee !== address.toLowerCase() && tx.type !== "create") {
          callees.add(callee);
        }
      }
    }

    return Array.from(callees);
  } catch (error) {
    logger.warn(`[Analyzer] Failed to detect runtime callees:`, error);
    return [];
  }
}

// ============================================
// Phase 2: Source Code Analysis
// ============================================

function parseSourceFiles(sourceCodeRaw: string, contractName: string): { path: string; content: string }[] {
  const sourceFiles: { path: string; content: string }[] = [];

  if (sourceCodeRaw.startsWith("{") || sourceCodeRaw.startsWith("{{")) {
    try {
      let sourceJson = sourceCodeRaw;
      if (sourceJson.startsWith("{{")) {
        sourceJson = sourceJson.slice(1, -1);
      }

      const parsed = JSON.parse(sourceJson);

      if (parsed.sources) {
        for (const [path, fileData] of Object.entries(parsed.sources)) {
          const content = (fileData as { content: string }).content;
          if (content) {
            sourceFiles.push({ path, content });
          }
        }
      } else {
        for (const [path, content] of Object.entries(parsed)) {
          if (typeof content === "string") {
            sourceFiles.push({ path, content });
          } else if ((content as { content: string }).content) {
            sourceFiles.push({ path, content: (content as { content: string }).content });
          }
        }
      }
    } catch (e) {
      sourceFiles.push({
        path: `${contractName || "Contract"}.sol`,
        content: sourceCodeRaw,
      });
    }
  } else {
    sourceFiles.push({
      path: `${contractName || "Contract"}.sol`,
      content: sourceCodeRaw,
    });
  }

  return sourceFiles;
}

async function analyzeContractSource(
  contract: AnalyzedContract,
  ctx: AnalysisContext
): Promise<AnalyzedSource> {
  const { address } = contract;
  const { network } = ctx;

  logger.info(`[Analyzer] ════════════════════════════════════════`);
  logger.info(`[Analyzer] SOURCE ANALYSIS: ${address}`);
  logger.info(`[Analyzer] ════════════════════════════════════════`);

  const result: AnalyzedSource = {
    files: [],
    typeDefs: [],
    hardcodedAddresses: [],
    declaredImplementations: [],
  };

  // Step 1: Try Basescan for verified source (FULL metadata)
  logger.info(`[Analyzer] [1/3] Checking Basescan for verified source...`);
  const sourceInfo = await explorer.getContractSourceInfo(network, address);

  if (sourceInfo.hasSource && sourceInfo.sourceCodeRaw) {
    logger.info(`[Analyzer] ✅ VERIFIED SOURCE found: ${sourceInfo.contractName}`);
    logger.info(`[Analyzer]    - Compiler: ${sourceInfo.compilerVersion}`);
    logger.info(`[Analyzer]    - Optimization: ${sourceInfo.optimizationUsed} (${sourceInfo.runs} runs)`);
    logger.info(`[Analyzer]    - EVM Version: ${sourceInfo.evmVersion}`);
    logger.info(`[Analyzer]    - Proxy flag: ${sourceInfo.proxyFlag}`);
    if (sourceInfo.implementation) {
      logger.info(`[Analyzer]    - Basescan implementation: ${sourceInfo.implementation}`);
    }

    const sourceFiles = parseSourceFiles(sourceInfo.sourceCodeRaw, sourceInfo.contractName || "Contract");
    logger.info(`[Analyzer]    - ${sourceFiles.length} source files`);

    // Update contract with all metadata
    contract.verified = true;
    contract.sourceType = "verified";
    contract.name = sourceInfo.contractName;
    contract.compilerVersion = sourceInfo.compilerVersion;
    contract.optimizationUsed = sourceInfo.optimizationUsed;
    contract.runs = sourceInfo.runs;
    contract.evmVersion = sourceInfo.evmVersion;
    contract.library = sourceInfo.library;
    contract.licenseType = sourceInfo.licenseType;
    contract.constructorArguments = sourceInfo.constructorArguments;
    contract.swarmSource = sourceInfo.swarmSource;

    // Store in tags too
    contract.tags.compilerVersion = sourceInfo.compilerVersion;
    contract.tags.optimizationUsed = sourceInfo.optimizationUsed;
    contract.tags.runs = sourceInfo.runs;
    contract.tags.evmVersion = sourceInfo.evmVersion;
    contract.tags.swarmSource = sourceInfo.swarmSource;

    // Parse ABI
    if (sourceInfo.abiRaw) {
      try {
        contract.abi = JSON.parse(sourceInfo.abiRaw);
        contract.abiRaw = sourceInfo.abiRaw;
        logger.info(`[Analyzer]    - ${contract.abi?.length || 0} ABI items`);
      } catch (e) {
        logger.warn(`[Analyzer] Failed to parse ABI: ${e}`);
      }
    }

    // IMPORTANT: Check if Basescan says this is a proxy with implementation
    if (sourceInfo.proxyFlag === "1" && sourceInfo.implementation) {
      const implAddr = sourceInfo.implementation.toLowerCase();
      logger.info(`[Analyzer] 🔗 Basescan proxy flag detected → impl: ${implAddr}`);

      contract.kindOnChain = "PROXY";
      contract.implementationAddress = implAddr;
      contract.tags.proxyFlag = "1";
      contract.tags.implementationAddress = implAddr;

      // Add to discovered implementations
      if (!contract.discoveredImplementations) {
        contract.discoveredImplementations = [];
      }
      if (!contract.discoveredImplementations.includes(implAddr)) {
        contract.discoveredImplementations.push(implAddr);
      }
    }

    result.files = sourceFiles.map((f) => ({ ...f, sourceType: "verified" as const }));
    contract.sourceFiles = result.files;

  } else {
    logger.info(`[Analyzer] ⚪ No verified source for ${address}`);

    // Step 1.5: For proxies, try implementation source
    if (contract.kindOnChain === "PROXY" && contract.implementationAddress) {
      logger.info(`[Analyzer] [1.5/3] Proxy detected - trying implementation source: ${contract.implementationAddress}`);

      const implSourceInfo = await explorer.getContractSourceInfo(network, contract.implementationAddress);

      if (implSourceInfo.hasSource && implSourceInfo.sourceCodeRaw) {
        logger.info(`[Analyzer] ✅ IMPLEMENTATION SOURCE found: ${implSourceInfo.contractName}`);

        const sourceFiles = parseSourceFiles(implSourceInfo.sourceCodeRaw, implSourceInfo.contractName || "Implementation");

        contract.verified = true;
        contract.sourceType = "verified";
        contract.name = implSourceInfo.contractName;
        contract.compilerVersion = implSourceInfo.compilerVersion;
        contract.optimizationUsed = implSourceInfo.optimizationUsed;
        contract.tags.compilerVersion = implSourceInfo.compilerVersion;
        contract.tags.optimizationUsed = implSourceInfo.optimizationUsed;

        if (implSourceInfo.abiRaw) {
          try {
            contract.abi = JSON.parse(implSourceInfo.abiRaw);
            contract.abiRaw = implSourceInfo.abiRaw;
          } catch (e) {
            logger.warn(`[Analyzer] Failed to parse implementation ABI: ${e}`);
          }
        }

        result.files = sourceFiles.map((f) => ({ ...f, sourceType: "verified" as const }));
        contract.sourceFiles = result.files;
      }
    }

    // Step 2: Try ABI-only
    if (result.files.length === 0) {
      logger.info(`[Analyzer] [2/3] Checking for ABI-only...`);
      const abiResult = await explorer.getContractAbiOnly(network, address);

      if (abiResult.hasAbi && abiResult.abiRaw) {
        try {
          contract.abi = JSON.parse(abiResult.abiRaw);
          contract.abiRaw = abiResult.abiRaw;
          logger.info(`[Analyzer] ✅ ABI-only found (${contract.abi?.length} items)`);
        } catch (e) {
          logger.warn(`[Analyzer] Failed to parse ABI-only: ${e}`);
        }
      }
    }

    // Step 3: Panoramix decompilation
    if (result.files.length === 0 && contract.bytecode && contract.bytecode !== "0x") {
      logger.info(`[Analyzer] [3/3] Trying Panoramix decompilation...`);

      const decompResult = await decompileContract(address, network, contract.bytecode);

      if (decompResult.success) {
        logger.info(`[Analyzer] ✅ DECOMPILED via ${decompResult.method} (${decompResult.decompiled.length} chars)`);

        // Check if Panoramix returned a "failed" message (noSource flag)
        if (decompResult.noSource) {
          logger.warn(`[Analyzer] ⚠️ Panoramix returned failure message - no usable source`);
          contract.noSource = true;
          contract.decompileError = decompResult.decompiled; // Store the error message for AI context
          contract.tags.decompileError = decompResult.decompiled;
        }

        contract.verified = false;
        contract.sourceType = "decompiled";
        result.files = [{
          path: "Decompiled.sol",
          content: decompResult.decompiled,
          sourceType: "decompiled",
        }];
        contract.sourceFiles = result.files;
      } else {
        logger.warn(`[Analyzer] ❌ Panoramix FAILED: ${decompResult.error}`);
        contract.sourceType = "none";
        contract.noSource = true;
        contract.decompileError = decompResult.error;
        contract.tags.decompileError = decompResult.error;
      }
    }
  }

  // Parse all source files for types, hardcoded addresses, and implementations
  for (const file of result.files) {
    // Type definitions - pass the file path so we know which file declares each type
    const types = parseSourceForTypes(file.content, contract.address, ctx.rootAddress, file.path);
    result.typeDefs.push(...types);

    // Hardcoded addresses
    const addrs = extractHardcodedAddresses(file.content);
    for (const addr of addrs) {
      if (addr !== contract.address && !result.hardcodedAddresses.includes(addr)) {
        result.hardcodedAddresses.push(addr);
      }
    }

    // Declared implementations (from proxy patterns in source)
    const impls = extractDeclaredImplementations(file.content);
    for (const impl of impls) {
      if (impl !== contract.address && !result.declaredImplementations.includes(impl)) {
        result.declaredImplementations.push(impl);
        logger.info(`[Analyzer] 🔗 Found declared implementation in source: ${impl}`);
      }
    }
  }

  // Deduplicate
  result.hardcodedAddresses = [...new Set(result.hardcodedAddresses)];
  result.declaredImplementations = [...new Set(result.declaredImplementations)];

  logger.info(`[Analyzer] Source analysis complete:`);
  logger.info(`[Analyzer]    - ${result.files.length} files`);
  logger.info(`[Analyzer]    - ${result.typeDefs.length} type definitions`);
  logger.info(`[Analyzer]    - ${result.hardcodedAddresses.length} hardcoded addresses`);
  logger.info(`[Analyzer]    - ${result.declaredImplementations.length} declared implementations`);

  return result;
}

// ============================================
// Type Detection from Source Code
// ============================================

export function parseSourceForTypes(
  sourceCode: string,
  contractAddress: string,
  rootAddress: string,
  sourcePath: string
): DetectedType[] {
  const types: DetectedType[] = [];
  const isRoot = contractAddress.toLowerCase() === rootAddress.toLowerCase();

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
        isRootContractType: isRoot && instanciable,
        parents,
        interfaces,
        libraries: [],
        sourcePath,
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

  return types;
}

// ============================================
// Recursion - Enqueue Related Addresses
// ============================================

async function enqueueRelatedAddresses(
  contract: AnalyzedContract,
  sourceInfo: AnalyzedSource,
  ctx: AnalysisContext
): Promise<void> {
  const addr = contract.address;

  logger.info(`[Analyzer] ════════════════════════════════════════`);
  logger.info(`[Analyzer] ENQUEUEING RELATED for ${addr}`);
  logger.info(`[Analyzer] ════════════════════════════════════════`);

  let enqueueCount = 0;

  // 1) Proxy → Implementation (from RPC detection)
  if (contract.implementationAddress) {
    if (enqueue(ctx, {
      address: contract.implementationAddress,
      reason: "PROXY_IMPLEMENTATION",
      sourceAddress: addr,
    })) {
      enqueueCount++;
    }
  }

  // 2) All discovered implementations (from various sources)
  for (const impl of contract.discoveredImplementations ?? []) {
    if (impl !== contract.implementationAddress) {
      if (enqueue(ctx, {
        address: impl,
        reason: "PROXY_IMPLEMENTATION",
        sourceAddress: addr,
      })) {
        enqueueCount++;
      }
    }
  }

  // 3) Declared implementations from source code patterns
  for (const impl of sourceInfo.declaredImplementations) {
    const isContract = await isAddressContract(ctx, impl);
    if (isContract) {
      if (enqueue(ctx, {
        address: impl,
        reason: "SOURCE_DECLARED_IMPL",
        sourceAddress: addr,
      })) {
        enqueueCount++;
      }
    }
  }

  // 4) Creator contract (backward factory link)
  if (contract.creatorAddress && contract.creatorIsContract) {
    if (enqueue(ctx, {
      address: contract.creatorAddress,
      reason: "CREATOR_CONTRACT",
      sourceAddress: addr,
    })) {
      enqueueCount++;
    }
  }

  // 5) Contracts created by this contract (forward factory)
  for (const created of contract.createdContracts ?? []) {
    if (enqueue(ctx, {
      address: created,
      reason: "FACTORY_CREATED",
      sourceAddress: addr,
    })) {
      enqueueCount++;
    }
  }

  // 6) Runtime callees (CALL/DELEGATECALL/STATICCALL)
  for (const callee of contract.runtimeCallees ?? []) {
    if (enqueue(ctx, {
      address: callee,
      reason: "RUNTIME_CALLEE",
      sourceAddress: addr,
    })) {
      enqueueCount++;
    }
  }

  // 7) Hardcoded addresses (only if they are contracts)
  let hardcodedEnqueued = 0;
  for (const hardcoded of sourceInfo.hardcodedAddresses) {
    if (hardcodedEnqueued >= MAX_HARDCODED_TO_ENQUEUE) {
      logger.warn(`[Analyzer] Hit max hardcoded enqueue limit (${MAX_HARDCODED_TO_ENQUEUE})`);
      break;
    }

    if (ctx.visited.has(hardcoded) || ctx.pending.has(hardcoded)) {
      continue;
    }

    const isContract = await isAddressContract(ctx, hardcoded);
    if (isContract) {
      if (enqueue(ctx, {
        address: hardcoded,
        reason: "HARDCODED_ADDRESS",
        sourceAddress: addr,
      })) {
        enqueueCount++;
        hardcodedEnqueued++;
      }
    }
  }

  logger.info(`[Analyzer] Enqueued ${enqueueCount} new addresses`);
  logger.info(`[Analyzer] Queue: ${ctx.queue.length}, Visited: ${ctx.visited.size}, Pending: ${ctx.pending.size}`);
}

// ============================================
// Persistence
// ============================================

async function persistContract(
  contract: AnalyzedContract,
  sourceInfo: AnalyzedSource,
  ctx: AnalysisContext
): Promise<void> {
  const { analysisId } = ctx;

  logger.debug(`[Analyzer] Persisting: ${contract.address} (${contract.kindOnChain}, ${contract.sourceType})`);

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
      network: ctx.network,
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
      implementationAddress: contract.implementationAddress,
      swarmSource: contract.swarmSource,
      decompileError: contract.decompileError,
      noSource: contract.noSource ?? false,
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
      implementationAddress: contract.implementationAddress,
      swarmSource: contract.swarmSource,
      decompileError: contract.decompileError,
      noSource: contract.noSource ?? false,
    },
  });

  // Save source files
  for (const file of sourceInfo.files) {
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

async function buildEdges(
  contracts: AnalyzedContract[],
  sourcesMap: Map<string, AnalyzedSource>,
  ctx: AnalysisContext
): Promise<number> {
  const { analysisId, rootAddress } = ctx;

  logger.info(`[Analyzer] ════════════════════════════════════════`);
  logger.info(`[Analyzer] BUILDING GRAPH EDGES`);
  logger.info(`[Analyzer] ════════════════════════════════════════`);

  let edgeCount = 0;
  const contractAddresses = new Set(contracts.map((c) => c.address));

  for (const contract of contracts) {
    const sourceInfo = sourcesMap.get(contract.address);

    // IS_PROXY_OF edge (from RPC/Basescan proxy detection)
    if (contract.implementationAddress) {
      await prisma.edge.create({
        data: {
          analysisId,
          fromNodeId: `contract:${contract.address}`,
          toNodeId: `contract:${contract.implementationAddress}`,
          kind: "IS_PROXY_OF",
          evidenceJson: {
            implementationSlot: contract.tags.hasEip1967ImplSlot ? rpc.EIP1967_SLOTS.IMPLEMENTATION : undefined,
            isMinimalProxy: contract.tags.isMinimalProxy,
          },
        },
      });
      edgeCount++;
    }

    // SOURCE_DECLARED_IMPL edges (from source code patterns)
    if (sourceInfo) {
      for (const impl of sourceInfo.declaredImplementations) {
        // Skip if same as main implementation (avoid duplicate edges)
        if (impl === contract.implementationAddress) continue;

        const implIsContract = contractAddresses.has(impl);
        await prisma.edge.create({
          data: {
            analysisId,
            fromNodeId: `contract:${contract.address}`,
            toNodeId: implIsContract ? `contract:${impl}` : `address:${impl}`,
            kind: "SOURCE_DECLARED_IMPL",
            evidenceJson: {
              foundInSource: true,
            },
          },
        });
        edgeCount++;
      }
    }

    // CREATED_BY / CREATED edges
    if (contract.creatorAddress) {
      const creatorIsContract = contractAddresses.has(contract.creatorAddress);

      await prisma.edge.create({
        data: {
          analysisId,
          fromNodeId: `contract:${contract.address}`,
          toNodeId: creatorIsContract ? `contract:${contract.creatorAddress}` : `address:${contract.creatorAddress}`,
          kind: "CREATED_BY",
          evidenceJson: { txHash: contract.creationTxHash },
        },
      });
      edgeCount++;

      if (creatorIsContract) {
        await prisma.edge.create({
          data: {
            analysisId,
            fromNodeId: `contract:${contract.creatorAddress}`,
            toNodeId: `contract:${contract.address}`,
            kind: "CREATED",
            evidenceJson: { txHash: contract.creationTxHash },
          },
        });
        edgeCount++;
      }
    }

    // Source file and type edges
    if (sourceInfo && sourceInfo.files.length > 0) {
      // First, create HAS_SOURCE_FILE edges for all files
      for (const file of sourceInfo.files) {
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
      }

      // Track created types to avoid duplicates
      const createdTypes = new Set<string>();

      // Create type definitions - each type is only created once and linked to its declaring file
      for (const typeDef of sourceInfo.typeDefs) {
        const typeId = `typedef:${contract.address}:${typeDef.name}`;

        // Skip if we've already created this type (can happen with duplicate type names)
        if (createdTypes.has(typeId)) {
          continue;
        }
        createdTypes.add(typeId);

        // Find the source file that declares this type (using typeDef.sourcePath)
        const sourceFile = await prisma.sourceFile.findFirst({
          where: {
            analysisId,
            contractAddress: contract.address,
            path: typeDef.sourcePath,
          },
        });

        if (sourceFile) {
          await prisma.typeDef.create({
            data: {
              analysisId,
              sourceFileId: sourceFile.id,
              name: typeDef.name,
              kind: typeDef.kind,
              instanciable: typeDef.instanciable,
              isRootContractType: typeDef.isRootContractType,
              metadataJson: {
                parents: typeDef.parents,
                interfaces: typeDef.interfaces,
                libraries: typeDef.libraries,
              },
            },
          });
        }

        // Create DECLARES_TYPE edge only from the correct source file that declares this type
        const declaringSourceFileId = `source:${contract.address}:${typeDef.sourcePath}`;
        await prisma.edge.create({
          data: {
            analysisId,
            fromNodeId: declaringSourceFileId,
            toNodeId: typeId,
            kind: "DECLARES_TYPE",
          },
        });
        edgeCount++;

        // Note: We no longer create DEFINED_BY edges from Contract to TypeDef
        // TypeDefs are only linked via DECLARES_TYPE from their declaring SourceFile

        for (const parent of typeDef.parents) {
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

        for (const iface of typeDef.interfaces) {
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

        for (const lib of typeDef.libraries) {
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

      // REFERENCES_ADDRESS edges - deduplicate per address
      const referencedAddresses = new Set<string>();
      for (const addr of sourceInfo.hardcodedAddresses) {
        if (referencedAddresses.has(addr)) continue;
        referencedAddresses.add(addr);

        const addrIsContract = contractAddresses.has(addr);

        await prisma.edge.create({
          data: {
            analysisId,
            fromNodeId: `contract:${contract.address}`,
            toNodeId: addrIsContract ? `contract:${addr}` : `address:${addr}`,
            kind: "REFERENCES_ADDRESS",
          },
        });
        edgeCount++;
      }
    }

    // CALLS_RUNTIME edges
    for (const callee of contract.runtimeCallees ?? []) {
      const calleeIsContract = contractAddresses.has(callee);

      await prisma.edge.create({
        data: {
          analysisId,
          fromNodeId: `contract:${contract.address}`,
          toNodeId: calleeIsContract ? `contract:${callee}` : `address:${callee}`,
          kind: "CALLS_RUNTIME",
        },
      });
      edgeCount++;
    }
  }

  logger.info(`[Analyzer] Created ${edgeCount} graph edges`);
  return edgeCount;
}

// ============================================
// Main Analysis Pipeline
// ============================================

export async function runAnalysis(ctx: AnalysisContext): Promise<void> {
  const { analysisId, network, rootAddress, onProgress } = ctx;

  logger.info(`[Analyzer] ════════════════════════════════════════════════════════`);
  logger.info(`[Analyzer] STARTING ANALYSIS`);
  logger.info(`[Analyzer] ════════════════════════════════════════════════════════`);
  logger.info(`[Analyzer] Analysis ID: ${analysisId}`);
  logger.info(`[Analyzer] Root Address: ${rootAddress}`);
  logger.info(`[Analyzer] Network: ${network}`);
  logger.info(`[Analyzer] Max Contracts: ${MAX_CONTRACTS_PER_ANALYSIS}`);
  logger.info(`[Analyzer] ════════════════════════════════════════════════════════`);

  onProgress?.(5, "Initializing analysis...");

  // Initialize context
  const normalizedRoot = rootAddress.toLowerCase();
  ctx.queue = [{ address: normalizedRoot, reason: "ROOT" }];
  ctx.visited = new Set();
  ctx.pending = new Set([normalizedRoot]);
  ctx.bytecodeCache = new Map();

  const allContracts: AnalyzedContract[] = [];
  const sourcesMap = new Map<string, AnalyzedSource>();

  // Main Loop
  let explorationCount = 0;

  while (ctx.queue.length > 0 && ctx.visited.size < MAX_CONTRACTS_PER_ANALYSIS) {
    const item = ctx.queue.shift()!;
    const address = item.address;

    if (ctx.visited.has(address)) {
      ctx.pending.delete(address);
      continue;
    }

    ctx.pending.delete(address);
    ctx.visited.add(address);
    explorationCount++;

    const progress = 10 + Math.round((explorationCount / MAX_CONTRACTS_PER_ANALYSIS) * 60);
    onProgress?.(progress, `Analyzing contract ${explorationCount}: ${address.slice(0, 10)}...`);

    logger.info(`[Analyzer] ════════════════════════════════════════════════════════`);
    logger.info(`[Analyzer] CONTRACT #${explorationCount}/${MAX_CONTRACTS_PER_ANALYSIS}`);
    logger.info(`[Analyzer] Address: ${address}`);
    logger.info(`[Analyzer] Reason: ${item.reason}`);
    logger.info(`[Analyzer] Source: ${item.sourceAddress || "(root)"}`);
    logger.info(`[Analyzer] Queue: ${ctx.queue.length}, Visited: ${ctx.visited.size}, Pending: ${ctx.pending.size}`);
    logger.info(`[Analyzer] ════════════════════════════════════════════════════════`);

    try {
      // Phase 1: On-chain analysis (RPC + Basescan metadata)
      const contract = await analyzeContractOnChain(address, ctx);
      contract.recursionReason = item.reason;
      contract.recursionSource = item.sourceAddress;

      // Phase 2: Source code analysis (Basescan → Implementation → Panoramix)
      const sourceInfo = await analyzeContractSource(contract, ctx);

      // Phase 3: Enqueue ALL related addresses
      await enqueueRelatedAddresses(contract, sourceInfo, ctx);

      // Phase 4: Persist to database
      await persistContract(contract, sourceInfo, ctx);

      allContracts.push(contract);
      sourcesMap.set(address, sourceInfo);

    } catch (error) {
      logger.error(`[Analyzer] ❌ Failed to analyze ${address}:`, error);
    }
  }

  // Log why we stopped
  if (ctx.queue.length === 0) {
    logger.info(`[Analyzer] ✅ Queue empty - all reachable contracts analyzed`);
  } else {
    logger.warn(`[Analyzer] ⚠️ Hit max contracts limit (${MAX_CONTRACTS_PER_ANALYSIS})`);
    logger.warn(`[Analyzer] Remaining in queue: ${ctx.queue.length}`);
  }

  onProgress?.(75, "Building graph edges...");

  // Build Graph Edges
  const edgeCount = await buildEdges(allContracts, sourcesMap, ctx);

  logger.info(`[Analyzer] ════════════════════════════════════════════════════════`);
  logger.info(`[Analyzer] ANALYSIS COMPLETE`);
  logger.info(`[Analyzer] Contracts analyzed: ${allContracts.length}`);
  logger.info(`[Analyzer] Edges created: ${edgeCount}`);
  logger.info(`[Analyzer] ════════════════════════════════════════════════════════`);

  onProgress?.(90, "Analysis complete");
}
