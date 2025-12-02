import { useState } from "react";
import { Search, ChevronDown } from "lucide-react";
import type { Network } from "@baselens/core";
import { cn } from "../utils/cn";

interface AnalyzeFormProps {
  onAnalyze: (address: string, network: Network) => void;
}

export default function AnalyzeForm({ onAnalyze }: AnalyzeFormProps) {
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState<Network>("base-mainnet");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate address
    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      setError("Please enter a contract address");
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmedAddress)) {
      setError("Invalid Ethereum address format");
      return;
    }

    onAnalyze(trimmedAddress, network);
  };

  return (
    <form onSubmit={handleSubmit} className="card p-6 animate-fade-in">
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
              onChange={(e) => setAddress(e.target.value)}
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

        {/* Submit Button */}
        <button
          type="submit"
          className="btn btn-primary w-full btn-lg group"
        >
          <span>Start Analysis</span>
          <Search className="w-5 h-5 transition-transform group-hover:scale-110" />
        </button>
      </div>

      {/* Hint */}
      <p className="mt-4 text-center text-sm text-surface-500">
        Enter any contract address on Base to analyze its structure and relationships
      </p>
    </form>
  );
}

