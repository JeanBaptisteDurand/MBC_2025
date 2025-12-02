// ============================================
// BullMQ Queue Setup
// ============================================

import { Queue, type JobsOptions } from "bullmq";
import Redis from "ioredis";
import type { Network } from "@baselens/core";
import { config } from "../config.js";
import { logger } from "../logger.js";

// ============================================
// Types
// ============================================

export interface AnalysisJobData {
  analysisId: string;
  address: string;
  network: Network;
  maxDepth: number;
}

export interface AnalysisJobResult {
  analysisId: string;
  success: boolean;
  error?: string;
}

// ============================================
// Redis Connection
// ============================================

let redisConnection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redisConnection) {
    redisConnection = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      maxRetriesPerRequest: null, // Required for BullMQ
    });
    
    redisConnection.on("error", (err) => {
      logger.error("Redis connection error:", err);
    });
    
    redisConnection.on("connect", () => {
      logger.info("Redis connected");
    });
  }
  
  return redisConnection;
}

// ============================================
// Analysis Queue
// ============================================

let analysisQueue: Queue<AnalysisJobData, AnalysisJobResult> | null = null;

export const ANALYSIS_QUEUE_NAME = "analysis";

export function getAnalysisQueue(): Queue<AnalysisJobData, AnalysisJobResult> {
  if (!analysisQueue) {
    const connection = getRedisConnection();
    
    analysisQueue = new Queue<AnalysisJobData, AnalysisJobResult>(ANALYSIS_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: {
          age: 24 * 60 * 60, // 24 hours
          count: 100,
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60, // 7 days
        },
      },
    });
    
    analysisQueue.on("error", (err) => {
      logger.error("Analysis queue error:", err);
    });
  }
  
  return analysisQueue;
}

/**
 * Add a new analysis job to the queue
 */
export async function enqueueAnalysis(
  data: AnalysisJobData,
  options?: JobsOptions
): Promise<string> {
  const queue = getAnalysisQueue();
  
  const job = await queue.add("analyze", data, {
    ...options,
    jobId: data.analysisId, // Use analysisId as jobId for easy lookup
  });
  
  logger.info(`Enqueued analysis job: ${job.id}`);
  
  return job.id!;
}

/**
 * Get job status by job ID
 */
export async function getJobStatus(jobId: string): Promise<{
  status: "queued" | "running" | "done" | "error";
  progress: number;
  error?: string;
}> {
  const queue = getAnalysisQueue();
  const job = await queue.getJob(jobId);
  
  if (!job) {
    return { status: "error", progress: 0, error: "Job not found" };
  }
  
  const state = await job.getState();
  const progress = typeof job.progress === "number" ? job.progress : 0;
  
  switch (state) {
    case "waiting":
    case "delayed":
      return { status: "queued", progress: 0 };
    case "active":
      return { status: "running", progress };
    case "completed":
      return { status: "done", progress: 100 };
    case "failed":
      return {
        status: "error",
        progress,
        error: job.failedReason || "Unknown error",
      };
    default:
      return { status: "queued", progress: 0 };
  }
}

// ============================================
// Lifecycle
// ============================================

export async function initializeQueue(): Promise<void> {
  getRedisConnection();
  getAnalysisQueue();
  logger.info("Queue initialized");
}

export async function closeQueue(): Promise<void> {
  if (analysisQueue) {
    await analysisQueue.close();
    analysisQueue = null;
  }
  
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
  }
  
  logger.info("Queue closed");
}

