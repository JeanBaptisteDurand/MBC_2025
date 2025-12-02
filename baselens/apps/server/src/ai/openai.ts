// ============================================
// OpenAI Client Wrapper
// ============================================

import OpenAI from "openai";
import { config } from "../config.js";
import { logger } from "../logger.js";

// ============================================
// Client Singleton
// ============================================

let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    logger.info("[OpenAI] Initializing OpenAI client...");
    openaiClient = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
    });
    logger.info("[OpenAI] ✅ OpenAI client initialized");
  }
  return openaiClient;
}

// ============================================
// Chat Completion
// ============================================

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<string> {
  const client = getOpenAIClient();
  const model = options.model || config.OPENAI_CHAT_MODEL;
  
  logger.info(`[OpenAI] Chat completion request...`);
  logger.debug(`[OpenAI] Model: ${model}, Messages: ${messages.length}, MaxTokens: ${options.maxTokens || 2000}`);
  logger.debug(`[OpenAI] System prompt: ${messages[0]?.content?.slice(0, 100)}...`);
  logger.debug(`[OpenAI] User prompt: ${messages[messages.length - 1]?.content?.slice(0, 200)}...`);
  
  const startTime = Date.now();
  
  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens: options.maxTokens || 2000,
      temperature: options.temperature ?? 0.7,
    });
    
    const duration = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || "";
    const usage = response.usage;
    
    logger.info(`[OpenAI] ✅ Chat completion success (${duration}ms)`);
    logger.info(`[OpenAI]   Response length: ${content.length} chars`);
    if (usage) {
      logger.info(`[OpenAI]   Tokens: ${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion = ${usage.total_tokens} total`);
    }
    logger.debug(`[OpenAI] Response preview: ${content.slice(0, 200)}...`);
    
    return content;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[OpenAI] ❌ Chat completion FAILED (${duration}ms):`, error);
    throw error;
  }
}

// ============================================
// Embeddings
// ============================================

export async function createEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  const model = config.OPENAI_EMBEDDING_MODEL;
  
  logger.info(`[OpenAI] Creating embedding (${text.length} chars)...`);
  logger.debug(`[OpenAI] Model: ${model}`);
  logger.debug(`[OpenAI] Text preview: ${text.slice(0, 100)}...`);
  
  const startTime = Date.now();
  
  try {
    const response = await client.embeddings.create({
      model,
      input: text,
    });
    
    const duration = Date.now() - startTime;
    const embedding = response.data[0]?.embedding || [];
    
    logger.info(`[OpenAI] ✅ Embedding created (${duration}ms), dimensions: ${embedding.length}`);
    
    return embedding;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[OpenAI] ❌ Embedding creation FAILED (${duration}ms):`, error);
    throw error;
  }
}

export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getOpenAIClient();
  const model = config.OPENAI_EMBEDDING_MODEL;
  
  logger.info(`[OpenAI] Creating ${texts.length} embeddings...`);
  
  const startTime = Date.now();
  
  try {
    const response = await client.embeddings.create({
      model,
      input: texts,
    });
    
    const duration = Date.now() - startTime;
    const embeddings = response.data.map((d) => d.embedding);
    
    logger.info(`[OpenAI] ✅ Created ${embeddings.length} embeddings (${duration}ms)`);
    
    return embeddings;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[OpenAI] ❌ Embeddings creation FAILED (${duration}ms):`, error);
    throw error;
  }
}

// ============================================
// Token Estimation
// ============================================

/**
 * Rough token estimation (for context window management)
 * ~4 chars per token for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to fit within token limit
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  const estimatedChars = maxTokens * 4;
  if (text.length <= estimatedChars) {
    return text;
  }
  logger.debug(`[OpenAI] Truncating text from ${text.length} to ~${estimatedChars} chars (~${maxTokens} tokens)`);
  return text.slice(0, estimatedChars) + "... [truncated]";
}
