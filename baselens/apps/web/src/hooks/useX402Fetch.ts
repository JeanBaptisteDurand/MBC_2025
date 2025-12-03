// ============================================
// x402 Fetch Hook
// Always uses EOA wallet for x402 payments (smart wallets don't support EIP-712 signing)
// ============================================

import { useCallback } from "react";
import { useWalletClient } from "wagmi";
import { wrapFetchWithPayment } from "x402-fetch";
import type { WalletClient } from "viem";
import { baseSepolia } from "viem/chains";
import { useEnsureBaseSepolia } from "./useEnsureBaseSepolia";

/**
 * Hook that provides a fetch function wrapped with x402 payment support
 * 
 * IMPORTANT: x402 payments always use the EOA wallet, even if smart wallet is enabled.
 * This is because smart wallets (ZeroDev Kernel 3.3) don't support EIP-712 typed data
 * signing required for x402 TransferWithAuthorization.
 * 
 * Ensure your USDC is in your EOA wallet for x402 payments to work.
 * 
 * @param isSmartWalletEnabled - Ignored for x402 payments (always uses EOA)
 * @returns fetchWithPayment function that automatically handles x402 payments
 */
export function useX402Fetch(isSmartWalletEnabled: boolean) {
  const { data: eoaWalletClient } = useWalletClient();
  const { ensureBaseSepolia } = useEnsureBaseSepolia();

  const fetchWithPayment = useCallback(
    async (url: string, options?: RequestInit): Promise<Response> => {
      // x402 payments always require EOA wallet
      if (!eoaWalletClient) {
        throw new Error("No wallet available. Please connect your EOA wallet. x402 payments require EOA wallet.");
      }

      // 🔥 Force chain to Base Sepolia before any x402 payment
      // This avoids InternalRpcError: Provided chainId "84532" must match active chainId "11155111"
      try {
        await ensureBaseSepolia();
      } catch (err) {
        console.error("[useX402Fetch] Failed to switch to Base Sepolia:", err);
        throw new Error(
          `Please switch to Base Sepolia network (Chain ID: ${baseSepolia.id}) in your wallet. ` +
          `Error: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }

      // Always use EOA wallet for x402 payments (smart wallets don't support EIP-712 signing)
      // Create a wallet client explicitly configured for Base Sepolia
      // This ensures x402-fetch uses the correct chain
      const walletClient: WalletClient = {
        ...eoaWalletClient,
        chain: baseSepolia,
        // Override sendTransaction to always use Base Sepolia and ensure chain switch
        sendTransaction: async (args: any) => {
          // Double-check chain before sending
          const currentChainId = await eoaWalletClient.getChainId?.().catch(() => null);
          if (currentChainId && currentChainId !== baseSepolia.id) {
            console.warn(`[useX402Fetch] Wallet chain mismatch: ${currentChainId} vs ${baseSepolia.id}, attempting to switch`);
            // The chain switch should have happened above, but if not, we'll try here
          }
          return eoaWalletClient.sendTransaction({
            ...args,
            chain: baseSepolia,
          });
        },
      } as WalletClient;

      try {
        // Wrap fetch with x402 payment support
        // x402-fetch will automatically handle 402 responses and trigger payment
        // Pass the wallet client with explicit Base Sepolia chain configuration
        const wrappedFetch = wrapFetchWithPayment(fetch, walletClient);

        // Use the wrapped fetch - it will automatically handle payment if 402 is returned
        const response = await wrappedFetch(url, options);

        // If we still get a 402, it means payment failed or wasn't triggered
        if (response.status === 402) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message ||
            "Payment required. Please ensure your EOA wallet is connected and has sufficient USDC balance."
          );
        }

        return response;
      } catch (error: any) {
        // Re-throw with more context
        if (error.message) {
          throw error;
        }
        throw new Error(
          `Payment failed: ${error?.message || "Unknown error. Please try again."}`
        );
      }
    },
    [eoaWalletClient, ensureBaseSepolia]
  );

  return fetchWithPayment;
}

