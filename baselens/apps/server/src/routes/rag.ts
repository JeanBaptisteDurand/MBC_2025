// ============================================
// RAG Chat Routes
// ============================================

import { Router } from "express";
import { z } from "zod";
import { logger } from "../logger.js";
import { processRagChat, getLatestChat, getChatHistory } from "../ai/rag.js";

const router = Router();

// ============================================
// Validation Schemas
// ============================================

const chatRequestSchema = z.object({
  analysisId: z.string().uuid(),
  chatId: z.string().uuid().optional(),
  question: z.string().min(1).max(2000),
  // Graph context from frontend
  graphContext: z.object({
    // Active nodes visible on the graph (with their names)
    visibleNodes: z.array(z.object({
      id: z.string(),
      kind: z.string(),
      name: z.string().optional(),
      address: z.string().optional(),
    })).optional(),
    // Edges showing relationships between nodes
    edges: z.array(z.object({
      kind: z.string(),
      from: z.string(),
      to: z.string(),
    })).optional(),
  }).optional(),
});

// ============================================
// POST /api/rag/chat - Send a chat message
// ============================================

router.post("/chat", async (req, res) => {
  try {
    const parsed = chatRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.format(),
      });
    }

    const { analysisId, chatId, question, graphContext } = parsed.data;

    const result = await processRagChat(analysisId, question, chatId, graphContext);

    return res.json({
      chatId: result.chatId,
      answer: result.answer,
    });
  } catch (error) {
    logger.error("Failed to process chat:", error);
    return res.status(500).json({ error: "Failed to process chat" });
  }
});

// ============================================
// GET /api/rag/chat - Get chat for an analysis
// ============================================

router.get("/chat", async (req, res) => {
  try {
    const analysisId = req.query.analysisId as string;
    const chatId = req.query.chatId as string | undefined;

    if (!analysisId) {
      return res.status(400).json({ error: "analysisId is required" });
    }

    // If chatId provided, get that specific chat
    if (chatId) {
      const history = await getChatHistory(chatId);
      return res.json({
        chatId,
        messages: history.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
      });
    }

    // Otherwise, get or create the latest chat
    const chat = await getLatestChat(analysisId);

    if (!chat) {
      // No chat exists yet, return empty
      return res.json({
        chatId: null,
        messages: [],
      });
    }

    return res.json({
      chatId: chat.chatId,
      messages: chat.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error("Failed to get chat:", error);
    return res.status(500).json({ error: "Failed to get chat" });
  }
});

// ============================================
// GET /api/rag/chat/:chatId/history - Get chat history
// ============================================

router.get("/chat/:chatId/history", async (req, res) => {
  try {
    const { chatId } = req.params;

    const history = await getChatHistory(chatId);

    return res.json({
      chatId,
      messages: history.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error("Failed to get chat history:", error);
    return res.status(500).json({ error: "Failed to get chat history" });
  }
});

export default router;

