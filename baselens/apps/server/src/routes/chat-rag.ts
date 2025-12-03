// ============================================
// x402 Protected RAG Chat Route
// ============================================

import { Router } from "express";
import { z } from "zod";
import { logger } from "../logger.js";
import { config } from "../config.js";
import { processRagChat } from "../ai/rag.js";
import { paymentMiddleware } from "x402-express";

const router = Router();

// ============================================
// Validation Schema
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
// x402 Payment Configuration
// ============================================

const payToAddress = (config.SERVER_PAY_TO_ADDRESS || "0x7d85bf7a82470837a1d832e4fa503a7ebf20ca97") as `0x${string}`;
const facilitatorUrl = config.X402_FACILITATOR_URL || "https://x402.org/facilitator";

// Log x402 configuration for debugging
logger.info("[x402] payToAddress:", payToAddress);
logger.info("[x402] facilitator URL:", facilitatorUrl);

// Configure facilitator - MUST use public facilitator for testnet
const facilitatorConfig = {
  url: facilitatorUrl,
};

// Define x402 routes configuration
// Charge: 0.01 USDC on Base Sepolia
// Note: x402-express interprets price as USDC amount (not in units)
// Route path is relative to where the router is mounted (/api/chat-rag)
const x402Routes = {
  "POST /": {
    price: "$0.01", // Use string format "$0.01" as recommended
    network: "base-sepolia", // ✅ MUST be exactly this for Base Sepolia
    description: "AI RAG chat message",
  },
};

// Apply x402 payment middleware to this router
router.use(paymentMiddleware(payToAddress, x402Routes, facilitatorConfig));

// ============================================
// POST /api/chat-rag - x402 Protected RAG Chat
// ============================================

router.post("/", async (req, res) => {
  try {
    const parsed = chatRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.format(),
      });
    }

    const { analysisId, chatId, question, graphContext } = parsed.data;

    // Process RAG chat (payment already verified by x402 middleware)
    const result = await processRagChat(analysisId, question, chatId, graphContext);

    return res.json({
      chatId: result.chatId,
      answer: result.answer,
      sourcesUsed: result.sourcesUsed,
    });
  } catch (error) {
    logger.error("Failed to process chat:", error);
    return res.status(500).json({ error: "Failed to process chat" });
  }
});

export default router;
