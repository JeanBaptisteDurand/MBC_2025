// ============================================
// Auth Middleware - JWT Verification
// ============================================

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { prisma } from "../db/prismaClient.js";

export interface AuthRequest extends Request {
  userId?: string;
  userAddress?: string;
}

export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    logger.warn(`[Auth] No token provided for ${req.method} ${req.path}`);
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as {
      userId: string;
      address: string;
      iat?: number;
      exp?: number;
    };

    // Validate token payload
    if (!decoded.userId || !decoded.address) {
      logger.warn(`[Auth] Invalid token payload: missing userId or address`);
      return res.status(403).json({ error: "Invalid token" });
    }

    req.userId = decoded.userId;
    req.userAddress = decoded.address;

    logger.debug(`[Auth] Authenticated user: ${decoded.address} (${decoded.userId})`);
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn(`[Auth] JWT error: ${error.message}`);
      return res.status(403).json({ error: "Invalid token" });
    } else if (error instanceof jwt.TokenExpiredError) {
      logger.warn(`[Auth] Token expired`);
      return res.status(403).json({ error: "Token expired" });
    } else {
      logger.warn(`[Auth] Invalid token: ${error instanceof Error ? error.message : "Unknown error"}`);
      return res.status(403).json({ error: "Invalid or expired token" });
    }
  }
}

/**
 * Optional: Verify that the user in the token still exists and matches
 * This can be used for additional security checks if needed
 */
export async function verifyUserExists(userId: string, address: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, address: true },
    });

    if (!user) {
      logger.warn(`[Auth] User ${userId} from token does not exist`);
      return false;
    }

    if (user.address.toLowerCase() !== address.toLowerCase()) {
      logger.warn(`[Auth] Token address ${address} does not match user address ${user.address}`);
      return false;
    }

    return true;
  } catch (error) {
    logger.error(`[Auth] Error verifying user:`, error);
    return false;
  }
}
