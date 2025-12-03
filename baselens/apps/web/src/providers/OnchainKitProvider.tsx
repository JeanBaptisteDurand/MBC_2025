import { ReactNode } from "react";
import { baseSepolia } from "viem/chains";
import { http, createConfig } from "wagmi";
import { WagmiProvider } from "wagmi";
import { coinbaseWallet } from "wagmi/connectors";
import { OnchainKitProvider as OCKProvider } from "@coinbase/onchainkit";

// Wagmi configuration for Base Sepolia
const wagmiConfig = createConfig({
  chains: [baseSepolia], // ✅ ONLY baseSepolia
  connectors: [
    coinbaseWallet({
      appName: "BaseLens",
      preference: "smartWalletOnly",
    }),
  ],
  transports: {
    [baseSepolia.id]: http("https://sepolia.base.org"), // Base Sepolia RPC URL
  },
});

interface OnchainKitProviderProps {
  children: ReactNode;
}

export function OnchainKitProvider({ children }: OnchainKitProviderProps) {
  const apiKey = import.meta.env.VITE_PUBLIC_ONCHAINKIT_API_KEY || "";

  return (
    <WagmiProvider config={wagmiConfig}>
      <OCKProvider
        apiKey={apiKey}
        chain={baseSepolia}
        config={{
          appearance: {
            mode: "auto",
            theme: "cyberpunk",
          },
          wallet: {
            display: "modal",
          },
        }}
      >
        {children}
      </OCKProvider>
    </WagmiProvider>
  );
}
