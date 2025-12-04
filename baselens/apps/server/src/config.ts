// ============================================
// Configuration - Environment variables loader
// ============================================

import { z } from "zod";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),

  // Server
  PORT: z.coerce.number().default(3001),
  SERVER_PORT: z.coerce.number().optional(), // Alias for PORT (for x402 compatibility)
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_CHAT_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),

  // Base RPC
  BASE_RPC_URL: z.string().url().default("https://mainnet.base.org"),
  BASE_SEPOLIA_RPC_URL: z.string().url().default("https://sepolia.base.org"),

  // Basescan API
  BASESCAN_API_KEY: z.string().optional(),

  // x402 Payment
  SERVER_PAY_TO_ADDRESS: z.string().optional(),
  X402_FACILITATOR_URL: z.string().url().optional(),

  // JWT
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  // Agent Wallet (optional - will auto-generate if not provided)
  AGENT_WALLET_PRIVATE_KEY: z.string().optional(),
  USDC_ADDRESS_BASE_SEPOLIA: z.string().optional(),

  // AgentKit / CDP Configuration (NOT NEEDED - only if using Coinbase-managed wallets)
  // Current setup uses private key wallet, so CDP keys are optional/unused
  CDP_API_KEY_NAME: z.string().optional(),
  CDP_API_KEY_PRIVATE_KEY: z.string().optional(),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(parsed.error.format());
    throw new Error("Invalid environment variables");
  }

  return parsed.data;
}

export const config = loadConfig();

export type Config = z.infer<typeof envSchema>;

