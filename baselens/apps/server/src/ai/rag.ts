// ============================================
// RAG - Retrieval Augmented Generation
// ============================================
// BaseLens RAG Chat System - Enhanced for EVM/Base Network
//
// This RAG system provides AI-powered chat for BaseLens analyses with:
// 1. Complete analysis inventory (all graph nodes)
// 2. Enhanced question with analysis context
// 3. Layered context strategy (inventory + explanations + raw docs)
// 4. EVM-specific system prompt
// 5. Source tracking with contract addresses and node ids
//
// How it works:
// - When analysisId is provided, loads full graph node inventory
// - Enhances user question with analysis context for better vector search
// - Uses dynamic limit based on number of contracts/nodes
// - Builds layered context: inventory → explanations → raw documents
// - Returns sourcesUsed with contract addresses and node ids
// ============================================

import { prisma, searchSimilarDocuments } from "../db/prismaClient.js";
import { logger } from "../logger.js";
import { chatCompletion, createEmbedding, type ChatMessage } from "./openai.js";
import { buildGraphData } from "../base/graphBuilder.js";
import { extractTypeDefinition } from "../routes/source.js";
import type { Node, ContractNode, AddressNode } from "@baselens/core";

// ============================================
// Types
// ============================================

export interface RagContext {
  documents: {
    id: string;
    kind: string;
    refId: string;
    content: string;
    distance: number;
  }[];
}

export interface GraphContext {
  visibleNodes?: {
    id: string;
    kind: string;
    name?: string;
    address?: string;
  }[];
  edges?: {
    kind: string;
    from: string;
    to: string;
  }[];
}

export interface SourceUsed {
  kind: string;
  refId: string;
  contractAddress?: string;
  nodeId?: string;
  similarity: number;
  contentPreview?: string;
}

// ============================================
// Analysis Inventory Types
// ============================================

interface AnalysisInventory {
  contracts: {
    address: string;
    name?: string;
    type: string;
    chain: string;
    metadata?: {
      verified?: boolean;
      sourceType?: string;
      isFactory?: boolean;
      isProxy?: boolean;
      implementationAddress?: string;
    };
  }[];
  wallets: {
    address: string;
    type: "eoa" | "smart_wallet";
    role?: string;
    label?: string;
  }[];
  otherNodes: {
    nodeId: string;
    nodeType: string;
    linkedContract?: string;
    linkedWallet?: string;
    description?: string;
  }[];
}

// ============================================
// Prompts
// ============================================

const RAG_SYSTEM_PROMPT_EVM = `You are an expert assistant for EVM smart contracts on the Base network. You answer questions about smart contracts, type definitions, and graph relationships using ONLY the provided context.

CRITICAL RULES:
1. **Code Requests**: When the user asks to "show code", "show me the code", or requests source code, you MUST display the full source code from the "SOURCE CODE AND DOCUMENTATION" or "TYPE DEFINITIONS" sections. The code is provided in code blocks - copy it exactly.

2. **Type Definitions**: When asked about a type definition (like "TokenRecover"), look in the "TYPE DEFINITIONS" section. The full source code is provided there in code blocks.

3. **Edges/Relationships**: When asked about edges or relationships, use the information from the analysis overview. List them clearly without repetition.

4. **Single Contract Analyses**: If there's only one contract in the analysis, don't repeat its address unnecessarily. Be concise.

5. **Context Only**: Use ONLY the provided context. If code is in the context, show it. If it's not, say "The code is not available in the provided context" - do NOT say it's not included when it actually is.

6. **Formatting**: 
   - Use proper code blocks (\`\`\`solidity) for Solidity code
   - Use bullet points for lists
   - Be clear and structured

7. **No Hallucination**: If information isn't in the context, explicitly say so. Do NOT make up details.

Answer concisely and accurately based on the provided context.`;

const RAG_USER_PROMPT = `Context from contract analysis:
{context}

User question: {question}

Please answer the question based on the context provided.`;

// ============================================
// Analysis Inventory Builder
// ============================================

/**
 * Build complete analysis inventory with all graph nodes
 * This provides the AI with full knowledge of the analysis graph
 */
