// ============================================
// BullMQ Worker - Analysis Job Processor
// ============================================

import { Worker, type Job } from "bullmq";
import type { Network } from "@baselens/core";
import {
  ANALYSIS_QUEUE_NAME,
  getRedisConnection,
  type AnalysisJobData,
  type AnalysisJobResult,
} from "./index.js";
import { prisma } from "../db/prismaClient.js";
import { logger } from "../logger.js";
import { runAnalysis, type AnalysisContext } from "../base/analyzer.js";
import { buildGraphData } from "../base/graphBuilder.js";
import { generateAnalysisSummary, indexAnalysisForRag } from "../ai/explanations.js";

let worker: Worker<AnalysisJobData, AnalysisJobResult> | null = null;

/**
 * Process an analysis job
 */
async function processAnalysisJob(
  job: Job<AnalysisJobData, AnalysisJobResult>
): Promise<AnalysisJobResult> {
  const { analysisId, address, network, maxDepth } = job.data;

  logger.info(`[Worker] ========================================`);
  logger.info(`[Worker] JOB STARTED`);
  logger.info(`[Worker] Job ID: ${job.id}`);
  logger.info(`[Worker] Analysis ID: ${analysisId}`);
  logger.info(`[Worker] Address: ${address}`);
  logger.info(`[Worker] Network: ${network}`);
  logger.info(`[Worker] Max Depth: ${maxDepth}`);
  logger.info(`[Worker] ========================================`);

  const startTime = Date.now();

  try {
    // Update analysis status to running
    logger.info(`[Worker] Updating analysis status to 'running'...`);
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: "running" },
    });

    // Create analysis context
    const ctx: AnalysisContext = {
      analysisId,
      network: network as Network,
      rootAddress: address,
      maxDepth,
      visited: new Set(),
      pending: new Set(),
      queue: [],
      bytecodeCache: new Map(),
      onProgress: async (progress, message) => {
        await job.updateProgress(progress);
        logger.info(`[Worker] Progress ${progress}%: ${message}`);
      },
    };

    // Run the analysis pipeline
    logger.info(`[Worker] Starting analysis pipeline...`);
    await runAnalysis(ctx);

    // Build the graph data
    logger.info(`[Worker] Building graph data...`);
    await job.updateProgress(92);
    const graphData = await buildGraphData(analysisId);
    logger.info(`[Worker] ✅ Graph built: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);

    // Save graph data to analysis
    logger.info(`[Worker] Saving graph data to database...`);
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        summaryJson: graphData as unknown as Record<string, unknown>,
      },
    });

    // Generate AI summary
    logger.info(`[Worker] Generating AI summary...`);
    await job.updateProgress(94);
    try {
      const summary = await generateAnalysisSummary(analysisId);
      logger.info(`[Worker] ✅ AI summary generated (${summary.summary.length} chars)`);
    } catch (error) {
      logger.warn(`[Worker] ⚠️ Failed to generate AI summary (non-fatal):`, error);
      // Don't fail the job, summary is optional
    }

    // Index for RAG
    logger.info(`[Worker] Indexing for RAG...`);
    await job.updateProgress(97);
    try {
      await indexAnalysisForRag(analysisId);
      logger.info(`[Worker] ✅ RAG indexing complete`);
    } catch (error) {
      logger.warn(`[Worker] ⚠️ Failed to index for RAG (non-fatal):`, error);
      // Don't fail the job, RAG is optional
    }

    // Mark as done
    await job.updateProgress(100);
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: "done" },
    });

    const duration = Date.now() - startTime;

    logger.info(`[Worker] ========================================`);
    logger.info(`[Worker] JOB COMPLETED SUCCESSFULLY`);
    logger.info(`[Worker] Analysis ID: ${analysisId}`);
    logger.info(`[Worker] Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    logger.info(`[Worker] ========================================`);

    return {
      analysisId,
      success: true,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(`[Worker] ========================================`);
    logger.error(`[Worker] JOB FAILED`);
    logger.error(`[Worker] Analysis ID: ${analysisId}`);
    logger.error(`[Worker] Duration: ${duration}ms`);
    logger.error(`[Worker] Error: ${errorMessage}`);
    logger.error(`[Worker] Stack:`, error);
    logger.error(`[Worker] ========================================`);

    // Update analysis status to error
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: "error",
        error: errorMessage,
      },
    });

    return {
      analysisId,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Start the worker
 */
export async function startWorker(): Promise<void> {
  if (worker) {
    logger.warn("[Worker] Worker already started");
    return;
  }

  logger.info("[Worker] Starting analysis worker...");

  const connection = getRedisConnection();
  logger.info("[Worker] Connected to Redis");

  worker = new Worker<AnalysisJobData, AnalysisJobResult>(
    ANALYSIS_QUEUE_NAME,
    processAnalysisJob,
    {
      connection,
      concurrency: 2, // Process up to 2 jobs concurrently
      limiter: {
        max: 10,
        duration: 60000, // Max 10 jobs per minute
      },
    }
  );

  worker.on("completed", (job, result) => {
    logger.info(`[Worker] Job ${job.id} completed`, { success: result.success });
  });

  worker.on("failed", (job, error) => {
    logger.error(`[Worker] Job ${job?.id} failed:`, error);
  });

  worker.on("progress", (job, progress) => {
    logger.debug(`[Worker] Job ${job.id} progress: ${progress}%`);
  });

  worker.on("error", (error) => {
    logger.error("[Worker] Worker error:", error);
  });

  worker.on("active", (job) => {
    logger.info(`[Worker] Job ${job.id} became active`);
  });

  worker.on("stalled", (jobId) => {
    logger.warn(`[Worker] Job ${jobId} stalled`);
  });

  logger.info("[Worker] ✅ Analysis worker started and listening for jobs");
}

/**
 * Stop the worker
 */
export async function stopWorker(): Promise<void> {
  if (worker) {
    logger.info("[Worker] Stopping worker...");
    await worker.close();
    worker = null;
    logger.info("[Worker] ✅ Worker stopped");
  }
}
