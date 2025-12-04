// ============================================
// Auth Routes - Login with Wallet Signature
// ============================================

import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { verifyMessage } from "viem";
import { prisma } from "../db/prismaClient.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

const router = Router();

// ============================================
// Validation Schemas
// ============================================

const loginSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format"),
  signature: z.string().min(1, "Signature is required"),
  message: z.string().min(1, "Message is required"),
});

// ============================================
// Message to sign (must match frontend)
// ============================================

export const AUTH_MESSAGE = "Sign this message to authenticate with BaseLens";

// ============================================
// POST /api/auth/login - Login with wallet signature
// ============================================

router.post("/login", async (req, res) => {
  logger.info(`[Route] POST /api/auth/login`);
  logger.debug(`[Route] Request body:`, { ...req.body, signature: req.body.signature ? "[REDACTED]" : undefined });

  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      logger.warn(`[Route] Invalid request body:`, parsed.error.format());
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.format(),
      });
    }

    const { address, signature, message } = parsed.data;
    const normalizedAddress = address.toLowerCase();

    // Verify the message matches our expected auth message
    if (message !== AUTH_MESSAGE) {
      logger.warn(`[Route] Invalid auth message: ${message}`);
      return res.status(400).json({
        error: "Invalid authentication message",
      });
    }

    // Verify the signature
    logger.info(`[Route] Verifying signature for address: ${normalizedAddress}`);
    let isValid = false;

    try {
      isValid = await verifyMessage({
        address: normalizedAddress as `0x${string}`,
        message: AUTH_MESSAGE,
        signature: signature as `0x${string}`,
      });
    } catch (error) {
      logger.error(`[Route] Signature verification error:`, error);
      return res.status(400).json({
        error: "Invalid signature",
        message: error instanceof Error ? error.message : "Signature verification failed",
      });
    }

    if (!isValid) {
      logger.warn(`[Route] Signature verification failed for: ${normalizedAddress}`);
      return res.status(401).json({
        error: "Signature verification failed",
      });
    }

    logger.info(`[Route] ✅ Signature verified for: ${normalizedAddress}`);

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { address: normalizedAddress },
    });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          address: normalizedAddress,
          smartWalletEnabled: false,
          smartWalletAddress: null,
        },
      });
      logger.info(`[Route] ✅ Created new user: ${user.id}`);
    } else {
      // Update existing user's updatedAt timestamp
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          updatedAt: new Date(),
        },
      });
      logger.info(`[Route] ✅ Updated existing user: ${user.id}`);
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        address: user.address,
      },
      config.JWT_SECRET,
      {
        expiresIn: "30d", // Token expires in 30 days
      }
    );

    logger.info(`[Route] ✅ Generated JWT token for user: ${user.id}`);

    return res.json({
      token,
      user: {
        id: user.id,
        address: user.address,
        smart_wallet_enabled: user.smartWalletEnabled,
        smart_wallet_address: user.smartWalletAddress,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error(`[Route] ❌ Error in POST /api/auth/login:`, error);
    return res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
    });
  }
});

export default router;
