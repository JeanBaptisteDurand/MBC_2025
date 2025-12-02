// ============================================
// Analysis Routes
// ============================================

import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { Network, StartAnalysisRequest, AnalysisHistoryItem } from "@baselens/core";
import { prisma } from "../db/prismaClient.js";
import { logger } from "../logger.js";
import { enqueueAnalysis, getJobStatus } from "../queue/index.js";
import { buildGraphData, getContractDetails } from "../base/graphBuilder.js";
import { getAnalysisSummary, generateContractExplanation } from "../ai/explanations.js";

const router = Router();

// ============================================
// Validation Schemas
// ============================================

const startAnalysisSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  network: z.enum(["base-mainnet", "base-sepolia"]).default("base-mainnet"),
  maxDepth: z.number().int().min(1).max(5).default(2),
});

// ============================================
// POST /api/analyze - Start a new analysis
// ============================================

router.post("/", async (req, res) => {
  logger.info(`[Route] POST /api/analyze`);
  logger.debug(`[Route] Request body:`, req.body);

  try {
    const parsed = startAnalysisSchema.safeParse(req.body);

    if (!parsed.success) {
      logger.warn(`[Route] Invalid request body:`, parsed.error.format());
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.format(),
      });
    }

    const { address, network, maxDepth } = parsed.data;
    const normalizedAddress = address.toLowerCase();

    logger.info(`[Route] Starting analysis for ${normalizedAddress} on ${network} (maxDepth: ${maxDepth})`);

    // Create analysis record
    const analysisId = uuidv4();

    logger.debug(`[Route] Creating analysis record: ${analysisId}`);
    await prisma.analysis.create({
      data: {
        id: analysisId,
        rootAddress: normalizedAddress,
        network,
        status: "queued",
        paramsJson: { address: normalizedAddress, network, maxDepth },
      },
    });

    // Enqueue job
    logger.debug(`[Route] Enqueuing analysis job...`);
    const jobId = await enqueueAnalysis({
      analysisId,
      address: normalizedAddress,
      network: network as Network,
      maxDepth,
    });

    logger.info(`[Route] ✅ Analysis started: ${analysisId}`);

    return res.json({ jobId: analysisId });
  } catch (error) {
    logger.error("[Route] ❌ Failed to start analysis:", error);
    return res.status(500).json({ error: "Failed to start analysis" });
  }
});

// ============================================
// GET /api/analyze/:jobId/status - Get job status
// ============================================

router.get("/:jobId/status", async (req, res) => {
  const { jobId } = req.params;
  logger.debug(`[Route] GET /api/analyze/${jobId}/status`);

  try {
    // Get job status from queue
    const queueStatus = await getJobStatus(jobId);

    // Get analysis status from database
    const analysis = await prisma.analysis.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, error: true },
    });

    if (!analysis) {
      logger.warn(`[Route] Analysis not found: ${jobId}`);
      return res.status(404).json({ error: "Analysis not found" });
    }

    logger.debug(`[Route] Status for ${jobId}: ${analysis.status}, progress: ${queueStatus.progress}%`);

    return res.json({
      jobId,
      status: analysis.status,
      progress: queueStatus.progress,
      analysisId: analysis.status === "done" ? analysis.id : undefined,
      error: analysis.error || queueStatus.error,
    });
  } catch (error) {
    logger.error("[Route] ❌ Failed to get job status:", error);
    return res.status(500).json({ error: "Failed to get job status" });
  }
});

// ============================================
// GET /api/analysis/:analysisId/graph - Get graph data
// ============================================

router.get("/:analysisId/graph", async (req, res) => {
  const { analysisId } = req.params;
  logger.info(`[Route] GET /api/analysis/${analysisId}/graph`);

  try {
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      logger.warn(`[Route] Analysis not found: ${analysisId}`);
      return res.status(404).json({ error: "Analysis not found" });
    }

    // If we have cached graph data, return it
    if (analysis.summaryJson) {
      logger.info(`[Route] ✅ Returning cached graph data`);
      return res.json(analysis.summaryJson);
    }

    // Otherwise, build it fresh
    logger.info(`[Route] Building graph data fresh...`);
    const graphData = await buildGraphData(analysisId);

    // Cache it
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { summaryJson: graphData as unknown as Record<string, unknown> },
    });

    logger.info(`[Route] ✅ Graph data built and cached`);
    return res.json(graphData);
  } catch (error) {
    logger.error("[Route] ❌ Failed to get graph data:", error);
    return res.status(500).json({ error: "Failed to get graph data" });
  }
});

