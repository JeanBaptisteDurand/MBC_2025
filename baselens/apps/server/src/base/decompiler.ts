// ============================================
// Panoramix Decompiler Integration
// ============================================

import { exec } from "child_process";
import { promisify } from "util";
import type { Network } from "@baselens/core";
import { getRpcUrl } from "./client.js";
import { logger } from "../logger.js";

const execAsync = promisify(exec);

// Timeout for decompilation (in milliseconds)
const DECOMPILE_TIMEOUT = 120000; // 2 minutes

// Cache for Panoramix availability check
let panoramixAvailable: boolean | null = null;

/**
 * Check if Panoramix is available (cached)
 */
export async function isPanoramixAvailable(): Promise<boolean> {
  if (panoramixAvailable !== null) {
    return panoramixAvailable;
  }

  logger.info("[Panoramix] Checking if Panoramix is installed...");

  try {
    const { stdout, stderr } = await execAsync("panoramix --help", {
      timeout: 10000,
      env: { ...process.env },
    });

    panoramixAvailable = true;
    logger.info("[Panoramix] ✅ Panoramix is installed and available");
    logger.debug("[Panoramix] Help output:", stdout.slice(0, 200));
    return true;
  } catch (error) {
    panoramixAvailable = false;
    const err = error as Error;
    logger.error("[Panoramix] ❌ Panoramix is NOT available:", err.message);
    logger.error("[Panoramix] Decompilation of unverified contracts will NOT work!");
    logger.error("[Panoramix] To install: pip install panoramix-decompiler");
    return false;
  }
}

/**
 * Decompile bytecode using Panoramix (PREFERRED METHOD)
 */
export async function decompileWithPanoramixFromBytecode(
  bytecode: string
): Promise<string> {
  // Clean bytecode - remove 0x prefix if present
  const cleanBytecode = bytecode.startsWith("0x") ? bytecode.slice(2) : bytecode;

  logger.info(`[Panoramix] Starting bytecode decompilation (${cleanBytecode.length} chars)...`);
  logger.debug(`[Panoramix] Bytecode preview: ${cleanBytecode.slice(0, 100)}...`);

  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(
      `panoramix ${cleanBytecode}`,
      {
        timeout: DECOMPILE_TIMEOUT,
        env: { ...process.env },
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
      }
    );

    const duration = Date.now() - startTime;

    if (stderr && stderr.trim()) {
      logger.warn(`[Panoramix] Stderr output: ${stderr.slice(0, 500)}`);
    }

    if (stdout && stdout.trim()) {
      logger.info(`[Panoramix] ✅ Bytecode decompilation successful (${duration}ms, ${stdout.length} chars output)`);
      logger.debug(`[Panoramix] Output preview:\n${stdout.slice(0, 500)}...`);
      return stdout;
    }

    logger.warn(`[Panoramix] ⚠️ Decompilation returned empty output (${duration}ms)`);
    return "";
  } catch (error) {
    const err = error as Error & { code?: string; killed?: boolean; stderr?: string };
    const duration = Date.now() - startTime;

    if (err.killed) {
      logger.error(`[Panoramix] ❌ Decompilation TIMED OUT after ${duration}ms (limit: ${DECOMPILE_TIMEOUT}ms)`);
      throw new Error("Panoramix decompilation timed out");
    }

    logger.error(`[Panoramix] ❌ Bytecode decompilation FAILED (${duration}ms):`, err.message);
    if (err.stderr) {
      logger.error(`[Panoramix] Stderr: ${err.stderr.slice(0, 500)}`);
    }
    throw new Error(`Decompilation failed: ${err.message}`);
  }
}

/**
 * Decompile a contract address using Panoramix (FALLBACK METHOD)
 */
export async function decompileWithPanoramixFromAddress(
  address: string,
  network: Network
): Promise<string> {
  const rpcUrl = getRpcUrl(network);

  logger.info(`[Panoramix] Starting address-based decompilation for ${address}...`);
  logger.debug(`[Panoramix] Using RPC URL: ${rpcUrl}`);

  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(
      `panoramix ${address}`,
      {
        timeout: DECOMPILE_TIMEOUT,
        env: {
          ...process.env,
          WEB3_PROVIDER_URI: rpcUrl,
        },
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      }
    );

    const duration = Date.now() - startTime;

    if (stderr && stderr.trim()) {
      logger.warn(`[Panoramix] Stderr: ${stderr.slice(0, 500)}`);
    }

    if (stdout && stdout.trim()) {
      logger.info(`[Panoramix] ✅ Address decompilation successful (${duration}ms, ${stdout.length} chars)`);
      return stdout;
    }

    logger.warn(`[Panoramix] ⚠️ Address decompilation returned empty (${duration}ms)`);
    return "";
  } catch (error) {
    const err = error as Error & { code?: string; killed?: boolean };
    const duration = Date.now() - startTime;

    if (err.killed) {
      logger.error(`[Panoramix] ❌ Address decompilation TIMED OUT (${duration}ms)`);
      throw new Error("Panoramix decompilation timed out");
    }

    logger.error(`[Panoramix] ❌ Address decompilation FAILED (${duration}ms):`, err.message);
    throw new Error(`Decompilation failed: ${err.message}`);
  }
}

/**
 * Decompile a specific function from bytecode
 */