async function buildAnalysisInventory(analysisId: string): Promise<AnalysisInventory> {
  logger.info(`[RAG] Building complete analysis inventory...`);

  // Fetch analysis and graph data
  const [analysis, graphData] = await Promise.all([
    prisma.analysis.findUnique({ where: { id: analysisId } }),
    buildGraphData(analysisId),
  ]);

  if (!analysis) {
    throw new Error(`Analysis not found: ${analysisId} `);
  }

  const inventory: AnalysisInventory = {
    contracts: [],
    wallets: [],
    otherNodes: [],
  };

  // Process all nodes
  for (const node of graphData.nodes) {
    if (node.kind === "contract") {
      const contractNode = node as ContractNode;

      // Determine contract type
      let contractType = "smart_contract";
      if (contractNode.kindOnChain === "PROXY") {
        contractType = "proxy";
      } else if (contractNode.kindOnChain === "IMPLEMENTATION") {
        contractType = "implementation";
      } else if (contractNode.isFactory) {
        contractType = "factory";
      } else if (contractNode.kindOnChain === "EOA") {
        // Skip EOA as contracts, they'll be in wallets
        continue;
      }

      // Check if it's a library, abstract contract, or interface from typeDefs
      const typeDefs = graphData.nodes.filter(
        (n) => n.kind === "typeDef" && n.id.startsWith(`typedef:${contractNode.address}: `)
      );
      if (typeDefs.length > 0) {
        const typeDef = typeDefs[0];
        if (typeDef.kind === "typeDef") {
          if (typeDef.typeKind === "LIBRARY") {
            contractType = "library";
          } else if (typeDef.typeKind === "ABSTRACT_CONTRACT") {
            contractType = "abstract_contract";
          } else if (typeDef.typeKind === "INTERFACE") {
            contractType = "interface";
          }
        }
      }

      // Check if it's a deployable contract (has source code and can be deployed)
      if (contractNode.sourceType !== "none" && !contractNode.isFactory) {
        // Could be marked as deployable if needed, but for now we'll keep it as smart_contract
      }

      inventory.contracts.push({
        address: contractNode.address,
        name: contractNode.name,
        type: contractType,
        chain: analysis.network,
        metadata: {
          verified: contractNode.verified,
          sourceType: contractNode.sourceType,
          isFactory: contractNode.isFactory,
          isProxy: contractNode.kindOnChain === "PROXY",
          implementationAddress: contractNode.tags?.implementationAddress,
        },
      });
    } else if (node.kind === "address") {
      const addressNode = node as AddressNode;

      // Determine wallet type and role
      let walletType: "eoa" | "smart_wallet" = "eoa";
      let role: string | undefined;

      // Check if this address deployed contracts (deployer)
      const deployedContracts = graphData.edges.filter(
        (e) => e.from === `address:${addressNode.address} ` && e.kind === "CREATED"
      );

      if (deployedContracts.length > 0) {
        role = "deployer";
      }

      // Check if it's referenced as owner/admin in edges
      const ownerEdges = graphData.edges.filter(
        (e) => e.to === node.id && (e.kind === "REFERENCES_ADDRESS" || e.kind === "CREATED_BY")
      );
      if (ownerEdges.length > 0 && !role) {
        role = "user";
      }

      inventory.wallets.push({
        address: addressNode.address,
        type: walletType,
        role,
        label: addressNode.label,
      });
    } else {
      // Other node types (sourceFile, typeDef, event)
      let linkedContract: string | undefined;
      let linkedWallet: string | undefined;

      if (node.kind === "sourceFile") {
        linkedContract = node.contractAddress;
      } else if (node.kind === "typeDef") {
        // Extract contract address from sourceFileId
        const sourceFileId = node.sourceFileId;
        const match = sourceFileId.match(/^source:(0x[a-fA-F0-9]{40}):/);
        if (match) {
          linkedContract = match[1];
        }
      } else if (node.kind === "event") {
        linkedContract = node.contractAddress;
      }

      let description: string | undefined;
      if (node.kind === "typeDef") {
        description = node.name;
      } else if (node.kind === "sourceFile") {
        description = node.path;
      } else if (node.kind === "event") {
        description = node.signature;
      }

      inventory.otherNodes.push({
        nodeId: node.id,
        nodeType: node.kind,
        linkedContract,
        linkedWallet,
        description,
      });
    }
  }

  logger.info(`[RAG] ✅ Inventory built: ${inventory.contracts.length} contracts, ${inventory.wallets.length} wallets, ${inventory.otherNodes.length} other nodes`);

  return inventory;
}

/**
 * Format analysis inventory as a structured string for the LLM
 */
function formatAnalysisInventory(inventory: AnalysisInventory): string {
  const parts: string[] = [];

  parts.push("--- COMPLETE ANALYSIS INVENTORY (EVM / BASELENS) ---");
  parts.push("");

  // Smart Contracts
  if (inventory.contracts.length > 0) {
    parts.push(`SMART CONTRACTS(${inventory.contracts.length} total): `);
    for (const contract of inventory.contracts) {
      const nameLabel = contract.name ? `"${contract.name}"` : "";
      const metadataParts: string[] = [];
      if (contract.metadata?.verified) metadataParts.push("verified");
      if (contract.metadata?.isFactory) metadataParts.push("factory");
      if (contract.metadata?.isProxy) metadataParts.push("proxy");
      const metadataStr = metadataParts.length > 0 ? ` [${metadataParts.join(", ")}]` : "";

      parts.push(`  - ${contract.address} ${nameLabel} (type: ${contract.type}, chain: ${contract.chain}${metadataStr})`);
      if (contract.metadata?.implementationAddress) {
        parts.push(`    → implementation: ${contract.metadata.implementationAddress} `);
      }
    }
    parts.push("");
  }

  // Wallets
  if (inventory.wallets.length > 0) {
    parts.push(`WALLETS(${inventory.wallets.length} total): `);
    for (const wallet of inventory.wallets) {
      const roleStr = wallet.role ? `, role: ${wallet.role} ` : "";
      const labelStr = wallet.label ? ` (${wallet.label})` : "";
      parts.push(`  - ${wallet.address} (type: ${wallet.type}${roleStr})${labelStr} `);
    }
    parts.push("");
  }

  // Other Nodes
  if (inventory.otherNodes.length > 0) {
    parts.push(`OTHER NODES(${inventory.otherNodes.length} total): `);
    for (const node of inventory.otherNodes) {
      const linkedStr = node.linkedContract
        ? `, linked contract: ${node.linkedContract} `
        : node.linkedWallet
          ? `, linked wallet: ${node.linkedWallet} `
          : "";
      const descStr = node.description ? `, description: ${node.description} ` : "";
      parts.push(`  - ${node.nodeId} (${node.nodeType}${linkedStr}${descStr})`);
    }
    parts.push("");
  }

  parts.push("--- END INVENTORY ---");

  return parts.join("\n");
}

