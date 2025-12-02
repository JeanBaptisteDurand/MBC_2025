// ============================================
// Base Analyzer - Main analysis logic
// ============================================

import type { Address, Hex } from "viem";
import type {
  Network,
  ContractKindOnChain,
  SourceType,
  ContractTags,
} from "@baselens/core";
import { prisma } from "../db/prismaClient.js";
import { logger } from "../logger.js";
import * as rpc from "./client.js";
import * as explorer from "./explorer.js";
import { decompileContract } from "./decompiler.js";

// ============================================
// Types
// ============================================

export interface AnalysisContext {
  analysisId: string;
  network: Network;
  rootAddress: string;
  maxDepth: number;
  visited: Set<string>;
  queue: { address: string; depth: number }[];
  onProgress?: (progress: number, message: string) => void;
}

export interface ContractInfo {
  address: string;
  kindOnChain: ContractKindOnChain;
  verified: boolean;
  sourceType: SourceType;
  name?: string;
  bytecode?: string;
  abi?: unknown[];
  sourceFiles?: { path: string; content: string; sourceType: "verified" | "decompiled" }[];
  creatorAddress?: string;
  creationTxHash?: string;
  tags: ContractTags;
  proxyInfo?: {
    implementationAddress?: string;
    adminAddress?: string;
    beaconAddress?: string;
  };
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
 * Get contract creation info from Basescan
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
 * Get and analyze source code for a contract
 */
export async function analyzeContractSource(
  contractInfo: ContractInfo,
  network: Network
): Promise<ContractInfo> {
  const address = contractInfo.address;
  
  logger.info(`[Analyzer] === Analyzing source: ${address} ===`);
  
  // Step 1: Try to get verified source from Basescan
  logger.info(`[Analyzer] Step 1: Checking Basescan for verified source...`);
  const sourceData = await explorer.getContractSourceCode(network, address);
  
  if (sourceData?.verified) {
    logger.info(`[Analyzer] ✅ Found VERIFIED source: ${sourceData.contractName}`);
    logger.info(`[Analyzer]   - ${sourceData.sourceFiles.length} source files`);
    logger.info(`[Analyzer]   - ${sourceData.abi.length} ABI items`);
    logger.info(`[Analyzer]   - Compiler: ${sourceData.compilerVersion}`);
    
    contractInfo.verified = true;
    contractInfo.sourceType = "verified";
    contractInfo.name = sourceData.contractName;
    contractInfo.abi = sourceData.abi;
    contractInfo.sourceFiles = sourceData.sourceFiles.map((f) => ({
      ...f,
      sourceType: "verified" as const,
    }));
    
    // Update proxy info from Basescan if available
    if (sourceData.isProxy && sourceData.implementationAddress) {
      logger.info(`[Analyzer] Basescan indicates this is a proxy -> ${sourceData.implementationAddress}`);
      contractInfo.kindOnChain = "PROXY";
      contractInfo.proxyInfo = contractInfo.proxyInfo || {};
      contractInfo.proxyInfo.implementationAddress = sourceData.implementationAddress;
    }
  } else {
    // Step 2: Try Panoramix decompilation
    logger.info(`[Analyzer] Step 2: No verified source, trying Panoramix decompilation...`);
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
// Full Analysis Pipeline
// ============================================

/**
 * Run the full analysis pipeline
 */
export async function runAnalysis(ctx: AnalysisContext): Promise<void> {
  const { analysisId, network, rootAddress, maxDepth, onProgress } = ctx;
  
  logger.info(`[Analyzer] ========================================`);
  logger.info(`[Analyzer] STARTING ANALYSIS`);
  logger.info(`[Analyzer] Analysis ID: ${analysisId}`);
  logger.info(`[Analyzer] Root Address: ${rootAddress}`);
  logger.info(`[Analyzer] Network: ${network}`);
  logger.info(`[Analyzer] Max Depth: ${maxDepth}`);
  logger.info(`[Analyzer] ========================================`);
  
  onProgress?.(10, "Starting analysis...");
  
  // Initialize queue with root address
  ctx.queue = [{ address: rootAddress.toLowerCase(), depth: 0 }];
  ctx.visited = new Set();
  
  const allContracts: ContractInfo[] = [];
  
  // ============================================
  // Phase 1: On-chain exploration
  // ============================================
  
  logger.info(`[Analyzer] ========================================`);
  logger.info(`[Analyzer] PHASE 1: ON-CHAIN EXPLORATION`);
  logger.info(`[Analyzer] ========================================`);
  
  onProgress?.(15, "Phase 1: On-chain exploration...");
  
  let explorationCount = 0;
  while (ctx.queue.length > 0) {
    const { address, depth } = ctx.queue.shift()!;
    
    if (ctx.visited.has(address)) {
      logger.debug(`[Analyzer] Skipping already visited: ${address}`);
      continue;
    }
    if (depth > maxDepth) {
      logger.debug(`[Analyzer] Skipping depth ${depth} > maxDepth ${maxDepth}: ${address}`);
      continue;
    }
    
    ctx.visited.add(address);
    explorationCount++;
    
    logger.info(`[Analyzer] --- Exploring #${explorationCount}: ${address} (depth: ${depth}) ---`);
    
    try {
      const contractInfo = await analyzeContractOnChain(address, network);
      allContracts.push(contractInfo);
      
      // If it's a proxy, add implementation to queue
      if (contractInfo.proxyInfo?.implementationAddress) {
        const implAddress = contractInfo.proxyInfo.implementationAddress.toLowerCase();
        if (!ctx.visited.has(implAddress)) {
          logger.info(`[Analyzer] Queueing implementation: ${implAddress}`);
          ctx.queue.push({ address: implAddress, depth: depth + 1 });
        }
      }
      
    } catch (error) {
      logger.error(`[Analyzer] ❌ Failed to analyze ${address}:`, error);
    }
  }
  
  logger.info(`[Analyzer] Phase 1 complete: explored ${allContracts.length} addresses`);
  onProgress?.(30, `Found ${allContracts.length} contracts on-chain`);
  
  // Get creation info for all contracts
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
        
        // Check if creator is a contract (factory pattern)
        if (!ctx.visited.has(info.creator.toLowerCase())) {
          const creatorCode = await rpc.getCode(network, info.creator as Address);
          if (creatorCode && creatorCode !== "0x") {
            logger.info(`[Analyzer] Creator ${info.creator} is a contract (possible factory)`);
          }
        }
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
  
  // Prioritize: root contract, proxies, implementations
  const priorityOrder = [
    rootAddress.toLowerCase(),
    ...allContracts.filter((c) => c.kindOnChain === "PROXY").map((c) => c.address),
    ...allContracts.filter((c) => c.kindOnChain !== "PROXY" && c.kindOnChain !== "EOA").map((c) => c.address),
  ];
  
  const processedAddresses = new Set<string>();
  let sourceProgress = 45;
  const progressPerContract = 30 / Math.max(1, priorityOrder.length);
  let sourceCount = 0;
  
  for (const address of priorityOrder) {
    if (processedAddresses.has(address)) continue;
    processedAddresses.add(address);
    
    const contractIndex = allContracts.findIndex((c) => c.address === address);
    if (contractIndex === -1) continue;
    
    sourceCount++;
    logger.info(`[Analyzer] --- Source analysis #${sourceCount}: ${address} ---`);
    
    try {
      allContracts[contractIndex] = await analyzeContractSource(allContracts[contractIndex], network);
    } catch (error) {
      logger.error(`[Analyzer] ❌ Failed to get source for ${address}:`, error);
    }
    
    sourceProgress += progressPerContract;
    onProgress?.(Math.round(sourceProgress), `Analyzed source: ${address.slice(0, 10)}...`);
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
    
    // Creator edges
    if (contract.creatorAddress) {
      logger.debug(`[Analyzer] Creating CREATED_BY edge: ${contract.address} -> ${contract.creatorAddress}`);
      await prisma.edge.create({
        data: {
          analysisId,
          fromNodeId: `contract:${contract.address}`,
          toNodeId: `address:${contract.creatorAddress.toLowerCase()}`,
          kind: "CREATED_BY",
          evidenceJson: {
            txHash: contract.creationTxHash,
          },
        },
      });
      edgeCount++;
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
      }
    }
  }
  
  logger.info(`[Analyzer] Created ${edgeCount} graph edges`);
  logger.info(`[Analyzer] ========================================`);
  logger.info(`[Analyzer] ANALYSIS COMPLETE`);
  logger.info(`[Analyzer] ========================================`);
  
  onProgress?.(90, "Analysis complete");
}
