// ============================================
// RAG - Retrieval Augmented Generation
// ============================================

import { prisma, searchSimilarDocuments } from "../db/prismaClient.js";
import { logger } from "../logger.js";
import { chatCompletion, createEmbedding, type ChatMessage } from "./openai.js";

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

// ============================================
// Prompts
// ============================================

const RAG_SYSTEM_PROMPT = `You are a helpful assistant that answers questions about smart contracts on Base L2.
You have access to the following context from the contract analysis.
Use this context to answer the user's question accurately.
If the context doesn't contain enough information to answer, say so.
Be concise but thorough in your answers.`;

const RAG_USER_PROMPT = `Context from contract analysis:
{context}

User question: {question}

Please answer the question based on the context provided.`;

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
  logger.debug(`[RAG] Analysis ID: ${analysisId}, Limit: ${limit}`);

  // Create embedding for the query
  logger.info(`[RAG] Creating query embedding...`);
  const queryEmbedding = await createEmbedding(query);

  // Search similar documents
  logger.info(`[RAG] Searching similar documents in pgvector...`);
  const startTime = Date.now();
  const results = await searchSimilarDocuments(analysisId, queryEmbedding, limit);
  const duration = Date.now() - startTime;

  logger.info(`[RAG] ✅ Found ${results.length} relevant documents (${duration}ms)`);
  for (const doc of results) {
    logger.debug(`[RAG]   - ${doc.kind}:${doc.refId.slice(0, 20)}... (distance: ${doc.distance.toFixed(4)})`);
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
    logger.info(`[RAG] Looking for existing chat: ${chatId}`);
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

  logger.info(`[RAG] ✅ Created new chat: ${newChat.id}`);

  return {
    chatId: newChat.id,
    messages: [],
  };
}

/**
 * Build graph context string for the prompt
 */
function buildGraphContextString(graphContext?: GraphContext): string {
  if (!graphContext) return "";

  const parts: string[] = [];

  // Add visible nodes context
  if (graphContext.visibleNodes && graphContext.visibleNodes.length > 0) {
    parts.push("## Nodes Currently Visible on the Graph:");
    for (const node of graphContext.visibleNodes) {
      const name = node.name || node.address || node.id;
      parts.push(`- ${node.kind}: ${name}`);
    }
    parts.push("");
  }

  // Add edges context (showing relationships)
  if (graphContext.edges && graphContext.edges.length > 0) {
    parts.push("## Contract Relationships (Edges on the Graph):");
    // Group edges by kind for better readability
    const edgesByKind = new Map<string, typeof graphContext.edges>();
    for (const edge of graphContext.edges) {
      const existing = edgesByKind.get(edge.kind) || [];
      existing.push(edge);
      edgesByKind.set(edge.kind, existing);
    }

    for (const [kind, edges] of edgesByKind) {
      const kindLabel = kind.replace(/_/g, " ").toLowerCase();
      parts.push(`### ${kindLabel}:`);
      for (const edge of edges.slice(0, 20)) { // Limit to 20 per kind
        parts.push(`  - ${edge.from} → ${edge.to}`);
      }
      if (edges.length > 20) {
        parts.push(`  - ... and ${edges.length - 20} more`);
      }
    }
    parts.push("");
  }

  return parts.join("\n");
}

/**
 * Process a RAG chat message
 */
export async function processRagChat(
  analysisId: string,
  question: string,
  chatId?: string,
  graphContext?: GraphContext
): Promise<{
  chatId: string;
  answer: string;
}> {
  logger.info(`[RAG] ========================================`);
  logger.info(`[RAG] PROCESSING RAG CHAT`);
  logger.info(`[RAG] Analysis: ${analysisId}`);
  logger.info(`[RAG] Question: "${question.slice(0, 100)}..."`);
  if (graphContext) {
    logger.info(`[RAG] Graph context: ${graphContext.visibleNodes?.length || 0} nodes, ${graphContext.edges?.length || 0} edges`);
  }
  logger.info(`[RAG] ========================================`);

  // Get or create chat
  const chat = await getOrCreateChat(analysisId, chatId);

  // Build enhanced search query with node names for better vectorization
  let enhancedQuery = question;
  if (graphContext?.visibleNodes && graphContext.visibleNodes.length > 0) {
    const nodeNames = graphContext.visibleNodes
      .filter(n => n.name)
      .map(n => n.name)
      .slice(0, 10)
      .join(", ");
    if (nodeNames) {
      enhancedQuery = `${question}\n\nContext nodes: ${nodeNames}`;
    }
  }

  // Search for relevant context using enhanced query
  logger.info(`[RAG] Step 1: Searching for relevant context...`);
  const context = await searchRagDocuments(analysisId, enhancedQuery);

  // Build context string from vector search
  const vectorContextString = context.documents
    .map((doc) => `[${doc.kind}: ${doc.refId}]\n${doc.content}`)
    .join("\n\n---\n\n");

  // Build graph context string
  const graphContextString = buildGraphContextString(graphContext);

  // Combine contexts
  const fullContextString = [
    graphContextString,
    "## Relevant Code and Documentation:",
    vectorContextString || "No relevant context found.",
  ].filter(Boolean).join("\n\n");

  logger.debug(`[RAG] Full context: ${fullContextString.length} chars`);

  // Build messages
  const messages: ChatMessage[] = [
    { role: "system", content: RAG_SYSTEM_PROMPT },
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

  // Add current question with context
  const userPrompt = RAG_USER_PROMPT
    .replace("{context}", fullContextString)
    .replace("{question}", question);

  messages.push({ role: "user", content: userPrompt });

  // Generate answer
  logger.info(`[RAG] Step 2: Generating answer with OpenAI...`);
  const answer = await chatCompletion(messages);

  logger.info(`[RAG] ✅ Generated answer (${answer.length} chars)`);
  logger.debug(`[RAG] Answer preview: "${answer.slice(0, 200)}..."`);

  // Save messages to database
  logger.info(`[RAG] Step 3: Saving messages to database...`);
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
  logger.info(`[RAG] ========================================`);
  logger.info(`[RAG] RAG CHAT COMPLETE`);
  logger.info(`[RAG] ========================================`);

  return {
    chatId: chat.chatId,
    answer,
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
