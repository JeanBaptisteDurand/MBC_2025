// ============================================
// Prisma Client - Database connection
// ============================================

import { PrismaClient } from "@prisma/client";
import { logger } from "../logger.js";

// Extend PrismaClient with custom methods for pgvector operations
const prismaClientSingleton = () => {
  logger.info("[DB] Creating Prisma client...");
  
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" 
      ? [
          { emit: "event", level: "query" },
          { emit: "stdout", level: "error" },
          { emit: "stdout", level: "warn" },
        ] 
      : [{ emit: "stdout", level: "error" }],
  });
  
  // Log queries in development
  if (process.env.NODE_ENV === "development") {
    client.$on("query" as never, (e: { query: string; duration: number }) => {
      logger.debug(`[DB] Query (${e.duration}ms): ${e.query.slice(0, 200)}...`);
    });
  }
  
  logger.info("[DB] ✅ Prisma client created");
  return client;
};

declare global {
  // eslint-disable-next-line no-var
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

// Helper function to create pgvector embeddings
export async function storeEmbedding(
  documentId: string,
  embedding: number[]
): Promise<void> {
  logger.debug(`[DB] Storing embedding for document ${documentId} (${embedding.length} dimensions)...`);
  
  const startTime = Date.now();
  const vectorString = `[${embedding.join(",")}]`;
  
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "RagDocument" SET embedding = $1::vector WHERE id = $2`,
      vectorString,
      documentId
    );
    
    const duration = Date.now() - startTime;
    logger.debug(`[DB] ✅ Embedding stored (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[DB] ❌ Failed to store embedding (${duration}ms):`, error);
    throw error;
  }
}

// Helper function to search similar documents using pgvector
export async function searchSimilarDocuments(
  analysisId: string,
  embedding: number[],
  limit: number = 5
): Promise<{ id: string; content: string; kind: string; refId: string; distance: number }[]> {
  logger.info(`[DB] Searching similar documents (pgvector)...`);
  logger.debug(`[DB] Analysis: ${analysisId}, Limit: ${limit}, Embedding dims: ${embedding.length}`);
  
  const startTime = Date.now();
  const vectorString = `[${embedding.join(",")}]`;
  
  try {
    const results = await prisma.$queryRawUnsafe<
      { id: string; content: string; kind: string; refId: string; distance: number }[]
    >(
      `SELECT id, content, kind, "refId", 
              embedding <-> $1::vector AS distance
       FROM "RagDocument"
       WHERE "analysisId" = $2 AND embedding IS NOT NULL
       ORDER BY distance
       LIMIT $3`,
      vectorString,
      analysisId,
      limit
    );
    
    const duration = Date.now() - startTime;
    logger.info(`[DB] ✅ Found ${results.length} similar documents (${duration}ms)`);
    
    for (const doc of results) {
      logger.debug(`[DB]   - ${doc.kind}:${doc.refId.slice(0, 15)}... (dist: ${doc.distance.toFixed(4)})`);
    }
    
    return results;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[DB] ❌ pgvector search failed (${duration}ms):`, error);
    throw error;
  }
}

// Initialize pgvector extension
export async function initializePgVector(): Promise<void> {
  logger.info("[DB] Initializing pgvector extension...");
  
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    logger.info("[DB] ✅ pgvector extension initialized");
  } catch (error) {
    logger.warn("[DB] ⚠️ pgvector extension may already exist or failed to create:", error);
  }
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  logger.info("[DB] Testing database connection...");
  
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info("[DB] ✅ Database connection successful");
    return true;
  } catch (error) {
    logger.error("[DB] ❌ Database connection failed:", error);
    return false;
  }
}
