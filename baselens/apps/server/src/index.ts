// ============================================
// BaseLens Server - Main entry point
// ============================================

import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { prisma, initializePgVector, testConnection } from "./db/prismaClient.js";
import { initializeQueue, closeQueue } from "./queue/index.js";
import { startWorker, stopWorker } from "./queue/worker.js";
import analysisRoutes from "./routes/analysis.js";
import ragRoutes from "./routes/rag.js";
import chatRagRoutes from "./routes/chat-rag.js";
import sourceRoutes from "./routes/source.js";
import userRoutes from "./routes/users.js";
import authRoutes from "./routes/auth.js";
import { isPanoramixAvailable } from "./base/decompiler.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Request logging middleware
app.use((req, _res, next) => {
  logger.info(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get("/health", (_, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/auth", authRoutes); // Auth routes: /api/auth/login
app.use("/api/analyze", analysisRoutes);
app.use("/api/analysis", analysisRoutes);
app.use("/api/rag", ragRoutes);
app.use("/api/chat-rag", chatRagRoutes);
app.use("/api/source", sourceRoutes);
app.use("/api", userRoutes); // User routes: /api/users, /api/me, /api/me/smart-wallet/*

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Enhanced logging for x402 payment verification failures
  if (err?.message?.includes("Failed to verify payment") || err?.message?.includes("Unauthorized")) {
    logger.error("[x402] Payment verification failed:", {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      invalidReason: err.invalidReason,
      details: err.details,
    });

    // Return appropriate status code for payment failures
    return res.status(401).json({
      error: "Payment verification failed",
      message: err.message,
      details: process.env.NODE_ENV === "development" ? {
        invalidReason: err.invalidReason,
        details: err.details,
      } : undefined,
    });
  }

  logger.error("[HTTP] Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Graceful shutdown
async function shutdown() {
  logger.info("[Server] Shutting down gracefully...");

  await stopWorker();
  await closeQueue();
  await prisma.$disconnect();

  logger.info("[Server] ✅ Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start server
async function start() {
  logger.info("========================================");
  logger.info("🚀 BASELENS SERVER STARTING");
  logger.info("========================================");
  logger.info(`Environment: ${config.NODE_ENV}`);
  logger.info(`Port: ${config.PORT}`);
  logger.info(`Database: ${config.DATABASE_URL.replace(/:[^:@]+@/, ":***@")}`);
  logger.info(`Redis: ${config.REDIS_HOST}:${config.REDIS_PORT}`);
  logger.info(`OpenAI Model: ${config.OPENAI_CHAT_MODEL}`);
  logger.info(`Base RPC: ${config.BASE_RPC_URL}`);
  logger.info(`Basescan API Key: ${config.BASESCAN_API_KEY ? "✅ Configured" : "⚠️ Not configured"}`);
  logger.info("========================================");

  try {
    // Test database connection
    logger.info("[Startup] Step 1: Testing database connection...");
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error("Failed to connect to database");
    }

    // Initialize pgvector extension
    logger.info("[Startup] Step 2: Initializing pgvector extension...");
    await initializePgVector();

    // Initialize BullMQ queue
    logger.info("[Startup] Step 3: Initializing BullMQ queue...");
    await initializeQueue();

    // Start the worker
    logger.info("[Startup] Step 4: Starting analysis worker...");
    await startWorker();

    // Check Panoramix availability
    logger.info("[Startup] Step 5: Checking Panoramix decompiler...");
    const panoramixOk = await isPanoramixAvailable();
    if (!panoramixOk) {
      logger.warn("========================================");
      logger.warn("⚠️  PANORAMIX NOT AVAILABLE");
      logger.warn("Decompilation of unverified contracts will NOT work!");
      logger.warn("To install: pip install panoramix-decompiler");
      logger.warn("========================================");
    }

    // Start Express server
    logger.info("[Startup] Step 6: Starting HTTP server...");
    app.listen(config.PORT, () => {
      logger.info("========================================");
      logger.info("✅ BASELENS SERVER READY");
      logger.info("========================================");
      logger.info(`🌐 Server: http://localhost:${config.PORT}`);
      logger.info(`📡 Health: http://localhost:${config.PORT}/health`);
      logger.info(`📊 API: http://localhost:${config.PORT}/api`);
      logger.info("========================================");
      logger.info("Waiting for analysis jobs...");
    });
  } catch (error) {
    logger.error("========================================");
    logger.error("❌ SERVER STARTUP FAILED");
    logger.error("========================================");
    logger.error("Error:", error);
    process.exit(1);
  }
}

start();
