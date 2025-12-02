// ============================================
// Graph Builder - Transform DB data to GraphData
// ============================================

import type {
  GraphData,
  Node,
  Edge,
  ContractNode,
  SourceFileNode,
  TypeDefNode,
  AddressNode,
  EdgeKind,
  ContractKindOnChain,
  TypeDefKind,
  GraphStats,
} from "@baselens/core";
import { prisma } from "../db/prismaClient.js";
import { logger } from "../logger.js";

/**
 * Build GraphData from database for an analysis
 */
export async function buildGraphData(analysisId: string): Promise<GraphData> {
  logger.info(`[GraphBuilder] ========================================`);
  logger.info(`[GraphBuilder] BUILDING GRAPH DATA`);
  logger.info(`[GraphBuilder] Analysis ID: ${analysisId}`);
  logger.info(`[GraphBuilder] ========================================`);
  
  const startTime = Date.now();
  
  // Fetch all data in parallel
  logger.info(`[GraphBuilder] Fetching data from database...`);
  const [analysis, contracts, sourceFiles, typeDefs, edges] = await Promise.all([
    prisma.analysis.findUnique({ where: { id: analysisId } }),
    prisma.contract.findMany({ where: { analysisId } }),
    prisma.sourceFile.findMany({ where: { analysisId } }),
    prisma.typeDef.findMany({ where: { analysisId } }),
    prisma.edge.findMany({ where: { analysisId } }),
  ]);
  
  logger.info(`[GraphBuilder] Data fetched:`);
  logger.info(`[GraphBuilder]   - Contracts: ${contracts.length}`);
  logger.info(`[GraphBuilder]   - Source files: ${sourceFiles.length}`);
  logger.info(`[GraphBuilder]   - Type definitions: ${typeDefs.length}`);
  logger.info(`[GraphBuilder]   - Edges: ${edges.length}`);
  
  if (!analysis) {
    logger.error(`[GraphBuilder] ❌ Analysis not found: ${analysisId}`);
    throw new Error(`Analysis not found: ${analysisId}`);
  }
  
  const nodes: Node[] = [];
  const graphEdges: Edge[] = [];
  const nodeIds = new Set<string>();
  
  // Track stats
  const stats: GraphStats = {
    totalContracts: 0,
    totalProxies: 0,
    totalSourceFiles: 0,
    totalTypeDefs: 0,
    verifiedContracts: 0,
    decompiledContracts: 0,
  };
  
  // ============================================
  // Build contract nodes
  // ============================================
  
  logger.info(`[GraphBuilder] Building contract nodes...`);
  
  for (const contract of contracts) {
    const nodeId = `contract:${contract.address}` as const;
    nodeIds.add(nodeId);
    
    const tags = contract.tagsJson as Record<string, unknown> | null;
    
    const contractNode: ContractNode = {
      kind: "contract",
      id: nodeId,
      address: contract.address,
      name: contract.name || undefined,
      isRoot: contract.address === analysis.rootAddress.toLowerCase(),
      kindOnChain: contract.kindOnChain as ContractKindOnChain,
      isFactory: Boolean(tags?.isFactory),
      verified: contract.verified,
      sourceType: contract.sourceType as "verified" | "decompiled" | "none",
      creatorAddress: contract.creatorAddress || undefined,
      creationTxHash: contract.creationTxHash || undefined,
      tags: tags as ContractNode["tags"],
    };
    
    nodes.push(contractNode);
    stats.totalContracts++;
    
    if (contract.kindOnChain === "PROXY") {
      stats.totalProxies++;
    }
    if (contract.verified) {
      stats.verifiedContracts++;
    } else if (contract.sourceType === "decompiled") {
      stats.decompiledContracts++;
    }
    
    logger.debug(`[GraphBuilder]   Contract: ${contract.address.slice(0, 10)}... (${contract.kindOnChain}, ${contract.sourceType})`);
  }
  
  // ============================================
  // Build source file nodes
  // ============================================
  
  logger.info(`[GraphBuilder] Building source file nodes...`);
  
  for (const sourceFile of sourceFiles) {
    const nodeId = `source:${sourceFile.contractAddress}:${sourceFile.path}` as `source:${string}`;
    nodeIds.add(nodeId);
    
    const sourceNode: SourceFileNode = {
      kind: "sourceFile",
      id: nodeId,
      contractAddress: sourceFile.contractAddress,
      path: sourceFile.path,
      sourceType: sourceFile.sourceType as "verified" | "decompiled",
    };
    
    nodes.push(sourceNode);
    stats.totalSourceFiles++;
    
    logger.debug(`[GraphBuilder]   Source: ${sourceFile.path} (${sourceFile.sourceType})`);
  }
  
  // ============================================
  // Build type definition nodes
  // ============================================
  
  logger.info(`[GraphBuilder] Building type definition nodes...`);
  
  // Build a map of sourceFile.id -> path for lookup
  const sourceFileIdToPath = new Map<string, string>();
  const sourceFileIdToAddress = new Map<string, string>();
  for (const sf of sourceFiles) {
    sourceFileIdToPath.set(sf.id, sf.path);
    sourceFileIdToAddress.set(sf.id, sf.contractAddress);
  }
  
  for (const typeDef of typeDefs) {
    const contractAddress = sourceFileIdToAddress.get(typeDef.sourceFileId) || "";
    const path = sourceFileIdToPath.get(typeDef.sourceFileId) || "";
    const sourceFileNodeId = `source:${contractAddress}:${path}` as `source:${string}`;
    const nodeId = `typedef:${contractAddress}:${typeDef.name}` as `typedef:${string}`;
    nodeIds.add(nodeId);
    
    const typeNode: TypeDefNode = {
      kind: "typeDef",
      id: nodeId,
      name: typeDef.name,
      typeKind: typeDef.kind as TypeDefKind,
      instanciable: typeDef.instanciable,
      isRootContractType: typeDef.isRootContractType,
      sourceFileId: sourceFileNodeId,
    };
    
    nodes.push(typeNode);
    stats.totalTypeDefs++;
    
    logger.debug(`[GraphBuilder]   TypeDef: ${typeDef.name} (${typeDef.kind})`);
  }
  
  // ============================================
  // Build address nodes (for creators, etc.)
  // ============================================
  
  logger.info(`[GraphBuilder] Building address nodes...`);
  
  // Collect all referenced addresses that aren't contracts
  const addressRefs = new Set<string>();
  
  for (const edge of edges) {
    if (edge.toNodeId.startsWith("address:")) {
      const address = edge.toNodeId.replace("address:", "");
      addressRefs.add(address);
    }
    if (edge.fromNodeId.startsWith("address:")) {
      const address = edge.fromNodeId.replace("address:", "");
      addressRefs.add(address);
    }
  }
  
  for (const address of addressRefs) {
    const nodeId = `address:${address}` as `address:${string}`;
    if (!nodeIds.has(nodeId)) {
      nodeIds.add(nodeId);
      
      const addressNode: AddressNode = {
        kind: "address",
        id: nodeId,
        address,
      };
      
      nodes.push(addressNode);
      logger.debug(`[GraphBuilder]   Address: ${address.slice(0, 10)}...`);
    }
  }
  
  // ============================================
  // Build edges
  // ============================================
  
  logger.info(`[GraphBuilder] Building edges...`);
  
  let skippedEdges = 0;
  
  for (const edge of edges) {
    // Only include edges where both nodes exist
    // (some edges might reference types that we didn't create nodes for)
    const fromExists = nodeIds.has(edge.fromNodeId) || !edge.fromNodeId.startsWith("typedef:");
    const toExists = nodeIds.has(edge.toNodeId) || !edge.toNodeId.startsWith("typedef:");
    
    if (!fromExists || !toExists) {
      // Skip edges to/from missing nodes
      skippedEdges++;
      continue;
    }
    
    const graphEdge: Edge = {
      id: edge.id,
      from: edge.fromNodeId as Edge["from"],
      to: edge.toNodeId as Edge["to"],
      kind: edge.kind as EdgeKind,
      evidence: edge.evidenceJson as Edge["evidence"],
    };
    
    graphEdges.push(graphEdge);
  }
  
  if (skippedEdges > 0) {
    logger.warn(`[GraphBuilder] Skipped ${skippedEdges} edges with missing nodes`);
  }
  
  const duration = Date.now() - startTime;
  
  logger.info(`[GraphBuilder] ========================================`);
  logger.info(`[GraphBuilder] GRAPH BUILD COMPLETE`);
  logger.info(`[GraphBuilder] Duration: ${duration}ms`);
  logger.info(`[GraphBuilder] Stats:`);
  logger.info(`[GraphBuilder]   - Total nodes: ${nodes.length}`);
  logger.info(`[GraphBuilder]   - Total edges: ${graphEdges.length}`);
  logger.info(`[GraphBuilder]   - Contracts: ${stats.totalContracts}`);
  logger.info(`[GraphBuilder]   - Proxies: ${stats.totalProxies}`);
  logger.info(`[GraphBuilder]   - Verified: ${stats.verifiedContracts}`);
  logger.info(`[GraphBuilder]   - Decompiled: ${stats.decompiledContracts}`);
  logger.info(`[GraphBuilder]   - Source files: ${stats.totalSourceFiles}`);
  logger.info(`[GraphBuilder]   - Type defs: ${stats.totalTypeDefs}`);
  logger.info(`[GraphBuilder] ========================================`);
  
  return {
    nodes,
    edges: graphEdges,
    stats,
  };
}

/**
 * Get a simplified graph summary for the analysis
 */
export async function getGraphSummary(analysisId: string): Promise<{
  nodeCount: number;
  edgeCount: number;
  contractCount: number;
  proxyCount: number;
  verifiedCount: number;
  decompiledCount: number;
}> {
  logger.info(`[GraphBuilder] Getting graph summary for ${analysisId}...`);
  
  const [contracts, edgeCount] = await Promise.all([
    prisma.contract.findMany({
      where: { analysisId },
      select: { kindOnChain: true, verified: true, sourceType: true },
    }),
    prisma.edge.count({ where: { analysisId } }),
  ]);
  
  const summary = {
    nodeCount: contracts.length,
    edgeCount,
    contractCount: contracts.length,
    proxyCount: contracts.filter((c) => c.kindOnChain === "PROXY").length,
    verifiedCount: contracts.filter((c) => c.verified).length,
    decompiledCount: contracts.filter((c) => c.sourceType === "decompiled").length,
  };
  
  logger.info(`[GraphBuilder] ✅ Summary: ${summary.nodeCount} nodes, ${summary.edgeCount} edges`);
  
  return summary;
}
