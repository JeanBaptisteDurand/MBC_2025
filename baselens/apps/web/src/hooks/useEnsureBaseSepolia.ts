// ============================================
// Hook to ensure wallet is on Base Sepolia
// ============================================

import { useSwitchChain } from "wagmi";
import { baseSepolia } from "viem/chains";

/**
 * Hook that provides a function to ensure the wallet is switched to Base Sepolia
 * This should be called before any x402 payment flows to avoid chain mismatch errors
 */
export function useEnsureBaseSepolia() {
  const { switchChainAsync } = useSwitchChain();

  async function ensureBaseSepolia() {
    try {
      await switchChainAsync({ chainId: baseSepolia.id }); // 84532
    } catch (err) {
      console.error("Could not switch to Base Sepolia:", err);
      throw err;
    }
  }

  return { ensureBaseSepolia };
}