export async function decompileFunctionFromBytecode(
  bytecode: string,
  functionSelector: string
): Promise<string> {
  const cleanBytecode = bytecode.startsWith("0x") ? bytecode.slice(2) : bytecode;

  logger.info(`[Panoramix] Decompiling function ${functionSelector}...`);

  try {
    const { stdout, stderr } = await execAsync(
      `panoramix ${cleanBytecode} --function ${functionSelector}`,
      {
        timeout: DECOMPILE_TIMEOUT,
        env: { ...process.env },
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    if (stderr && !stdout) {
      logger.warn(`[Panoramix] Function decompile stderr: ${stderr}`);
    }

    logger.info(`[Panoramix] ✅ Function decompilation complete`);
    return stdout || "";
  } catch (error) {
    const err = error as Error;
    logger.error(`[Panoramix] ❌ Function decompilation failed:`, err.message);
    throw new Error(`Function decompilation failed: ${err.message}`);
  }
}

/**
 * Try to decompile with fallback strategies
 * PRIORITY: Bytecode first (more reliable), then address-based
 */
export async function decompileContract(
  address: string,
  network: Network,
  bytecode?: string
): Promise<{
  success: boolean;
  decompiled: string;
  method: "bytecode" | "address" | "none";
  error?: string;
}> {
  logger.info(`[Panoramix] === Starting decompilation for ${address} ===`);

  // First, check if Panoramix is available
  const available = await isPanoramixAvailable();
  if (!available) {
    logger.error(`[Panoramix] Cannot decompile - Panoramix not installed`);
    return {
      success: false,
      decompiled: "",
      method: "none",
      error: "Panoramix is not installed or not in PATH",
    };
  }

  // PRIORITY 1: Try bytecode-based decompilation (more reliable)
  if (bytecode && bytecode !== "0x" && bytecode.length > 2) {
    logger.info(`[Panoramix] Attempting bytecode-based decompilation (preferred)...`);
    logger.info(`[Panoramix] Bytecode info:`);
    logger.info(`[Panoramix]   - Length: ${bytecode.length} chars`);
    logger.info(`[Panoramix]   - Starts with 0x: ${bytecode.startsWith("0x")}`);
    logger.info(`[Panoramix]   - Preview (first 200 chars): ${bytecode.slice(0, 200)}...`);
    logger.info(`[Panoramix]   - Preview (last 100 chars): ...${bytecode.slice(-100)}`);
    try {
      const result = await decompileWithPanoramixFromBytecode(bytecode);
      if (result && result.trim().length > 0) {
        logger.info(`[Panoramix] ✅ SUCCESS via bytecode method`);
        return {
          success: true,
          decompiled: result,
          method: "bytecode",
        };
      }
      logger.warn(`[Panoramix] Bytecode method returned empty, trying address method...`);
    } catch (error) {
      logger.warn(`[Panoramix] Bytecode method failed, trying address method...`, error);
    }
  } else {
    logger.warn(`[Panoramix] No valid bytecode provided, skipping bytecode method`);
    logger.warn(`[Panoramix] Bytecode check: exists=${!!bytecode}, value="${bytecode?.slice(0, 50) || "(null)"}", length=${bytecode?.length || 0}`);
  }

  // PRIORITY 2: Fallback to address-based decompilation
  logger.info(`[Panoramix] Attempting address-based decompilation (fallback)...`);
  try {
    const result = await decompileWithPanoramixFromAddress(address, network);
    if (result && result.trim().length > 0) {
      logger.info(`[Panoramix] ✅ SUCCESS via address method`);
      return {
        success: true,
        decompiled: result,
        method: "address",
      };
    }
    logger.warn(`[Panoramix] Address method returned empty`);
  } catch (error) {
    logger.error(`[Panoramix] Address method also failed:`, error);
  }

  logger.error(`[Panoramix] ❌ All decompilation methods failed for ${address}`);
  return {
    success: false,
    decompiled: "",
    method: "none",
    error: "All decompilation methods failed",
  };
}

/**
 * Parse function signatures from decompiled code
 */
export function parseFunctionSignatures(decompiledCode: string): string[] {
  const signatures: string[] = [];

  // Match function definitions in pseudo-Solidity
  const functionPattern = /def\s+(\w+)\s*\([^)]*\)/g;
  let match;

  while ((match = functionPattern.exec(decompiledCode)) !== null) {
    signatures.push(match[0]);
  }

  // Also match Solidity-style function definitions
  const solidityPattern = /function\s+(\w+)\s*\([^)]*\)[^{]*/g;
  while ((match = solidityPattern.exec(decompiledCode)) !== null) {
    signatures.push(match[0].trim());
  }

  logger.debug(`[Panoramix] Parsed ${signatures.length} function signatures`);
  return signatures;
}

/**
 * Extract storage variables from decompiled code
 */
export function parseStorageVariables(decompiledCode: string): {
  slot: string;
  name: string;
  type?: string;
}[] {
  const variables: { slot: string; name: string; type?: string }[] = [];

  const storPattern = /stor(\d+)|storage\[(\d+)\]/g;
  const seen = new Set<string>();
  let match;

  while ((match = storPattern.exec(decompiledCode)) !== null) {
    const slot = match[1] || match[2];
    if (!seen.has(slot)) {
      seen.add(slot);
      variables.push({
        slot,
        name: `stor${slot}`,
      });
    }
  }

  logger.debug(`[Panoramix] Parsed ${variables.length} storage variables`);
  return variables;
}