// ============================================
// RAG Search & Chat
// ============================================

/**
 * Search for relevant documents using vector similarity
 */
export async function searchRagDocuments(
  analysisId: string,
  query: string,
  limit: number = 5
): Promise<RagContext> {
  logger.info(`[RAG] Searching documents for query: "${query.slice(0, 50)}..."`);
  logger.debug(`[RAG] Analysis ID: ${analysisId}, Limit: ${limit} `);

  // Create embedding for the query
  logger.info(`[RAG] Creating query embedding...`);
  const queryEmbedding = await createEmbedding(query);

  // Search similar documents
  logger.info(`[RAG] Searching similar documents in pgvector...`);
  const startTime = Date.now();
  const results = await searchSimilarDocuments(analysisId, queryEmbedding, limit);
  const duration = Date.now() - startTime;

  logger.info(`[RAG] ✅ Found ${results.length} relevant documents(${duration}ms)`);
  for (const doc of results) {
    logger.debug(`[RAG] - ${doc.kind}:${doc.refId.slice(0, 20)}... (distance: ${doc.distance.toFixed(4)})`);
  }

  return {
    documents: results,
  };
}

/**
 * Get or create a chat session
 */
export async function getOrCreateChat(
  analysisId: string,
  chatId?: string
): Promise<{
  chatId: string;
  messages: { role: string; content: string; createdAt: Date }[];
}> {
  if (chatId) {
    logger.info(`[RAG] Looking for existing chat: ${chatId} `);
    const chat = await prisma.ragChat.findUnique({
      where: { id: chatId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (chat) {
      logger.info(`[RAG] ✅ Found existing chat with ${chat.messages.length} messages`);
      return {
        chatId: chat.id,
        messages: chat.messages.map((m) => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      };
    }
    logger.warn(`[RAG] Chat ${chatId} not found, creating new one`);
  }

  // Create new chat
  logger.info(`[RAG] Creating new chat for analysis ${analysisId}...`);
  const newChat = await prisma.ragChat.create({
    data: {
      analysisId,
    },
  });

  logger.info(`[RAG] ✅ Created new chat: ${newChat.id} `);

  return {
    chatId: newChat.id,
    messages: [],
  };
}

/**
 * Build graph context string for the prompt
 * Refactored to be more concise and avoid repetition
 */
function buildGraphContextString(graphContext?: GraphContext): string {
  if (!graphContext) return "";

  const parts: string[] = [];

  // Add visible nodes context (only if relevant)
  if (graphContext.visibleNodes && graphContext.visibleNodes.length > 0 && graphContext.visibleNodes.length <= 10) {
    const nodeList = graphContext.visibleNodes
      .map(n => n.name || n.address || n.id)
      .join(", ");
    parts.push(`** Visible nodes:** ${nodeList} `);
    parts.push("");
  }

  // Add edges context (showing relationships) - format more concisely
  if (graphContext.edges && graphContext.edges.length > 0) {
    parts.push("## Graph Relationships (Edges):");

    // Group edges by kind for better readability
    const edgesByKind = new Map<string, typeof graphContext.edges>();
    for (const edge of graphContext.edges) {
      const existing = edgesByKind.get(edge.kind) || [];
      existing.push(edge);
      edgesByKind.set(edge.kind, existing);
    }

    for (const [kind, edges] of edgesByKind) {
      const kindLabel = kind.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      parts.push(`** ${kindLabel}** (${edges.length}): `);

      // Format edges more concisely
      const edgeList = edges.slice(0, 15).map(edge => {
        // Extract readable names from node IDs
        const fromName = extractNodeName(edge.from);
        const toName = extractNodeName(edge.to);
        return `${fromName} → ${toName} `;
      }).join(", ");

      parts.push(edgeList);
      if (edges.length > 15) {
        parts.push(`... and ${edges.length - 15} more`);
      }
      parts.push("");
    }
  }

  return parts.join("\n");
}

/**
 * Extract readable name from node ID
 */
function extractNodeName(nodeId: string): string {
  if (nodeId.startsWith("contract:")) {
    return nodeId.replace("contract:", "").slice(0, 10) + "...";
  } else if (nodeId.startsWith("typedef:")) {
    const parts = nodeId.split(":");
    return parts[parts.length - 1]; // Return type name
  } else if (nodeId.startsWith("source:")) {
    const parts = nodeId.split(":");
    return parts[parts.length - 1]; // Return file name
  } else if (nodeId.startsWith("address:")) {
    return nodeId.replace("address:", "").slice(0, 10) + "...";
  }
  return nodeId;
}

/**
 * Build enhanced question with analysis context for better vector search
 */
async function buildEnhancedQuestion(
  analysisId: string,
  originalQuestion: string,
  graphContext?: GraphContext
): Promise<{ enhancedQuery: string; dynamicLimit: number }> {
  logger.info(`[RAG] Building enhanced question...`);

  // Get analysis summary and inventory for context
  const [analysis, summary, inventory] = await Promise.all([
    prisma.analysis.findUnique({ where: { id: analysisId } }),
    prisma.globalAnalysisSummary.findUnique({ where: { analysisId } }),
    buildAnalysisInventory(analysisId),
  ]);

  if (!analysis) {
    throw new Error(`Analysis not found: ${analysisId} `);
  }

  // Build enhanced question with context
  const contextParts: string[] = [];
  contextParts.push("Context: This question is about a BaseLens analysis on the Base network.");

  // Add contract addresses and labels
  if (inventory.contracts.length > 0) {
    const contractList = inventory.contracts
      .slice(0, 20) // Limit to first 20 for question enhancement
      .map((c) => {
        const nameStr = c.name ? `"${c.name}"` : "";
        return `${c.address}${nameStr ? ` ${nameStr}` : ""} `;
      })
      .join(", ");
    contextParts.push(`Contracts in this analysis: [${contractList}].`);
  }

  // Add node type information
  contextParts.push(
    "Node types include smart contracts, proxies, implementations, factories, libraries, abstract contracts, interfaces, deployable contracts, wallets, deployers, type definitions (contracts, interfaces, libraries, abstract contracts), etc."
  );

  // Add type definitions list if available
  const typeDefs = inventory.otherNodes.filter((n) => n.nodeType === "typeDef");
  if (typeDefs.length > 0) {
    const typeDefNames = typeDefs
      .slice(0, 15) // Limit to first 15
      .map((td) => td.description || td.nodeId.split(":").pop() || "")
      .filter(Boolean)
      .join(", ");
    if (typeDefNames) {
      contextParts.push(`Type definitions in this analysis include: ${typeDefNames}.`);
    }
  }

  // Add visible nodes from graph context if provided
  if (graphContext?.visibleNodes && graphContext.visibleNodes.length > 0) {
    const visibleNodeNames = graphContext.visibleNodes
      .filter((n) => n.name || n.address)
      .map((n) => n.name || n.address)
      .slice(0, 10)
      .join(", ");
    if (visibleNodeNames) {
      contextParts.push(`Currently visible nodes: ${visibleNodeNames}.`);
    }
  }

  contextParts.push(`Question: ${originalQuestion} `);

  const enhancedQuery = contextParts.join("\n");

  // Calculate dynamic limit based on analysis size
  // Formula: (numberOfContracts + numberOfNodes) * 2, with min 5 and max 20
  const totalNodes = inventory.contracts.length + inventory.wallets.length + inventory.otherNodes.length;
  const dynamicLimit = Math.min(Math.max((inventory.contracts.length + totalNodes) * 2, 5), 20);

  logger.info(`[RAG] ✅ Enhanced question built(${enhancedQuery.length} chars), dynamic limit: ${dynamicLimit} `);

  return { enhancedQuery, dynamicLimit };
}

/**
 * Build layered context: inventory → explanations → raw documents
 * Refactored to avoid repetition and ensure code is always included
 */
async function buildLayeredContext(
  analysisId: string,
  inventory: AnalysisInventory,
  vectorResults: RagContext["documents"],
  summary: { summary: string; securityNotes: string } | null,
  question: string
): Promise<{ contextString: string; sourcesUsed: SourceUsed[] }> {
  logger.info(`[RAG] Building layered context for question: "${question.slice(0, 50)}..."`);

  const contextParts: string[] = [];
  const sourcesUsed: SourceUsed[] = [];

  // Detect question type - expanded to catch more code requests
  const isCodeRequest = /show\s+(me\s+)?(the\s+)?code|code\s+of|source\s+code|give\s+me\s+(the\s+)?code/i.test(question);
  const isTypeDefRequest = /type\s+definition|typedef|interface|contract|library/i.test(question);
  const isEdgeRequest = /edge|relationship|relation|connect/i.test(question);

  // Detect if asking "what is/does/do X" about a type/contract - likely wants code to explain
  const isWhatQuestion = /what\s+(is|does|do)\s+\w+/i.test(question);

  // Also detect if asking about a specific type/contract name (likely wants code)
  // This catches questions like "what do tokenrecover" even if tokenrecover is lowercase
  const mentionsSpecificType = /\b(tokenrecover|ownable|erc20|basers|context|using)\b/i.test(question.toLowerCase());
  const mentionsTypeDef = /(what|show|give|code|explain).*(contract|interface|library|type)/i.test(question);

  // If asking "what" about a specific type/contract, include code to help explain
  const shouldIncludeCode = isCodeRequest || (isWhatQuestion && (mentionsSpecificType || mentionsTypeDef));

  if (shouldIncludeCode && !isCodeRequest) {
    logger.info(`[RAG] Question is asking about a type/contract, including code in context`);
  }

  logger.info(`[RAG] Code request: ${isCodeRequest}, TypeDef request: ${isTypeDefRequest}, Edge request: ${isEdgeRequest}, Should include code: ${shouldIncludeCode}`);

  // Layer 1: Brief Analysis Inventory (condensed to avoid repetition)
  if (inventory.contracts.length <= 3) {
    // For small analyses, include full inventory
    const inventoryString = formatAnalysisInventory(inventory);
    contextParts.push(inventoryString);
    contextParts.push("");
  } else {
    // For larger analyses, just list contracts
    contextParts.push("--- ANALYSIS OVERVIEW ---");
    if (inventory.contracts.length === 1) {
      // Single contract - be concise
      const contract = inventory.contracts[0];
      contextParts.push(`Contract: ${contract.address}${contract.name ? ` (${contract.name})` : ""} `);
    } else {
      contextParts.push(`Contracts(${inventory.contracts.length}): ${inventory.contracts.map(c => c.address).join(", ")} `);
    }
    if (inventory.wallets.length > 0) {
      contextParts.push(`Wallets(${inventory.wallets.length}): ${inventory.wallets.map(w => w.address).join(", ")} `);
    }
    contextParts.push("--- END OVERVIEW ---");
    contextParts.push("");
  }

  // If asking about edges, include graph data
  if (isEdgeRequest) {
    try {
      const graphData = await buildGraphData(analysisId);
      if (graphData.edges && graphData.edges.length > 0) {
        contextParts.push("## GRAPH EDGES (RELATIONSHIPS):");

        // Group edges by kind
        const edgesByKind = new Map<string, typeof graphData.edges>();
        for (const edge of graphData.edges) {
          const existing = edgesByKind.get(edge.kind) || [];
          existing.push(edge);
          edgesByKind.set(edge.kind, existing);
        }

        for (const [kind, edges] of edgesByKind) {
          const kindLabel = kind.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
          contextParts.push(`** ${kindLabel}** (${edges.length}): `);

          // Format edges concisely
          const edgeList = edges.map(edge => {
            const fromName = extractNodeName(edge.from);
            const toName = extractNodeName(edge.to);
            return `${fromName} → ${toName} `;
          }).join(", ");

          contextParts.push(edgeList);
          contextParts.push("");
        }
      }
    } catch (error) {
      logger.warn(`[RAG] Failed to fetch graph data for edges: `, error);
    }
  }

  // Layer 2: High-level explanation (global summary) - only if not asking for specific code
  if (summary && !shouldIncludeCode) {
    contextParts.push("## ANALYSIS SUMMARY:");
    contextParts.push(summary.summary);
    contextParts.push("");

    sourcesUsed.push({
      kind: "global",
      refId: "summary",
      similarity: 1.0,
      contentPreview: summary.summary.slice(0, 200),
    });
  }

  // Layer 3: Per-contract explanations (prefer explanations over raw code)
  // First, collect all contract addresses from vector results
  const contractAddresses = new Set<string>();
  for (const doc of vectorResults) {
    if (doc.kind === "contract") {
      contractAddresses.add(doc.refId.toLowerCase());
    }
  }

  // Fetch all contracts with explanations in one query
  const contractsWithExplanations = await prisma.contract.findMany({
    where: {
      analysisId,
      address: { in: Array.from(contractAddresses) },
      aiExplanation: { not: null },
    },
    select: {
      address: true,
      aiExplanation: true,
      name: true,
    },
  });

  // Build a map for quick lookup
  const explanationMap = new Map<string, { address: string; aiExplanation: string; name: string | null }>();
  for (const contract of contractsWithExplanations) {
    if (contract.aiExplanation) {
      explanationMap.set(contract.address.toLowerCase(), {
        address: contract.address,
        aiExplanation: contract.aiExplanation,
        name: contract.name,
      });
    }
  }

  // Separate documents: prioritize type definitions for code requests
  const explanationDocs: RagContext["documents"] = [];
  const typeDefDocs: RagContext["documents"] = [];
  const rawDocs: RagContext["documents"] = [];

  for (const doc of vectorResults) {
    if (doc.kind === "global") {
      // Already handled above
      continue;
    } else if (doc.kind === "type") {
      // Prioritize type definitions
      typeDefDocs.push(doc);
    } else if (doc.kind === "contract") {
      const contractAddress = doc.refId.toLowerCase();
      if (explanationMap.has(contractAddress) && !shouldIncludeCode) {
        // Only use explanations if not asking for code
        explanationDocs.push(doc);
      } else {
        rawDocs.push(doc);
      }
    } else {
      rawDocs.push(doc);
    }
  }

  // Sort type definitions by relevance (distance)
  typeDefDocs.sort((a, b) => a.distance - b.distance);

  // Layer 3: Type Definitions (prioritize for code requests)
  // Also search for specific type definitions mentioned in the question
  if (shouldIncludeCode && mentionsSpecificType) {
    // Extract type name from question if possible
    const typeNameMatch = question.match(/\b(tokenrecover|ownable|erc20|basers|context|using)\b/i);
    if (typeNameMatch) {
      const typeName = typeNameMatch[1];
      logger.info(`[RAG] Searching for type definition: ${typeName}`);

      // Find all contracts in the analysis
      for (const contract of inventory.contracts) {
        try {
          const sourceFiles = await prisma.sourceFile.findMany({
            where: {
              analysisId,
              contractAddress: contract.address.toLowerCase(),
            },
            include: {
              typeDefs: true,
            },
          });

          // Filter typeDefs by name (case-insensitive)
          const matchingTypeDefs = sourceFiles.flatMap(sf =>
            sf.typeDefs.filter(td => td.name.toLowerCase() === typeName.toLowerCase())
          );

          for (const typeDef of matchingTypeDefs) {
            // Find the source file for this typeDef
            const sourceFile = sourceFiles.find(sf => sf.typeDefs.some(td => td.id === typeDef.id));
            if (!sourceFile) continue;

            // Check if we already processed this type definition
            const alreadyProcessed = typeDefDocs.some(doc => doc.refId.includes(typeDef.name));
            if (!alreadyProcessed) {
              // Create a synthetic document for this type definition
              const syntheticDoc: RagContext["documents"][0] = {
                id: `synthetic-${typeDef.id}`,
                kind: "type",
                refId: `typedef:${contract.address.toLowerCase()}:${typeDef.name}`,
                content: `Type Definition: ${typeDef.name}`,
                distance: 0.5, // Medium relevance since it was mentioned
              };
              typeDefDocs.push(syntheticDoc);
              logger.info(`[RAG] ✅ Found type definition ${typeDef.name} in contract ${contract.address}`);
            }
          }
        } catch (error) {
          logger.warn(`[RAG] Error searching for type ${typeName} in contract ${contract.address}:`, error);
        }
      }
    }
  }

  if (typeDefDocs.length > 0) {
    contextParts.push("## TYPE DEFINITIONS:");
    if (shouldIncludeCode) {
      contextParts.push("IMPORTANT: The user is asking about code. Display the FULL source code for each type definition below using proper code blocks.");
    }
    contextParts.push("");
    for (const doc of typeDefDocs) {
      await processTypeDefinitionDoc(doc, analysisId, contextParts, sourcesUsed, shouldIncludeCode);
    }
    contextParts.push("");
  }

  // Layer 4: Contract explanations (skip if asking for code)
  if (explanationDocs.length > 0 && !shouldIncludeCode) {
    contextParts.push("## CONTRACT EXPLANATIONS:");
    for (const doc of explanationDocs) {
      const contractAddress = doc.refId.toLowerCase();
      const contract = explanationMap.get(contractAddress);

      if (contract) {
        contextParts.push(`### ${contract.name || contract.address} `);
        contextParts.push(contract.aiExplanation);
        contextParts.push("");

        sourcesUsed.push({
          kind: "contract",
          refId: contract.address,
          contractAddress: contract.address,
          nodeId: `contract:${contract.address} `,
          similarity: 1.0 - doc.distance,
          contentPreview: contract.aiExplanation.slice(0, 200),
        });
      }
    }
    contextParts.push("");
  }

  // Layer 5: Raw documents (source code, ABI, etc.)
  if (rawDocs.length > 0 || shouldIncludeCode) {
    contextParts.push("## SOURCE CODE AND DOCUMENTATION:");
    if (shouldIncludeCode) {
      contextParts.push("IMPORTANT: The user is asking about code. Display the FULL source code from the sections below using proper code blocks (```solidity).");
    }
    contextParts.push("");

    // For code requests, fetch full contract source code
    if (shouldIncludeCode) {
      // Get all unique contract addresses from vector results
      const contractAddressesToFetch = new Set<string>();
      for (const doc of vectorResults) {
        if (doc.kind === "contract") {
          contractAddressesToFetch.add(doc.refId.toLowerCase());
        } else if (doc.kind === "type" && doc.refId.startsWith("typedef:")) {
          const match = doc.refId.match(/^typedef:(0x[a-fA-F0-9]{40}):/);
          if (match) {
            contractAddressesToFetch.add(match[1].toLowerCase());
          }
        }
      }

      // Fetch full source code for each contract
      for (const contractAddress of contractAddressesToFetch) {
        try {
          const sourceFiles = await prisma.sourceFile.findMany({
            where: {
              analysisId,
              contractAddress,
            },
            orderBy: { path: "asc" },
          });

          if (sourceFiles.length > 0) {
            const contract = await prisma.contract.findFirst({
              where: { analysisId, address: contractAddress },
              select: { name: true },
            });

            contextParts.push(`### Contract: ${contract?.name || contractAddress}`);
            contextParts.push(`**Address:** ${contractAddress}`);
            contextParts.push("");

            // Include all source files
            for (const sourceFile of sourceFiles) {
              contextParts.push(`**File:** ${sourceFile.path}`);
              contextParts.push("```solidity");
              contextParts.push(sourceFile.content);
              contextParts.push("```");
              contextParts.push("");
            }

            sourcesUsed.push({
              kind: "contract",
              refId: contractAddress,
              contractAddress,
              nodeId: `contract:${contractAddress}`,
              similarity: 1.0,
              contentPreview: sourceFiles[0].content.slice(0, 200),
            });

            logger.info(`[RAG] ✅ Added full source code for contract ${contractAddress} (${sourceFiles.length} files)`);
          }
        } catch (error) {
          logger.warn(`[RAG] Failed to fetch source code for contract ${contractAddress}:`, error);
        }
      }
    }

    // Process raw documents
    for (const doc of rawDocs) {
      // Extract contract address from refId if it's a contract
      let contractAddress: string | undefined;
      let nodeId: string | undefined;
      let contentToUse = doc.content;

      if (doc.kind === "contract") {
        contractAddress = doc.refId.toLowerCase();
        nodeId = `contract:${contractAddress}`;

        // If we already included full source code above, skip the truncated version
        if (shouldIncludeCode) {
          continue;
        }
      } else if (doc.kind === "type" && doc.refId.startsWith("typedef:")) {
        // Type definitions are now handled separately in processTypeDefinitionDoc
        // This is a fallback for any that weren't processed
        const match = doc.refId.match(/^typedef:(0x[a-fA-F0-9]{40}):(.+)$/);
        if (match) {
          contractAddress = match[1].toLowerCase();
          nodeId = doc.refId;
          contentToUse = doc.content; // Will be processed by processTypeDefinitionDoc if needed
        }
      } else if (doc.refId.startsWith("source:")) {
        const match = doc.refId.match(/^source:(0x[a-fA-F0-9]{40}):/);
        if (match) {
          contractAddress = match[1].toLowerCase();
        }
        nodeId = doc.refId;
      }

      contextParts.push(`[${doc.kind}: ${doc.refId}]`);
      contextParts.push(contentToUse);
      contextParts.push("");

      sourcesUsed.push({
        kind: doc.kind,
        refId: doc.refId,
        contractAddress,
        nodeId,
        similarity: 1.0 - doc.distance,
        contentPreview: contentToUse.slice(0, 200),
      });
    }
  }

  const contextString = contextParts.join("\n\n");

  logger.info(`[RAG] ✅ Layered context built(${contextString.length} chars, ${sourcesUsed.length} sources)`);

  return { contextString, sourcesUsed };
}

/**
 * Process a type definition document - fetch full code and add to context
 */
async function processTypeDefinitionDoc(
  doc: RagContext["documents"][0],
  analysisId: string,
  contextParts: string[],
  sourcesUsed: SourceUsed[],
  isCodeRequest: boolean
): Promise<void> {
  const match = doc.refId.match(/^typedef:(0x[a-fA-F0-9]{40}):(.+)$/);
  if (!match) {
    logger.warn(`[RAG] Invalid type definition refId format: ${doc.refId} `);
    return;
  }

  const contractAddress = match[1].toLowerCase();
  const typeName = match[2];
  const nodeId = doc.refId;

  logger.info(`[RAG] Processing type definition: ${typeName} from contract ${contractAddress} `);

  try {
    // Fetch source file with type definition
    const sourceFiles = await prisma.sourceFile.findMany({
      where: {
        analysisId,
        contractAddress: contractAddress,
      },
      include: {
        typeDefs: {
          where: {
            name: typeName,
          },
        },
      },
    });

    const sourceFile = sourceFiles.find((sf) => sf.typeDefs.length > 0);

    if (!sourceFile || sourceFile.typeDefs.length === 0) {
      logger.warn(`[RAG] ⚠️ No source file found for type ${typeName} in contract ${contractAddress} `);
      // Use indexed content
      contextParts.push(`### Type: ${typeName} `);
      contextParts.push(doc.content);
      contextParts.push("");
      return;
    }

    const typeDef = sourceFile.typeDefs[0];

    // Always try to extract full code
    const extractedCode = extractTypeDefinition(
      sourceFile.content,
      typeName,
      typeDef.kind as "INTERFACE" | "LIBRARY" | "ABSTRACT_CONTRACT" | "CONTRACT_IMPL"
    );

    if (extractedCode) {
      // Format with full code
      contextParts.push(`### Type Definition: ${typeName}`);
      contextParts.push(`**Kind:** ${typeDef.kind}`);
      contextParts.push(`**Contract:** ${contractAddress}`);
      contextParts.push(`**Source File:** ${sourceFile.path}`);
      contextParts.push("");
      contextParts.push(`**Full Source Code:**`);
      contextParts.push("```solidity");
      contextParts.push(extractedCode);
      contextParts.push("```");
      contextParts.push("");

      sourcesUsed.push({
        kind: "type",
        refId: doc.refId,
        contractAddress,
        nodeId,
        similarity: 1.0 - doc.distance,
        contentPreview: extractedCode.slice(0, 200),
      });

      logger.info(`[RAG] ✅ Added full code for ${typeName} (${extractedCode.length} chars)`);
    } else {
      // Fallback to indexed content
      logger.warn(`[RAG] ⚠️ Could not extract code for ${typeName}, using indexed content`);
      contextParts.push(`### Type Definition: ${typeName}`);
      contextParts.push(`**Kind:** ${typeDef.kind}`);
      contextParts.push(`**Contract:** ${contractAddress}`);
      contextParts.push("");
      contextParts.push(doc.content);
      contextParts.push("");

      sourcesUsed.push({
        kind: "type",
        refId: doc.refId,
        contractAddress,
        nodeId,
        similarity: 1.0 - doc.distance,
        contentPreview: doc.content.slice(0, 200),
      });
    }
  } catch (error) {
    logger.error(`[RAG] ❌ Error processing type definition ${doc.refId}:`, error);
    // Fallback to indexed content
    contextParts.push(`### Type Definition: ${typeName || "Unknown"}`);
    contextParts.push(doc.content);
    contextParts.push("");
  }
}

/**
 * Process a RAG chat message with enhanced BaseLens features
 */
export async function processRagChat(
  analysisId: string,
  question: string,
  chatId?: string,
  graphContext?: GraphContext
): Promise<{
  chatId: string;
  answer: string;
  sourcesUsed: SourceUsed[];
}> {
  logger.info(`[RAG] ========================================`);
  logger.info(`[RAG] PROCESSING RAG CHAT (ENHANCED BASELENS)`);
  logger.info(`[RAG] Analysis: ${analysisId}`);
  logger.info(`[RAG] Question: "${question.slice(0, 100)}..."`);
  if (graphContext) {
    logger.info(`[RAG] Graph context: ${graphContext.visibleNodes?.length || 0} nodes, ${graphContext.edges?.length || 0} edges`);
  }
  logger.info(`[RAG] ========================================`);

  // Get or create chat
  const chat = await getOrCreateChat(analysisId, chatId);

  // Step 1: Build complete analysis inventory
  logger.info(`[RAG] Step 1: Building complete analysis inventory...`);
  const inventory = await buildAnalysisInventory(analysisId);

  // Step 2: Build enhanced question with analysis context
  logger.info(`[RAG] Step 2: Building enhanced question...`);
  const { enhancedQuery, dynamicLimit } = await buildEnhancedQuestion(
    analysisId,
    question,
    graphContext
  );

  // Step 3: Search for relevant context using enhanced query
  logger.info(`[RAG] Step 3: Searching for relevant context (limit: ${dynamicLimit})...`);
  const context = await searchRagDocuments(analysisId, enhancedQuery, dynamicLimit);

  // Step 4: Get analysis summary
  logger.info(`[RAG] Step 4: Fetching analysis summary...`);
  const summary = await prisma.globalAnalysisSummary.findUnique({
    where: { analysisId },
  });

  // Step 5: Build layered context (inventory → explanations → raw docs)
  logger.info(`[RAG] Step 5: Building layered context...`);
  const { contextString, sourcesUsed } = await buildLayeredContext(
    analysisId,
    inventory,
    context.documents,
    summary,
    question
  );

  // Step 6: Build graph context string (for visible nodes/edges)
  const graphContextString = buildGraphContextString(graphContext);

  // Combine all contexts
  const fullContextString = [
    graphContextString,
    contextString,
  ].filter(Boolean).join("\n\n");

  logger.debug(`[RAG] Full context: ${fullContextString.length} chars`);

  // Build messages
  const messages: ChatMessage[] = [
    { role: "system", content: RAG_SYSTEM_PROMPT_EVM },
  ];

  // Add chat history (last 5 messages)
  const recentMessages = chat.messages.slice(-5);
  logger.info(`[RAG] Adding ${recentMessages.length} recent messages to context`);
  for (const msg of recentMessages) {
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }

  // Add current question with context (use ORIGINAL question, not enhanced)
  const userPrompt = RAG_USER_PROMPT
    .replace("{context}", fullContextString)
    .replace("{question}", question);

  messages.push({ role: "user", content: userPrompt });

  // Generate answer
  logger.info(`[RAG] Step 6: Generating answer with OpenAI...`);
  const answer = await chatCompletion(messages);

  logger.info(`[RAG] ✅ Generated answer (${answer.length} chars)`);
  logger.debug(`[RAG] Answer preview: "${answer.slice(0, 200)}..."`);

  // Save messages to database
  logger.info(`[RAG] Step 7: Saving messages to database...`);
  await prisma.ragMessage.createMany({
    data: [
      {
        chatId: chat.chatId,
        role: "user",
        content: question,
      },
      {
        chatId: chat.chatId,
        role: "assistant",
        content: answer,
      },
    ],
  });

  logger.info(`[RAG] ✅ Saved user question and assistant answer`);
  logger.info(`[RAG] ✅ Sources used: ${sourcesUsed.length}`);
  logger.info(`[RAG] ========================================`);
  logger.info(`[RAG] RAG CHAT COMPLETE`);
  logger.info(`[RAG] ========================================`);

  return {
    chatId: chat.chatId,
    answer,
    sourcesUsed,
  };
}

/**
 * Get chat history
 */
export async function getChatHistory(chatId: string): Promise<{
  messages: { id: string; role: string; content: string; createdAt: Date }[];
}> {
  logger.info(`[RAG] Getting chat history for ${chatId}...`);

  const messages = await prisma.ragMessage.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
  });

  logger.info(`[RAG] ✅ Found ${messages.length} messages`);

  return {
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  };
}

/**
 * Get the latest chat for an analysis
 */
export async function getLatestChat(analysisId: string): Promise<{
  chatId: string;
  messages: { id: string; role: string; content: string; createdAt: Date }[];
} | null> {
  logger.info(`[RAG] Getting latest chat for analysis ${analysisId}...`);

  const chat = await prisma.ragChat.findFirst({
    where: { analysisId },
    orderBy: { createdAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!chat) {
    logger.info(`[RAG] No chat found for analysis ${analysisId}`);
    return null;
  }

  logger.info(`[RAG] ✅ Found chat ${chat.id} with ${chat.messages.length} messages`);

  return {
    chatId: chat.id,
    messages: chat.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  };
}
