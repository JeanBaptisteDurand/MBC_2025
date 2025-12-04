// ============================================
// User Routes - Smart Wallet Management
// ============================================

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prismaClient.js";
import { logger } from "../logger.js";

const router = Router();

// ============================================
// Validation Schemas
// ============================================

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format");

const createUserSchema = z.object({
  address: addressSchema,
});

const enableSmartWalletSchema = z.object({
  smartWalletAddress: addressSchema,
});

// ============================================
// Helper: Get user from request
// For now, we'll use address from body/query
// In production, you'd get this from JWT/session
// ============================================

function getUserAddress(req: any): string | null {
  // Try to get from query param (for GET /api/me)
  if (req.query?.address) {
    const addr = req.query.address;
    if (typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr)) {
      return addr.toLowerCase();
    }
  }

  // Try to get from body (for POST requests)
  if (req.body?.address) {
    const addr = req.body.address;
    if (typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr)) {
      return addr.toLowerCase();
    }
  }

  // Try to get from auth header (if you implement JWT)
  // const authHeader = req.headers.authorization;
  // if (authHeader) { ... }

  return null;
}

// ============================================
// POST /api/users - Create or update user
// ============================================

router.post("/users", async (req, res) => {
  logger.info(`[Route] POST /api/users`);
  logger.debug(`[Route] Request body:`, req.body);

  try {
    const parsed = createUserSchema.safeParse(req.body);

    if (!parsed.success) {
      logger.warn(`[Route] Invalid request body:`, parsed.error.format());
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.format(),
      });
    }

    const { address } = parsed.data;
    const normalizedAddress = address.toLowerCase();

    logger.info(`[Route] Creating or updating user: ${normalizedAddress}`);

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

    return res.json({
      id: user.id,
      address: user.address,
      smart_wallet_enabled: user.smartWalletEnabled,
      smart_wallet_address: user.smartWalletAddress,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
  } catch (error) {
    logger.error(`[Route] ❌ Error in POST /api/users:`, error);
    return res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
    });
  }
});

// ============================================
// GET /api/me - Get current user profile
// ============================================

router.get("/me", async (req, res) => {
  logger.info(`[Route] GET /api/me`);

  try {
    const address = getUserAddress(req);

    if (!address) {
      logger.warn(`[Route] No address provided in request`);
      return res.status(400).json({
        error: "Address is required. Provide ?address=0x... or implement authentication",
      });
    }

    logger.info(`[Route] Fetching user profile for: ${address}`);

    const user = await prisma.user.findUnique({
      where: { address },
    });

    if (!user) {
      logger.warn(`[Route] User not found: ${address}`);
      return res.status(404).json({
        error: "User not found",
      });
    }

    logger.info(`[Route] ✅ Found user: ${user.id}`);

    return res.json({
      id: user.id,
      address: user.address,
      smart_wallet_enabled: user.smartWalletEnabled,
      smart_wallet_address: user.smartWalletAddress,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
  } catch (error) {
    logger.error(`[Route] ❌ Error in GET /api/me:`, error);
    return res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
    });
  }
});

// ============================================
// POST /api/me/smart-wallet/enable - Enable smart wallet
// ============================================

router.post("/me/smart-wallet/enable", async (req, res) => {
  logger.info(`[Route] POST /api/me/smart-wallet/enable`);
  logger.debug(`[Route] Request body:`, req.body);

  try {
    const address = getUserAddress(req);

    if (!address) {
      return res.status(400).json({
        error: "Address is required",
      });
    }

    const parsed = enableSmartWalletSchema.safeParse(req.body);

    if (!parsed.success) {
      logger.warn(`[Route] Invalid request body:`, parsed.error.format());
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.format(),
      });
    }

    const { smartWalletAddress } = parsed.data;
    const normalizedSmartWalletAddress = smartWalletAddress.toLowerCase();

    logger.info(`[Route] Enabling smart wallet for user: ${address}`);
    logger.info(`[Route] Smart wallet address: ${normalizedSmartWalletAddress}`);

    // Find user
    const user = await prisma.user.findUnique({
      where: { address },
    });

    if (!user) {
      logger.warn(`[Route] User not found: ${address}`);
      return res.status(404).json({
        error: "User not found",
      });
    }

    // IMPORTANT: If smart_wallet_address already exists, reuse it
    // Don't overwrite with a different address
    const finalAddress = user.smartWalletAddress || normalizedSmartWalletAddress;

    if (user.smartWalletAddress && user.smartWalletAddress.toLowerCase() !== normalizedSmartWalletAddress.toLowerCase()) {
      logger.info(`[Route] Reusing existing smart wallet address: ${user.smartWalletAddress}`);
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        smartWalletEnabled: true,
        smartWalletAddress: finalAddress,
        updatedAt: new Date(),
      },
    });

    logger.info(`[Route] ✅ Smart wallet enabled for user: ${updatedUser.id}`);

    return res.json({
      id: updatedUser.id,
      address: updatedUser.address,
      smart_wallet_enabled: updatedUser.smartWalletEnabled,
      smart_wallet_address: updatedUser.smartWalletAddress,
      updatedAt: updatedUser.updatedAt.toISOString(),
    });
  } catch (error) {
    logger.error(`[Route] ❌ Error in POST /api/me/smart-wallet/enable:`, error);
    return res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
    });
  }
});

// ============================================
// POST /api/me/smart-wallet/disable - Disable smart wallet
// ============================================

router.post("/me/smart-wallet/disable", async (req, res) => {
  logger.info(`[Route] POST /api/me/smart-wallet/disable`);

  try {
    const address = getUserAddress(req);

    if (!address) {
      return res.status(400).json({
        error: "Address is required",
      });
    }

    logger.info(`[Route] Disabling smart wallet for user: ${address}`);

    // Find user
    const user = await prisma.user.findUnique({
      where: { address },
    });

    if (!user) {
      logger.warn(`[Route] User not found: ${address}`);
      return res.status(404).json({
        error: "User not found",
      });
    }

    // Disable but KEEP the address (for future reactivation)
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        smartWalletEnabled: false,
        // DO NOT clear smartWalletAddress - keep it for reactivation
        updatedAt: new Date(),
      },
    });

    logger.info(`[Route] ✅ Smart wallet disabled for user: ${updatedUser.id}`);
    logger.info(`[Route] Smart wallet address kept: ${updatedUser.smartWalletAddress}`);

    return res.json({
      id: updatedUser.id,
      address: updatedUser.address,
      smart_wallet_enabled: updatedUser.smartWalletEnabled,
      smart_wallet_address: updatedUser.smartWalletAddress, // Still present!
      updatedAt: updatedUser.updatedAt.toISOString(),
    });
  } catch (error) {
    logger.error(`[Route] ❌ Error in POST /api/me/smart-wallet/disable:`, error);
    return res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
    });
  }
});

export default router;
