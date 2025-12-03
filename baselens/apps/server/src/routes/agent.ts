// ============================================
// Agent Planning and Execution Routes
// ============================================

import { Router } from "express";
import { z } from "zod";
import { logger } from "../logger.js";
import { prisma } from "../db/prismaClient.js";
import { validateAndPlan } from "../agent/planning.js";
import { startExecution, getExecutionState, confirmStep0 } from "../agent/execution.js";
import { getAgentWalletAddress } from "../agent/wallet.js";
import type { ExecutionState } from "../agent/types.js";

const router = Router();

/**
 * Serialize ExecutionState for JSON response
 * Converts BigInt values to strings to avoid serialization errors
 */
function serializeExecutionState(state: ExecutionState): any {
  return {
    ...state,
    originalUserAmount: state.originalUserAmount
      ? {
        ...state.originalUserAmount,
        amountWei: state.originalUserAmount.amountWei.toString(),
      }
      : undefined,
    userShouldReceive: state.userShouldReceive
      ? {
        ethAmount: state.userShouldReceive.ethAmount.toString(),
        usdcAmount: state.userShouldReceive.usdcAmount.toString(),
      }
      : undefined,
  };
}

// ============================================
// Validation Schemas
// ============================================

const planRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  userEOA: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EOA address"),
  userSmartWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().nullable(),
});

const confirmStep0Schema = z.object({
  executionId: z.string().uuid(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash"),
  expectedToken: z.enum(["ETH", "USDC"]),
  expectedAmount: z.string(),
});

// ============================================
// POST /api/agent/plan - Generate execution plan
// ============================================

router.post("/plan", async (req, res) => {
  try {
    const parsed = planRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.format(),
      });
    }

    const { message, userEOA, userSmartWallet } = parsed.data;

    logger.info(`[AgentAPI] Planning request from ${userEOA}`);

    // Look up user's smart wallet if not provided
    let smartWallet = userSmartWallet;
    if (!smartWallet) {
      const user = await prisma.user.findUnique({
        where: { address: userEOA.toLowerCase() },
      });
      smartWallet = user?.smartWalletAddress || null;
    }

    // Generate plan
    const plan = await validateAndPlan(message, userEOA, smartWallet);

    if (!plan.isValid) {
      return res.status(400).json({
        error: plan.error || "Invalid plan",
        plan: null,
      });
    }

    // Get agent wallet address for frontend reference
    const agentWalletAddress = getAgentWalletAddress();

    return res.json({
      plan: {
        ...plan,
        agentWalletAddress,
      },
    });
  } catch (error) {
    logger.error("[AgentAPI] Failed to generate plan:", error);
    return res.status(500).json({
      error: "Failed to generate plan",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ============================================
// POST /api/agent/execute - Start execution
// ============================================

router.post("/execute", async (req, res) => {
  try {
    const { plan } = req.body;

    if (!plan || !plan.steps || !Array.isArray(plan.steps)) {
      return res.status(400).json({
        error: "Invalid plan",
      });
    }

    logger.info("[AgentAPI] Starting execution");

    // Start execution
    const executionId = await startExecution(plan);

    // Get initial state
    const state = getExecutionState(executionId);
    if (!state) {
      return res.status(500).json({
        error: "Failed to create execution state",
      });
    }

    return res.json({
      executionId,
      state: serializeExecutionState(state),
    });
  } catch (error) {
    logger.error("[AgentAPI] Failed to start execution:", error);
    return res.status(500).json({
      error: "Failed to start execution",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ============================================
// POST /api/agent/confirm-step0 - Confirm Step 0 (funding) transaction
// ============================================

router.post("/confirm-step0", async (req, res) => {
  try {
    const parsed = confirmStep0Schema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.format(),
      });
    }

    const { executionId, txHash, expectedToken, expectedAmount } = parsed.data;

    logger.info(`[AgentAPI] Confirming Step 0: ${txHash}`);

    const result = await confirmStep0(executionId, txHash, expectedToken, expectedAmount);

    if (!result.success) {
      return res.status(400).json({
        error: result.error || "Step 0 confirmation failed",
      });
    }

    // Get updated state
    const state = getExecutionState(executionId);
    if (!state) {
      return res.status(404).json({
        error: "Execution not found",
      });
    }

    return res.json({
      success: true,
      state: serializeExecutionState(state),
    });
  } catch (error) {
    logger.error("[AgentAPI] Failed to confirm Step 0:", error);
    return res.status(500).json({
      error: "Failed to confirm Step 0",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ============================================
// GET /api/agent/execution/:id - Get execution state
// ============================================

router.get("/execution/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const state = getExecutionState(id);

    if (!state) {
      return res.status(404).json({
        error: "Execution not found",
      });
    }

    return res.json({
      state: serializeExecutionState(state),
    });
  } catch (error) {
    logger.error("[AgentAPI] Failed to get execution state:", error);
    return res.status(500).json({
      error: "Failed to get execution state",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
