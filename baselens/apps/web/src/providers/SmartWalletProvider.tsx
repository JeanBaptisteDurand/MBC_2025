import { ReactNode, createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { baseSepolia } from "viem/chains";
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { createPublicClient, http, type Address, type Hash, parseEther, formatEther } from "viem";
import { getEntryPoint, KERNEL_V3_3 } from "@zerodev/sdk/constants";

interface SmartWalletContextType {
  smartWalletAddress: Address | null;
  isSmartWalletActive: boolean;
  isInitializing: boolean;
  activateSmartWallet: () => Promise<Address | null>;
  deactivateSmartWallet: () => Promise<void>;
  sendSmartWalletPayment: (calls: Array<{ to: Address; data: `0x${string}`; value: bigint }>) => Promise<Hash>;
  kernelClient: any | null;
  kernelAccount: any | null;
}

const SmartWalletContext = createContext<SmartWalletContextType | undefined>(undefined);

interface SmartWalletProviderProps {
  children: ReactNode;
  projectId: string;
  bundlerUrl?: string;
  paymasterUrl?: string;
}

// ZeroDev default URLs for Base Sepolia
// Format: https://rpc.zerodev.app/api/v3/{projectId}/chain/{chainId}
// Base Sepolia chain ID: 84532
const getZeroDevUrls = (projectId: string, chainId: number = 84532) => {
  const baseUrl = `https://rpc.zerodev.app/api/v3/${projectId}/chain/${chainId}`;
  return {
    bundler: baseUrl, // ZeroDev v3 uses unified endpoint for bundler
    paymaster: baseUrl, // ZeroDev v3 uses unified endpoint for paymaster
  };
};

export function SmartWalletProvider({
  children,
  projectId,
  bundlerUrl: customBundlerUrl,
  paymasterUrl: customPaymasterUrl,
}: SmartWalletProviderProps) {
  const { address: eoaAddress, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [smartWalletAddress, setSmartWalletAddress] = useState<Address | null>(null);
  const [isSmartWalletActive, setIsSmartWalletActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [kernelAccount, setKernelAccount] = useState<any>(null);
  const [kernelClient, setKernelClient] = useState<any>(null);

  // Get ZeroDev URLs (use custom if provided, otherwise use defaults)
  // Base Sepolia chain ID: 84532
  const zeroDevUrls = projectId ? getZeroDevUrls(projectId, baseSepolia.id) : null;
  const bundlerUrl = customBundlerUrl || zeroDevUrls?.bundler;
  // For API v3, paymaster uses the same unified endpoint as bundler
  // IMPORTANT: Only use custom paymaster URL if it has the correct format (/chain/{chainId})
  // Otherwise, always use bundler URL (which has the correct format)
  const paymasterUrl =
    customPaymasterUrl && customPaymasterUrl.includes('/chain/')
      ? customPaymasterUrl
      : bundlerUrl; // Always default to bundler URL for API v3

  // Log configuration for debugging (remove in production if needed)
  if (bundlerUrl) {
    console.log("[SmartWallet] Bundler URL configured:", bundlerUrl);
    console.log("[SmartWallet] Paymaster URL configured:", paymasterUrl);
  } else {
    console.warn("[SmartWallet] No bundler URL configured. Smart wallet operations will fail.");
  }

  // Public client for Base Sepolia (use regular RPC, not bundler)
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  // Initialize smart wallet when EOA is connected
  useEffect(() => {
    if (!isConnected || !eoaAddress || !walletClient) {
      setSmartWalletAddress(null);
      setIsSmartWalletActive(false);
      setKernelAccount(null);
      setKernelClient(null);
      return;
    }

    // Create or update user in backend when wallet connects
    const syncUserWithBackend = async () => {
      try {
        // First, create or update user with their wallet address
        const createUserResponse = await fetch(
          `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/users`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              address: eoaAddress,
            }),
          }
        );

        if (!createUserResponse.ok) {
          const errorText = await createUserResponse.text().catch(() => "Unknown error");
          console.error("[SmartWallet] Failed to create/update user:", createUserResponse.status, errorText);
          // Continue anyway - user might already exist or backend might be down
        }

        // Then check if smart wallet is enabled from backend
        // If user creation failed, try to fetch anyway (user might already exist)
        const profileResponse = await fetch(
          `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/me?address=${encodeURIComponent(eoaAddress)}`
        );

        if (profileResponse.ok) {
          const user = await profileResponse.json();

          // If smart wallet address exists (even if disabled), show it
          if (user.smart_wallet_address) {
            setSmartWalletAddress(user.smart_wallet_address as Address);

            // If smart wallet is enabled, initialize it
            if (user.smart_wallet_enabled) {
              setIsSmartWalletActive(true);
              // Initialize kernel account for this existing address
              await initializeKernelAccount(user.smart_wallet_address as Address);
            } else {
              // Smart wallet exists but is disabled - just show the address
              setIsSmartWalletActive(false);
            }
          } else {
            // No smart wallet address yet
            setSmartWalletAddress(null);
            setIsSmartWalletActive(false);
          }
        } else if (profileResponse.status === 404) {
          // User doesn't exist yet - this is fine, they'll be created when needed
          console.log("[SmartWallet] User not found in backend yet, will be created on activation");
          setSmartWalletAddress(null);
          setIsSmartWalletActive(false);
        } else {
          console.warn("[SmartWallet] Error fetching user profile:", profileResponse.status);
        }
      } catch (error) {
        console.error("[SmartWallet] Error syncing with backend:", error);
      }
    };

    syncUserWithBackend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, eoaAddress, walletClient]);

  const initializeKernelAccount = useCallback(async (existingAddress?: Address) => {
    if (!walletClient || !eoaAddress) return null;

    try {
      setIsInitializing(true);

      // ZeroDev SDK v5 uses EntryPoint v0.7 and Kernel v3.3
      const entryPoint = getEntryPoint("0.7");

      // Create ECDSA validator from wallet client
      const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer: walletClient,
        entryPoint,
        kernelVersion: KERNEL_V3_3,
      });

      // Create kernel account (address is deterministic, so it will be the same if it already exists)
      const account = await createKernelAccount(publicClient, {
        plugins: {
          sudo: ecdsaValidator,
        },
        entryPoint,
        kernelVersion: KERNEL_V3_3,
      });

      const accountAddress = account.address;

      // Verify the address matches if we have an existing one
      if (existingAddress && accountAddress.toLowerCase() !== existingAddress.toLowerCase()) {
        console.warn(
          "[SmartWallet] Generated address doesn't match existing address. Using existing.",
          { generated: accountAddress, existing: existingAddress }
        );
        // Still use the account we created (it's deterministic, so this shouldn't happen)
      }

      // Create kernel client with bundler and paymaster
      // Note: For ZeroDev SDK v5, paymaster can be configured with rpcUrl
      // The paymaster will automatically sponsor gas if configured in ZeroDev dashboard

      // Ensure bundler URL is set - required for ERC-4337 operations
      if (!bundlerUrl) {
        throw new Error(
          "ZeroDev bundler URL is required. Please set VITE_ZERODEV_PROJECT_ID or VITE_ZERODEV_BUNDLER_URL"
        );
      }

      console.log("[SmartWallet] Creating kernel client with:", {
        bundlerUrl,
        paymasterUrl: paymasterUrl || "not configured",
        chain: baseSepolia.name,
        accountAddress: accountAddress,
      });

      // Create paymaster client for gas sponsorship
      // ZeroDev API v3 uses unified endpoint for both bundler and paymaster
      // paymasterUrl is already validated to use bundler URL format if custom URL is invalid
      console.log("[SmartWallet] Using paymaster URL:", paymasterUrl);

      const paymasterClient = createZeroDevPaymasterClient({
        chain: baseSepolia,
        transport: http(paymasterUrl),
      });

      // Always configure paymaster for gas sponsorship
      // Use getPaymasterData function to sponsor user operations
      const client = createKernelAccountClient({
        account,
        entryPoint,
        chain: baseSepolia,
        bundlerTransport: http(bundlerUrl), // Always use the bundler URL, never fallback to public RPC
        paymaster: {
          getPaymasterData: async (userOperation) => {
            console.log("[SmartWallet] Requesting paymaster sponsorship for user operation");
            try {
              const result = await paymasterClient.sponsorUserOperation({
                userOperation,
              });
              console.log("[SmartWallet] Paymaster sponsorship approved:", result);
              return result;
            } catch (error) {
              console.error("[SmartWallet] Paymaster sponsorship failed:", error);
              throw error;
            }
          },
        },
        client: publicClient,
      });

      setKernelAccount(account);
      setKernelClient(client);
      setSmartWalletAddress(accountAddress);

      return accountAddress;
    } catch (error) {
      console.error("[SmartWallet] Error initializing kernel account:", error);
      return null;
    } finally {
      setIsInitializing(false);
    }
  }, [walletClient, eoaAddress, publicClient, bundlerUrl, paymasterUrl]);

  const activateSmartWallet = useCallback(async (): Promise<Address | null> => {
    if (!isConnected || !eoaAddress) {
      throw new Error("Please connect your wallet first");
    }

    if (!walletClient) {
      throw new Error("Wallet is not ready yet. Please wait a moment and try again, or reconnect your wallet.");
    }

    try {
      setIsInitializing(true);

      // First, check if user already has a smart wallet address saved in backend
      let accountAddress: Address | null = null;

      try {
        const profileResponse = await fetch(
          `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/me?address=${encodeURIComponent(eoaAddress)}`
        );

        if (profileResponse.ok) {
          const user = await profileResponse.json();
          // If smart wallet address exists in backend, reuse it
          if (user.smart_wallet_address) {
            accountAddress = user.smart_wallet_address as Address;
            console.log("[SmartWallet] Reusing existing smart wallet address:", accountAddress);
          }
        }
      } catch (error) {
        console.warn("[SmartWallet] Could not fetch existing smart wallet, will create new one");
      }

      // If no existing address, initialize kernel account (creates new or gets deterministic address)
      if (!accountAddress) {
        accountAddress = await initializeKernelAccount();
      } else {
        // Initialize with existing address
        await initializeKernelAccount(accountAddress);
      }

      if (!accountAddress) {
        throw new Error("Failed to create or retrieve smart wallet");
      }

      // Save to backend (enable smart wallet and save address)
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/me/smart-wallet/enable`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            address: eoaAddress,
            smartWalletAddress: accountAddress,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to save smart wallet to backend");
      }

      setIsSmartWalletActive(true);
      return accountAddress;
    } catch (error) {
      console.error("[SmartWallet] Error activating smart wallet:", error);
      throw error;
    } finally {
      setIsInitializing(false);
    }
  }, [isConnected, eoaAddress, walletClient, initializeKernelAccount]);

  const deactivateSmartWallet = useCallback(async (): Promise<void> => {
    if (!eoaAddress) {
      throw new Error("No wallet connected");
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/me/smart-wallet/disable`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            address: eoaAddress,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to disable smart wallet");
      }

      // Disable smart wallet but keep the address in state for display
      // The address is still saved in backend, just disabled
      setIsSmartWalletActive(false);
      // Don't clear smartWalletAddress - keep it for reference
      setKernelAccount(null);
      setKernelClient(null);
    } catch (error) {
      console.error("[SmartWallet] Error deactivating smart wallet:", error);
      throw error;
    }
  }, [eoaAddress]);

  const sendSmartWalletPayment = useCallback(
    async (calls: Array<{ to: Address; data: `0x${string}`; value: bigint }>): Promise<Hash> => {
      if (!kernelClient || !isSmartWalletActive || !kernelAccount) {
        throw new Error("Smart wallet is not active");
      }

      console.log("[SmartWallet] Sending payment with calls:", calls);

      try {
        // Calculate total amount needed (sum of all call values)
        const totalAmount = calls.reduce((sum, call) => sum + call.value, 0n);

        // Check if smart wallet has sufficient funds (but don't auto-transfer)
        const balance = await publicClient.getBalance({
          address: smartWalletAddress!,
        });

        if (balance < totalAmount) {
          throw new Error(
            `Smart wallet has insufficient funds. Current balance: ${formatEther(balance)} ETH, required: ${formatEther(totalAmount)} ETH. ` +
            `Please fund your smart wallet from the Profile page.`
          );
        }

        console.log(`[SmartWallet] Smart wallet has sufficient funds: ${formatEther(balance)} ETH`);
        // ZeroDev SDK v5: sendUserOperation accepts calls array directly
        // Convert calls to the format expected by the SDK
        const formattedCalls = calls.map((call) => ({
          to: call.to,
          value: call.value,
          data: call.data,
        }));

        // Send user operation via kernel client
        // The SDK will handle encoding internally
        const userOpHash = await kernelClient.sendUserOperation({
          calls: formattedCalls,
        });

        // Wait for the user operation receipt
        const receipt = await kernelClient.waitForUserOperationReceipt({
          hash: userOpHash,
        });

        // Extract transaction hash from receipt
        // The receipt structure may vary, so handle both cases
        const txHash = receipt.receipt?.transactionHash || receipt.transactionHash || userOpHash;
        return txHash as Hash;
      } catch (error: any) {
        console.error("[SmartWallet] Error sending payment:", error);

        // Provide helpful error messages for common issues
        if (error?.details?.includes("ProjectId not found")) {
          throw new Error(
            "ZeroDev Project ID not found. Please verify:\n" +
            "1. Your project ID is correct in the ZeroDev dashboard (https://dashboard.zerodev.app)\n" +
            "2. The project is configured for Base Sepolia testnet\n" +
            "3. The project is active/enabled\n" +
            `Current Project ID: ${projectId || "not set"}`
          );
        }

        if (error?.details?.includes("AA21 didn't pay prefund") || error?.message?.includes("didn't pay prefund")) {
          throw new Error(
            "Paymaster failed to sponsor gas. Please verify:\n" +
            "1. Gas sponsorship is enabled in your ZeroDev dashboard (https://dashboard.zerodev.app)\n" +
            "2. Go to 'Gas Policies' section and ensure a policy is active\n" +
            "3. Check that your project has sufficient funds for gas sponsorship\n" +
            "4. Verify the paymaster URL is correct (should match bundler URL for API v3)"
          );
        }

        if (error?.message?.includes("InsufficientPrefund") || error?.message?.includes("sufficient funds")) {
          throw new Error(
            "Smart wallet has insufficient funds or paymaster is not configured. Please:\n" +
            "1. Enable gas sponsorship in ZeroDev dashboard (Gas Policies section)\n" +
            "2. Or fund the smart wallet address with ETH for gas fees"
          );
        }

        if (error?.status === 404) {
          throw new Error(
            "ZeroDev bundler endpoint not found. Please verify your project ID is correct and the project exists in ZeroDev dashboard."
          );
        }

        throw error;
      }
    },
    [kernelClient, kernelAccount, isSmartWalletActive, projectId, smartWalletAddress, publicClient]
  );

  return (
    <SmartWalletContext.Provider
      value={{
        smartWalletAddress,
        isSmartWalletActive,
        isInitializing,
        activateSmartWallet,
        deactivateSmartWallet,
        sendSmartWalletPayment,
        kernelClient,
        kernelAccount,
      }}
    >
      {children}
    </SmartWalletContext.Provider>
  );
}

export function useSmartWallet() {
  const context = useContext(SmartWalletContext);
  if (context === undefined) {
    throw new Error("useSmartWallet must be used within a SmartWalletProvider");
  }
  return context;
}
