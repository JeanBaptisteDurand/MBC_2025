import { useState, useEffect } from "react";
import { useAccount, useWalletClient, useChainId, useSwitchChain } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { baseSepolia } from "viem/chains";
import { createPublicClient, http, parseAbiItem, parseEther, formatEther, encodeFunctionData, formatUnits, parseUnits } from "viem";
import { Wallet, Calendar, Coins, FileText, ExternalLink, Smartphone, CheckCircle2, XCircle, Loader2, ArrowDown } from "lucide-react";
import { shortenAddress, getBasescanTxUrl } from "../utils/explorers";
import { cn } from "../utils/cn";
import { useSmartWallet } from "../providers/SmartWalletProvider";
import { getUserProfile } from "../api/endpoints";

const PAY_CONTRACT_ADDRESS = "0x3A7F370D0C105Afc23800253504656ae99857bde" as const;

// ABI for PaymentReceived event
const paymentReceivedAbi = parseAbiItem(
  "event PaymentReceived(address indexed payer, uint256 amount, uint256 timestamp, string text)"
);

// Create public client for Base Sepolia
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

interface PaymentEvent {
  payer: string;
  amount: bigint;
  timestamp: bigint;
  text: string;
  transactionHash: string;
  blockNumber: bigint;
}

export default function Profile() {
  const { address, isConnected } = useAccount();
  const {
    smartWalletAddress,
    isSmartWalletActive,
    isInitializing,
    activateSmartWallet,
    deactivateSmartWallet,
  } = useSmartWallet();
  const [isActivating, setIsActivating] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Fetch user profile to get smart wallet status
  const { data: userProfile, refetch: refetchUserProfile } = useQuery({
    queryKey: ["userProfile", address],
    queryFn: () => getUserProfile(address || undefined),
    enabled: isConnected && !!address,
  });

  // Note: SmartWalletProvider handles syncing the address from backend
  // This component just displays what's in the context

  // Query events for the connected wallet (both EOA and smart wallet)
  const { data: events, isLoading } = useQuery({
    queryKey: ["paymentEvents", address, smartWalletAddress],
    queryFn: async (): Promise<PaymentEvent[]> => {
      if (!address) return [];

      const normalizedEoaAddress = address.toLowerCase();
      const normalizedSmartWalletAddress = smartWalletAddress?.toLowerCase() || null;

      // Collect addresses to filter by (EOA + smart wallet if exists)
      const addressesToFilter = [normalizedEoaAddress];
      if (normalizedSmartWalletAddress) {
        addressesToFilter.push(normalizedSmartWalletAddress);
      }

      // Get current block to use as toBlock
      const currentBlock = await publicClient.getBlockNumber();

      // Get ALL PaymentReceived events from the contract (last 100,000 blocks)
      // If we need more, we can paginate
      const fromBlock = currentBlock > 100000n ? currentBlock - 100000n : 0n;

      console.log(`[Profile] Fetching events from block ${fromBlock} to ${currentBlock}`);
      console.log(`[Profile] Filtering by addresses: ${addressesToFilter.join(", ")}`);

      // Get all events without filtering by payer (filter client-side)
      const logs = await publicClient.getLogs({
        address: PAY_CONTRACT_ADDRESS,
        event: paymentReceivedAbi,
        fromBlock,
        toBlock: currentBlock,
      });

      console.log(`[Profile] Found ${logs.length} total PaymentReceived events`);

      // Filter by payer address (EOA or smart wallet)
      const userLogs = logs.filter((log) => {
        const payer = log.args.payer?.toLowerCase() || "";
        return addressesToFilter.includes(payer);
      });

      console.log(`[Profile] Filtered to ${userLogs.length} events for wallets: ${addressesToFilter.join(", ")}`);

      // Fetch transaction details to get block timestamp
      const eventsWithDetails = await Promise.all(
        userLogs.map(async (log) => {
          try {
            const block = await publicClient.getBlock({ blockNumber: log.blockNumber });

            return {
              payer: log.args.payer || "",
              amount: log.args.amount || 0n,
              timestamp: BigInt(block.timestamp),
              text: log.args.text || "",
              transactionHash: log.transactionHash,
              blockNumber: log.blockNumber,
            };
          } catch (error) {
            console.error(`[Profile] Error fetching block ${log.blockNumber}:`, error);
            // Return with 0 timestamp if block fetch fails
            return {
              payer: log.args.payer || "",
              amount: log.args.amount || 0n,
              timestamp: 0n,
              text: log.args.text || "",
              transactionHash: log.transactionHash,
              blockNumber: log.blockNumber,
            };
          }
        })
      );

      // Sort by block number (newest first)
      return eventsWithDetails.sort((a, b) => {
        if (b.blockNumber > a.blockNumber) return 1;
        if (b.blockNumber < a.blockNumber) return -1;
        return 0;
      });
    },
    enabled: isConnected && !!address,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  if (!isConnected) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="card p-8 max-w-md text-center">
          <Wallet className="w-16 h-16 mx-auto mb-4 text-surface-500" />
          <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
          <p className="text-surface-400">
            Connect your wallet to view your payment history
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] py-8">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-display font-bold mb-2">
            <span className="gradient-text">Payment History</span>
          </h1>
          <p className="text-surface-400">
            View all payments you've made to analyze contracts
          </p>
        </div>

        {/* Wallet Info */}
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-900/50 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-primary-400" />
            </div>
            <div>
              <p className="text-xs text-surface-500 uppercase">Connected Wallet</p>
              <p className="text-sm font-mono text-surface-100">
                {shortenAddress(address || "", 10)}
              </p>
            </div>
          </div>
        </div>

        {/* Smart Wallet Section */}
        {isConnected && (
          <div className="card p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary-900/50 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-primary-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-surface-100">Smart Wallet</h3>
                  <p className="text-xs text-surface-500">ERC-4337 Account Abstraction</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isSmartWalletActive ? (
                  <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-green-900/20 border border-green-700/50">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-green-400">Active</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-surface-800 border border-surface-700">
                    <XCircle className="w-4 h-4 text-surface-500" />
                    <span className="text-sm font-medium text-surface-500">Inactive</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {/* EOA Address */}
              <div>
                <p className="text-xs text-surface-500 uppercase mb-1">EOA Address</p>
                <p className="text-sm font-mono text-surface-300 break-all">
                  {address || "Not connected"}
                </p>
              </div>

              {/* Smart Wallet Address */}
              <div>
                <p className="text-xs text-surface-500 uppercase mb-1">Smart Wallet Address</p>
                {smartWalletAddress || userProfile?.smart_wallet_address ? (
                  <p className="text-sm font-mono text-surface-300 break-all">
                    {smartWalletAddress || userProfile?.smart_wallet_address || ""}
                  </p>
                ) : (
                  <p className="text-sm text-surface-500 italic">Not created yet</p>
                )}
              </div>

              {/* Action Button */}
              <div className="space-y-3">
                {isSmartWalletActive ? (
                  <button
                    onClick={async () => {
                      setIsDeactivating(true);
                      try {
                        await deactivateSmartWallet();
                        // Refetch user profile to sync state
                        await refetchUserProfile();
                      } catch (error) {
                        console.error("Failed to deactivate smart wallet:", error);
                        alert("Failed to deactivate smart wallet. Please try again.");
                      } finally {
                        setIsDeactivating(false);
                      }
                    }}
                    disabled={isDeactivating || isInitializing}
                    className="btn btn-secondary w-full"
                  >
                    {isDeactivating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Deactivating...</span>
                      </>
                    ) : (
                      "Deactivate Smart Wallet"
                    )}
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      setIsActivating(true);
                      try {
                        await activateSmartWallet();
                        // Refetch user profile to sync state
                        await refetchUserProfile();
                      } catch (error) {
                        console.error("Failed to activate smart wallet:", error);
                        alert("Failed to activate smart wallet. Please try again.");
                      } finally {
                        setIsActivating(false);
                      }
                    }}
                    disabled={isActivating || isInitializing}
                    className="btn btn-primary w-full"
                  >
                    {isActivating || isInitializing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Activating...</span>
                      </>
                    ) : (
                      "Activate Smart Wallet"
                    )}
                  </button>
                )}

                {/* Fund Smart Wallet Component */}
                {smartWalletAddress || userProfile?.smart_wallet_address ? (
                  <>
                    <FundSmartWallet
                      smartWalletAddress={smartWalletAddress || userProfile?.smart_wallet_address || ""}
                      isSmartWalletActive={isSmartWalletActive}
                    />
                    <FundSmartWalletUSDC
                      smartWalletAddress={smartWalletAddress || userProfile?.smart_wallet_address || ""}
                      isSmartWalletActive={isSmartWalletActive}
                    />
                  </>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Events List */}
        {isLoading ? (
          <div className="card p-8 text-center">
            <p className="text-surface-400">Loading payment history...</p>
          </div>
        ) : !events || events.length === 0 ? (
          <div className="card p-8 text-center">
            <Coins className="w-16 h-16 mx-auto mb-4 text-surface-500" />
            <h3 className="text-xl font-semibold mb-2">No Payments Yet</h3>
            <p className="text-surface-400">
              You haven't made any payments yet. Start analyzing contracts to see your payment history here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {events.length} Payment{events.length !== 1 ? "s" : ""}
              </h2>
            </div>

            {events.map((event, index) => (
              <PaymentEventCard
                key={`${event.transactionHash}-${index}`}
                event={event}
                eoaAddress={address || undefined}
                smartWalletAddress={smartWalletAddress || userProfile?.smart_wallet_address || null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Component to fund smart wallet with X * 0.0001 ETH
function FundSmartWallet({
  smartWalletAddress,
  isSmartWalletActive
}: {
  smartWalletAddress: string;
  isSmartWalletActive: boolean;
}) {
  const [numberOfAnalyses, setNumberOfAnalyses] = useState<number>(1);
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState("");
  const { data: walletClient } = useWalletClient();
  const { address: eoaAddress } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const queryClient = useQueryClient();

  // Create public client for Base Sepolia
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const handleFund = async () => {
    if (!walletClient || !eoaAddress || !isSmartWalletActive) {
      setError("Smart wallet must be active to fund it");
      return;
    }

    setIsTransferring(true);
    setError("");

    try {
      // Calculate amount: numberOfAnalyses * 0.0001 ETH
      const amountPerAnalysis = parseEther("0.0001");
      const totalAmount = amountPerAnalysis * BigInt(numberOfAnalyses);

      console.log(`[FundSmartWallet] Transferring ${formatEther(totalAmount)} ETH to smart wallet ${smartWalletAddress}`);

      // Check if we're on the correct chain (Base Sepolia = 84532)
      if (chainId !== baseSepolia.id) {
        console.log(`[FundSmartWallet] Switching from chain ${chainId} to Base Sepolia (${baseSepolia.id})`);
        try {
          await switchChain({ chainId: baseSepolia.id });
          // Wait a bit for the switch to complete
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (switchError: any) {
          throw new Error(
            `Please switch to Base Sepolia network (Chain ID: ${baseSepolia.id}). ` +
            `Current network: ${chainId}. ${switchError?.message || ""}`
          );
        }
      }

      // Transfer ETH from EOA to smart wallet
      const txHash = await walletClient.sendTransaction({
        to: smartWalletAddress as `0x${string}`,
        value: totalAmount,
        chain: baseSepolia,
      });

      console.log(`[FundSmartWallet] Transfer transaction sent: ${txHash}`);

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      if (receipt.status === "success") {
        console.log(`[FundSmartWallet] Transfer confirmed. Smart wallet funded with ${formatEther(totalAmount)} ETH.`);
        // Invalidate balance query to refresh
        queryClient.invalidateQueries({ queryKey: ["smartWalletBalance", smartWalletAddress] });
        // Reset form
        setNumberOfAnalyses(1);
        setError("");
      } else {
        throw new Error("Transfer transaction failed");
      }
    } catch (error: any) {
      console.error("[FundSmartWallet] Error funding smart wallet:", error);
      setError(error?.message || "Failed to fund smart wallet. Please try again.");
    } finally {
      setIsTransferring(false);
    }
  };

  // Get current balance of smart wallet
  const { data: smartWalletBalance } = useQuery({
    queryKey: ["smartWalletBalance", smartWalletAddress],
    queryFn: async () => {
      if (!smartWalletAddress) return null;
      const balance = await publicClient.getBalance({
        address: smartWalletAddress as `0x${string}`,
      });
      return balance;
    },
    enabled: !!smartWalletAddress,
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  const amountPerAnalysis = parseEther("0.0001");
  const totalAmount = amountPerAnalysis * BigInt(numberOfAnalyses);

  return (
    <div className="border-t border-surface-700 pt-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Coins className="w-4 h-4 text-primary-400" />
        <h4 className="text-sm font-semibold text-surface-200">Fund Smart Wallet</h4>
      </div>

      <p className="text-xs text-surface-500 mb-3">
        Transfer ETH from your EOA to your smart wallet for sponsored gas transactions
      </p>

      {/* Current Balance */}
      {smartWalletBalance !== undefined && (
        <div className="mb-3 p-2 rounded-lg bg-surface-800/50">
          <p className="text-xs text-surface-500">Current Balance</p>
          <p className="text-sm font-mono text-surface-200">
            {formatEther(smartWalletBalance)} ETH
          </p>
        </div>
      )}

      {/* Number of Analyses Input */}
      <div className="mb-3">
        <label htmlFor="analyses" className="block text-xs text-surface-500 mb-1">
          Number of Analyses
        </label>
        <input
          id="analyses"
          type="number"
          min="1"
          max="100"
          value={numberOfAnalyses}
          onChange={(e) => {
            const value = parseInt(e.target.value, 10);
            if (!isNaN(value) && value >= 1 && value <= 100) {
              setNumberOfAnalyses(value);
            }
          }}
          disabled={!isSmartWalletActive || isTransferring}
          className="input w-full text-sm"
        />
        <p className="text-xs text-surface-500 mt-1">
          Amount: {formatEther(totalAmount)} ETH ({numberOfAnalyses} × 0.0001 ETH)
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-3 p-2 rounded-lg bg-red-900/20 border border-red-700/50">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Transfer Button */}
      <button
        onClick={handleFund}
        disabled={!isSmartWalletActive || isTransferring || numberOfAnalyses < 1}
        className={cn(
          "btn w-full",
          isSmartWalletActive ? "btn-primary" : "btn-secondary opacity-50 cursor-not-allowed"
        )}
      >
        {isTransferring ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Transferring...</span>
          </>
        ) : (
          <>
            <ArrowDown className="w-4 h-4" />
            <span>Transfer {formatEther(totalAmount)} ETH</span>
          </>
        )}
      </button>

      {!isSmartWalletActive && (
        <p className="text-xs text-surface-500 mt-2 text-center">
          Activate smart wallet to enable funding
        </p>
      )}
    </div>
  );
}

// USDC contract address on Base Sepolia
const USDC_CONTRACT_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

// ERC-20 ABI for transfer function
const erc20Abi = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;

// Component to fund smart wallet with USDC
function FundSmartWalletUSDC({
  smartWalletAddress,
  isSmartWalletActive
}: {
  smartWalletAddress: string;
  isSmartWalletActive: boolean;
}) {
  const [usdcAmount, setUsdcAmount] = useState<string>("1");
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState("");
  const { data: walletClient } = useWalletClient();
  const { address: eoaAddress } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const queryClient = useQueryClient();

  // Create public client for Base Sepolia
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  // USDC has 6 decimals
  const USDC_DECIMALS = 6;

  const handleFund = async () => {
    if (!walletClient || !eoaAddress || !isSmartWalletActive) {
      setError("Smart wallet must be active to fund it");
      return;
    }

    setIsTransferring(true);
    setError("");

    try {
      // Parse USDC amount (6 decimals)
      const amount = parseUnits(usdcAmount, USDC_DECIMALS);

      if (amount <= 0n) {
        setError("Amount must be greater than 0");
        setIsTransferring(false);
        return;
      }

      console.log(`[FundSmartWalletUSDC] Transferring ${usdcAmount} USDC to smart wallet ${smartWalletAddress}`);

      // Check if we're on the correct chain (Base Sepolia = 84532)
      if (chainId !== baseSepolia.id) {
        console.log(`[FundSmartWalletUSDC] Switching from chain ${chainId} to Base Sepolia (${baseSepolia.id})`);
        try {
          await switchChain({ chainId: baseSepolia.id });
          // Wait a bit for the switch to complete
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (switchError: any) {
          throw new Error(
            `Please switch to Base Sepolia network (Chain ID: ${baseSepolia.id}). ` +
            `Current network: ${chainId}. ${switchError?.message || ""}`
          );
        }
      }

      // Encode the transfer function call
      const transferData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [smartWalletAddress as `0x${string}`, amount],
      });

      // Send transaction to USDC contract on Base Sepolia
      // Ensure we're using Base Sepolia chain
      const txHash = await walletClient.sendTransaction({
        to: USDC_CONTRACT_ADDRESS,
        data: transferData,
        chain: baseSepolia, // Explicitly use Base Sepolia
      });

      console.log(`[FundSmartWalletUSDC] Transfer transaction sent: ${txHash}`);

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      if (receipt.status === "success") {
        console.log(`[FundSmartWalletUSDC] Transfer confirmed. Smart wallet funded with ${usdcAmount} USDC.`);
        // Invalidate balance queries to refresh
        queryClient.invalidateQueries({ queryKey: ["smartWalletUSDCBalance", smartWalletAddress] });
        queryClient.invalidateQueries({ queryKey: ["eoaUSDCBalance", eoaAddress] });
        // Reset form
        setUsdcAmount("1");
        setError("");
      } else {
        throw new Error("Transfer transaction failed");
      }
    } catch (error: any) {
      console.error("[FundSmartWalletUSDC] Error funding smart wallet with USDC:", error);
      setError(error?.message || "Failed to transfer USDC. Please try again.");
    } finally {
      setIsTransferring(false);
    }
  };

  // Get current USDC balance of smart wallet
  const { data: smartWalletUSDCBalance } = useQuery({
    queryKey: ["smartWalletUSDCBalance", smartWalletAddress],
    queryFn: async () => {
      if (!smartWalletAddress) return null;
      try {
        const balance = await publicClient.readContract({
          address: USDC_CONTRACT_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [smartWalletAddress as `0x${string}`],
        });
        return balance as bigint;
      } catch (error) {
        console.error("[FundSmartWalletUSDC] Error fetching smart wallet USDC balance:", error);
        return null;
      }
    },
    enabled: !!smartWalletAddress,
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  // Get current USDC balance of EOA
  const { data: eoaUSDCBalance } = useQuery({
    queryKey: ["eoaUSDCBalance", eoaAddress],
    queryFn: async () => {
      if (!eoaAddress) return null;
      try {
        const balance = await publicClient.readContract({
          address: USDC_CONTRACT_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [eoaAddress as `0x${string}`],
        });
        return balance as bigint;
      } catch (error) {
        console.error("[FundSmartWalletUSDC] Error fetching EOA USDC balance:", error);
        return null;
      }
    },
    enabled: !!eoaAddress,
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  // Validate amount input
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string, numbers, and one decimal point
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setUsdcAmount(value);
      setError("");
    }
  };

  const amountBigInt = usdcAmount && !isNaN(parseFloat(usdcAmount))
    ? parseUnits(usdcAmount, USDC_DECIMALS)
    : 0n;

  return (
    <div className="border-t border-surface-700 pt-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Coins className="w-4 h-4 text-primary-400" />
        <h4 className="text-sm font-semibold text-surface-200">Fund Smart Wallet (USDC)</h4>
      </div>

      <p className="text-xs text-surface-500 mb-3">
        Transfer USDC from your EOA to your smart wallet
      </p>

      {/* Current Balances */}
      <div className="mb-3 space-y-2">
        {eoaUSDCBalance !== undefined && eoaUSDCBalance !== null && (
          <div className="p-2 rounded-lg bg-surface-800/50">
            <p className="text-xs text-surface-500">Your EOA Balance</p>
            <p className="text-sm font-mono text-surface-200">
              {formatUnits(eoaUSDCBalance, USDC_DECIMALS)} USDC
            </p>
          </div>
        )}
        {smartWalletUSDCBalance !== undefined && smartWalletUSDCBalance !== null && (
          <div className="p-2 rounded-lg bg-surface-800/50">
            <p className="text-xs text-surface-500">Smart Wallet Balance</p>
            <p className="text-sm font-mono text-surface-200">
              {formatUnits(smartWalletUSDCBalance, USDC_DECIMALS)} USDC
            </p>
          </div>
        )}
      </div>

      {/* USDC Amount Input */}
      <div className="mb-3">
        <label htmlFor="usdcAmount" className="block text-xs text-surface-500 mb-1">
          USDC Amount
        </label>
        <input
          id="usdcAmount"
          type="text"
          inputMode="decimal"
          value={usdcAmount}
          onChange={handleAmountChange}
          placeholder="1.0"
          disabled={!isSmartWalletActive || isTransferring}
          className="input w-full text-sm"
        />
        <p className="text-xs text-surface-500 mt-1">
          Amount: {usdcAmount || "0"} USDC
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-3 p-2 rounded-lg bg-red-900/20 border border-red-700/50">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Transfer Button */}
      <button
        onClick={handleFund}
        disabled={!isSmartWalletActive || isTransferring || !usdcAmount || parseFloat(usdcAmount) <= 0}
        className={cn(
          "btn w-full",
          isSmartWalletActive ? "btn-primary" : "btn-secondary opacity-50 cursor-not-allowed"
        )}
      >
        {isTransferring ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Transferring...</span>
          </>
        ) : (
          <>
            <ArrowDown className="w-4 h-4" />
            <span>Transfer {usdcAmount || "0"} USDC</span>
          </>
        )}
      </button>

      {!isSmartWalletActive && (
        <p className="text-xs text-surface-500 mt-2 text-center">
          Activate smart wallet to enable funding
        </p>
      )}
    </div>
  );
}

function PaymentEventCard({
  event,
  eoaAddress,
  smartWalletAddress
}: {
  event: PaymentEvent;
  eoaAddress?: string;
  smartWalletAddress?: string | null;
}) {
  const date = new Date(Number(event.timestamp) * 1000);
  const amountInEth = Number(event.amount) / 1e18;

  // Determine which wallet made the payment
  const payerAddress = event.payer.toLowerCase();
  const isFromSmartWallet = smartWalletAddress && payerAddress === smartWalletAddress.toLowerCase();
  const isFromEoa = eoaAddress && payerAddress === eoaAddress.toLowerCase();

  return (
    <div className="card p-6 hover:border-primary-700/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary-900/50 flex items-center justify-center">
              <Coins className="w-5 h-5 text-primary-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-surface-100">Payment Received</p>
                {isFromSmartWallet && (
                  <span className="px-2 py-0.5 rounded text-xs bg-accent-900/30 text-accent-400 border border-accent-700/50">
                    Smart Wallet
                  </span>
                )}
                {isFromEoa && (
                  <span className="px-2 py-0.5 rounded text-xs bg-primary-900/30 text-primary-400 border border-primary-700/50">
                    EOA
                  </span>
                )}
              </div>
              <p className="text-xs text-surface-500">
                {date.toLocaleDateString()} {date.toLocaleTimeString()}
              </p>
            </div>
          </div>

          {/* Amount */}
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-primary-400">
                {amountInEth.toFixed(4)}
              </span>
              <span className="text-surface-400">ETH</span>
            </div>
          </div>

          {/* Text/Address */}
          {event.text && (
            <div className="mb-3">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4 text-surface-500" />
                <span className="text-surface-400">Contract:</span>
                <code className="text-surface-300 font-mono">
                  {event.text.length === 42 && event.text.startsWith("0x")
                    ? shortenAddress(event.text, 8)
                    : event.text}
                </code>
              </div>
            </div>
          )}

          {/* Transaction Info */}
          <div className="flex items-center gap-4 text-xs text-surface-500">
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>Block #{event.blockNumber.toString()}</span>
            </div>
            <a
              href={getBasescanTxUrl("base-sepolia", event.transactionHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary-400 hover:text-primary-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View on Basescan
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