// ============================================
// GET /api/analysis/:analysisId/summary - Get AI summary
// ============================================

router.get("/:analysisId/summary", async (req, res) => {
  const { analysisId } = req.params;
  logger.info(`[Route] GET /api/analysis/${analysisId}/summary`);

  try {
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      logger.warn(`[Route] Analysis not found: ${analysisId}`);
      return res.status(404).json({ error: "Analysis not found" });
    }

    logger.info(`[Route] Fetching AI summary...`);
    const summary = await getAnalysisSummary(analysisId);

    if (!summary) {
      logger.warn(`[Route] Summary not available for ${analysisId}`);
      return res.status(404).json({ error: "Summary not available" });
    }

    logger.info(`[Route] ✅ Summary returned (${summary.summary.length} chars)`);
    return res.json(summary);
  } catch (error) {
    logger.error("[Route] ❌ Failed to get summary:", error);
    return res.status(500).json({ error: "Failed to get summary" });
  }
});

// ============================================
// GET /api/analysis/:analysisId/contract/:address/explanation
// ============================================

router.get("/:analysisId/contract/:address/explanation", async (req, res) => {
  const { analysisId, address } = req.params;
  logger.info(`[Route] GET /api/analysis/${analysisId}/contract/${address}/explanation`);

  try {
    logger.info(`[Route] Generating contract explanation...`);
    const explanation = await generateContractExplanation(analysisId, address);

    logger.info(`[Route] ✅ Explanation generated (${explanation.length} chars)`);
    return res.json({ explanation });
  } catch (error) {
    logger.error("[Route] ❌ Failed to get contract explanation:", error);
    return res.status(500).json({ error: "Failed to get contract explanation" });
  }
});

// ============================================
// GET /api/analysis/:analysisId/contract/:address/details
// ============================================

router.get("/:analysisId/contract/:address/details", async (req, res) => {
  const { analysisId, address } = req.params;
  logger.info(`[Route] GET /api/analysis/${analysisId}/contract/${address}/details`);

  try {
    const details = await getContractDetails(analysisId, address);

    if (!details.contract) {
      logger.warn(`[Route] Contract not found: ${address}`);
      return res.status(404).json({ error: "Contract not found" });
    }

    logger.info(`[Route] ✅ Contract details returned`);
    return res.json(details);
  } catch (error) {
    logger.error("[Route] ❌ Failed to get contract details:", error);
    return res.status(500).json({ error: "Failed to get contract details" });
  }
});

// ============================================
// GET /api/analysis/history - Get all analyses
// ============================================

router.get("/history", async (_req, res) => {
  logger.info(`[Route] GET /api/analysis/history`);

  try {
    const analyses = await prisma.analysis.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        rootAddress: true,
        network: true,
        status: true,
        createdAt: true,
      },
    });

    const history: AnalysisHistoryItem[] = analyses.map((a) => ({
      id: a.id,
      rootAddress: a.rootAddress,
      network: a.network as Network,
      status: a.status as AnalysisHistoryItem["status"],
      createdAt: a.createdAt.toISOString(),
    }));

    logger.info(`[Route] ✅ Returning ${history.length} analyses`);
    return res.json(history);
  } catch (error) {
    logger.error("[Route] ❌ Failed to get analysis history:", error);
    return res.status(500).json({ error: "Failed to get history" });
  }
});

// ============================================
// GET /api/analysis/:analysisId - Get analysis details
// ============================================

router.get("/:analysisId", async (req, res) => {
  const { analysisId } = req.params;
  logger.info(`[Route] GET /api/analysis/${analysisId}`);

  try {
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        contracts: {
          select: {
            address: true,
            name: true,
            kindOnChain: true,
            verified: true,
            sourceType: true,
          },
        },
        _count: {
          select: {
            sourceFiles: true,
            typeDefs: true,
            edges: true,
          },
        },
      },
    });

    if (!analysis) {
      logger.warn(`[Route] Analysis not found: ${analysisId}`);
      return res.status(404).json({ error: "Analysis not found" });
    }

    logger.info(`[Route] ✅ Analysis details: ${analysis.contracts.length} contracts`);

    return res.json({
      id: analysis.id,
      rootAddress: analysis.rootAddress,
      network: analysis.network,
      status: analysis.status,
      createdAt: analysis.createdAt.toISOString(),
      error: analysis.error,
      contracts: analysis.contracts,
      counts: analysis._count,
    });
  } catch (error) {
    logger.error("[Route] ❌ Failed to get analysis:", error);
    return res.status(500).json({ error: "Failed to get analysis" });
  }
});

export default router;
