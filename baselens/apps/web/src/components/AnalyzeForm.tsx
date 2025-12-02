import { useState, useCallback } from "react";
import { Search, ChevronDown } from "lucide-react";
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusAction,
  TransactionStatusLabel,
} from "@coinbase/onchainkit/transaction";
import type { LifecycleStatus } from "@coinbase/onchainkit/transaction";
import { parseEther, encodeFunctionData } from "viem";
import type { Network } from "@baselens/core";
import { cn } from "../utils/cn";

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

  const validateForm = (): boolean => {
    setError("");

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

  const handleValidate = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setIsValidated(true);
    }
  };

  // Encode the pay(text) function call with the contract address being analyzed
  const payData = encodeFunctionData({
    abi: payAbi,
    functionName: "pay",
    args: [address.trim() || "BaseLens Analysis"],
  });

  const calls = [
    {
      to: PAY_CONTRACT_ADDRESS,
      data: payData,
      value: PAY_AMOUNT, // 0.01 ETH
    },
  ];

  const handleOnStatus = useCallback(
    (status: LifecycleStatus) => {
      console.log("Transaction status:", status);
      if (status.statusName === "success") {
        // Transaction confirmed, now call the backend
        const trimmedAddress = address.trim();
        onAnalyze(trimmedAddress, network);
        setIsValidated(false); // Reset for next analysis
      }
    },
    [address, network, onAnalyze]
  );

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
            className="btn btn-primary w-full btn-lg group"
          >
            <span>Start Analysis</span>
            <Search className="w-5 h-5 transition-transform group-hover:scale-110" />
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-surface-400 text-center">
              Confirm transaction to start analysis
            </p>
            <Transaction
              chainId={84532} // Base Sepolia chain ID
              calls={calls}
              onStatus={handleOnStatus}
            >
              <TransactionButton className="btn btn-primary w-full btn-lg" />
              <TransactionStatus>
                <TransactionStatusLabel />
                <TransactionStatusAction />
              </TransactionStatus>
            </Transaction>
          </div>
        )}
      </div>

      {/* Hint */}
      <p className="mt-4 text-center text-sm text-surface-500">
        Enter any contract address on Base to analyze its structure and relationships
      </p>
    </form>
  );
}

