import { useState, useCallback, useEffect } from "react";
import { Search, ChevronDown, Loader2 } from "lucide-react";
import { parseEther, encodeFunctionData, createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { useAccount, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { Network } from "@baselens/core";
import { cn } from "../utils/cn";
import { useSmartWallet } from "../providers/SmartWalletProvider";

const PAY_CONTRACT_ADDRESS = "0x3A7F370D0C105Afc23800253504656ae99857bde" as const;
const PAY_AMOUNT = parseEther("0.0001"); // 0.0001 ETH

// ABI for the pay function
const payAbi = [
  {
    type: "function",
    name: "pay",
    inputs: [
      {
        name: "text",
        type: "string",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

interface AnalyzeFormProps {
  onAnalyze: (address: string, network: Network) => void;
}

export default function AnalyzeForm({ onAnalyze }: AnalyzeFormProps) {
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState<Network>("base-mainnet");
  const [error, setError] = useState("");
  const [isValidated, setIsValidated] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isCheckingContract, setIsCheckingContract] = useState(false);
  const { isSmartWalletActive, sendSmartWalletPayment } = useSmartWallet();
  const { isConnected, address: walletAddress } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  // Use wagmi's useWriteContract for EOA transactions
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const validateForm = (): boolean => {
    setError("");

    if (!isConnected) {
      setError("Please connect your wallet first");
      return false;
    }

    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      setError("Please enter a contract address");
      return false;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmedAddress)) {
      setError("Invalid Ethereum address format");
      return false;
    }

    return true;
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAddress(e.target.value);
    setIsValidated(false);
    setError("");
  };

  // Check if address has bytecode (is a contract)
  const checkContractBytecode = useCallback(async (address: string, network: Network): Promise<boolean> => {
    try {
      // Select chain based on network
      const chain = network === "base-mainnet" ? base : baseSepolia;

      // Create public client for the selected network
      const publicClient = createPublicClient({
        chain,
        transport: http(),
      });

      // Get bytecode at address
      const bytecode = await publicClient.getBytecode({
        address: address as `0x${string}`,
      });

      // If bytecode exists and is not empty (not just "0x"), it's a contract
      return bytecode !== undefined && bytecode !== "0x" && bytecode.length > 2;
    } catch (error) {
      console.error("[AnalyzeForm] Error checking bytecode:", error);
      // If we can't check, assume it's valid (let backend handle it)
      return true;
    }
  }, []);

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation first
    if (!validateForm()) {
      return;
    }

    const trimmedAddress = address.trim();

    // Check if address is a contract
    setIsCheckingContract(true);
    setError("");

    try {
      const hasBytecode = await checkContractBytecode(trimmedAddress, network);

      if (!hasBytecode) {
        const networkName = network === "base-mainnet" ? "Base Mainnet" : "Base Sepolia";
        setError(`This address is not a contract on ${networkName}`);
        setIsValidated(false);
        return;
      }

      // Address is a contract, proceed with validation
      setIsValidated(true);
    } catch (error: any) {
      console.error("[AnalyzeForm] Error validating contract:", error);
      setError(error?.message || "Failed to verify contract address. Please try again.");
      setIsValidated(false);
    } finally {
      setIsCheckingContract(false);
    }
  };

  // Handle EOA wallet payment
  const handleEOAPayment = useCallback(() => {
    if (!isConnected || chainId !== baseSepolia.id) {
      setError("Please connect your wallet and switch to Base Sepolia");
      return;
    }

    setError(""); // Clear any previous errors

    const trimmedAddress = address.trim();

    // Use writeContract for the payable function call
    writeContract({
      address: PAY_CONTRACT_ADDRESS,
      abi: payAbi,
      functionName: "pay",
      args: [trimmedAddress || "BaseLens Analysis"],
      value: PAY_AMOUNT,
      chainId: baseSepolia.id,
    });
  }, [isConnected, chainId, address, writeContract]);

  // Handle successful transaction
  useEffect(() => {
    if (isSuccess && hash) {
      // Transaction confirmed, now call the backend
      const trimmedAddress = address.trim();
      onAnalyze(trimmedAddress, network);
      setIsValidated(false); // Reset for next analysis
    }
  }, [isSuccess, hash, address, network, onAnalyze]);

  const handleSmartWalletPayment = useCallback(async () => {
    if (!isSmartWalletActive) {
      return;
    }

    setIsProcessingPayment(true);
    setError(""); // Clear any previous errors
    try {
      const trimmedAddress = address.trim();
      const payData = encodeFunctionData({
        abi: payAbi,
        functionName: "pay",
        args: [trimmedAddress || "BaseLens Analysis"],
      });

      const calls = [
        {
          to: PAY_CONTRACT_ADDRESS,
          data: payData,
          value: PAY_AMOUNT,
        },
      ];

      // sendSmartWalletPayment will:
      // 1. Check if smart wallet has sufficient funds (throws error if not)
      // 2. Send the payment transaction (gas sponsored by paymaster)
      // Note: User must fund smart wallet separately from Profile page
      await sendSmartWalletPayment(calls);

      // Payment successful, now call the backend
      onAnalyze(trimmedAddress, network);
      setIsValidated(false); // Reset for next analysis
    } catch (error: any) {
      console.error("Smart wallet payment failed:", error);
      // Provide user-friendly error message
      const errorMessage = error?.message || "Payment failed. Please try again.";
      setError(errorMessage);
      setIsValidated(false);
    } finally {
      setIsProcessingPayment(false);
    }
  }, [isSmartWalletActive, address, network, onAnalyze, sendSmartWalletPayment]);

  return (
    <form onSubmit={handleValidate} className="card p-6 animate-fade-in">
      <div className="space-y-4">
        {/* Address Input */}
        <div>
          <label htmlFor="address" className="block text-sm font-medium text-surface-300 mb-2">
            Contract Address
          </label>
          <div className="relative">
            <input
              id="address"
              type="text"
              value={address}
              onChange={handleAddressChange}
              placeholder="0x..."
              className={cn(
                "input font-mono pr-12",
                error && "border-red-500 focus:ring-red-500"
              )}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500">
              <Search className="w-5 h-5" />
            </div>
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-400">{error}</p>
          )}
        </div>

        {/* Network Select */}
        <div>
          <label htmlFor="network" className="block text-sm font-medium text-surface-300 mb-2">
            Network
          </label>
          <div className="relative">
            <select
              id="network"
              value={network}
              onChange={(e) => setNetwork(e.target.value as Network)}
              className="input appearance-none pr-10"
            >
              <option value="base-mainnet">Base Mainnet</option>
              <option value="base-sepolia">Base Sepolia</option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-surface-500">
              <ChevronDown className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Submit Button or Transaction */}
        {!isValidated ? (
          <button
            type="submit"
            disabled={!isConnected || isCheckingContract}
            className={cn(
              "btn btn-primary w-full btn-lg group",
              (!isConnected || isCheckingContract) && "opacity-50 cursor-not-allowed"
            )}
          >
            {isCheckingContract ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Checking contract...</span>
              </>
            ) : (
              <>
                <span>{isConnected ? "Start Analysis" : "Connect Wallet to Start"}</span>
                <Search className="w-5 h-5 transition-transform group-hover:scale-110" />
              </>
            )}
          </button>
        ) : isSmartWalletActive ? (
          <div className="space-y-2">
            <p className="text-sm text-surface-400 text-center">
              {isProcessingPayment
                ? "Processing payment with smart wallet..."
                : "Click to pay with smart wallet (gas sponsored)"}
            </p>
            <button
              onClick={handleSmartWalletPayment}
              disabled={isProcessingPayment}
              className="btn btn-primary w-full btn-lg"
            >
              {isProcessingPayment ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                "Pay with Smart Wallet"
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {chainId !== baseSepolia.id ? (
              <div className="space-y-2">
                <p className="text-sm text-surface-400 text-center">
                  Please switch to Base Sepolia to proceed
                </p>
                <button
                  onClick={async () => {
                    try {
                      await switchChain({ chainId: baseSepolia.id });
                    } catch (error: any) {
                      setError(error?.message || "Failed to switch chain. Please switch to Base Sepolia manually.");
                    }
                  }}
                  className="btn btn-primary w-full btn-lg"
                >
                  Switch to Base Sepolia
                </button>
                {error && (
                  <p className="text-sm text-red-400 text-center">{error}</p>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm text-surface-400 text-center">
                  {isPending || isConfirming
                    ? "Processing transaction..."
                    : "Confirm transaction to start analysis"}
                </p>
                <button
                  onClick={handleEOAPayment}
                  disabled={isPending || isConfirming || !isConnected}
                  className="btn btn-primary w-full btn-lg"
                >
                  {isPending || isConfirming ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{isPending ? "Confirming..." : "Processing..."}</span>
                    </>
                  ) : (
                    "Pay & Start Analysis"
                  )}
                </button>
                {(error || writeError) && (
                  <p className="text-sm text-red-400 text-center">
                    {error || writeError?.message || "Transaction failed. Please try again."}
                  </p>
                )}
                {isSuccess && (
                  <p className="text-sm text-green-400 text-center">
                    Transaction confirmed! Starting analysis...
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Hint */}
      <p className="mt-4 text-center text-sm text-surface-500">
        {isConnected
          ? "Enter any contract address on Base to analyze its structure and relationships"
          : "Please connect your wallet to start an analysis"}
      </p>
    </form>
  );
}

