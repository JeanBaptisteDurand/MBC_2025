import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { ExternalLink, Clock, CheckCircle, XCircle, Loader, LogIn } from "lucide-react";
import { getAnalysisHistory } from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import { shortenAddress, getBasescanAddressUrl } from "../utils/explorers";
import { cn } from "../utils/cn";
import type { AnalysisHistoryItem, Network } from "@baselens/core";

export default function History() {
  const { address, isConnected } = useAccount();
  const { isAuthenticated, login, isLoading: authLoading } = useAuth();

  const { data: history, isLoading, error } = useQuery({
    queryKey: ["analysisHistory"],
    queryFn: getAnalysisHistory,
    enabled: isAuthenticated, // Only fetch when authenticated
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-display font-bold mb-2">
          Analysis History
        </h1>
        <p className="text-surface-400 mb-8">
          View all previous contract analyses
        </p>

        {!isConnected ? (
          <div className="card p-12 text-center">
            <XCircle className="w-12 h-12 text-surface-500 mx-auto mb-4" />
            <p className="text-surface-400 mb-4">Connect your wallet to view history</p>
          </div>
        ) : !isAuthenticated && !authLoading ? (
          <div className="card p-12 text-center">
            <LogIn className="w-12 h-12 text-primary-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Sign In Required</h2>
            <p className="text-surface-400 mb-6">
              Please sign in with your wallet to view your analysis history
            </p>
            <button
              onClick={async () => {
                try {
                  await login();
                } catch (error) {
                  console.error("Login failed:", error);
                }
              }}
              className="btn btn-primary"
            >
              Sign In
            </button>
          </div>
        ) : isLoading || authLoading ? (
          <div className="card p-12 flex items-center justify-center">
            <Loader className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : error ? (
          <div className="card p-12 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-surface-400">Failed to load history</p>
            {error instanceof Error && error.message.includes("401") && (
              <button
                onClick={async () => {
                  try {
                    await login();
                  } catch (err) {
                    console.error("Login failed:", err);
                  }
                }}
                className="btn btn-primary mt-4"
              >
                Sign In
              </button>
            )}
          </div>
        ) : history && history.length > 0 ? (
          <div className="space-y-4">
            {history.map((item) => (
              <HistoryItem key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="card p-12 text-center">
            <Clock className="w-12 h-12 text-surface-600 mx-auto mb-4" />
            <p className="text-surface-400">No analyses yet</p>
            <Link to="/" className="btn btn-primary mt-4">
              Start your first analysis
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryItem({ item }: { item: AnalysisHistoryItem }) {
  const statusConfig = getStatusConfig(item.status);
  const formattedDate = new Date(item.createdAt).toLocaleString();

  return (
    <div className="card p-6 hover:border-surface-700 transition-colors animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <code className="text-lg font-semibold text-surface-100">
              {shortenAddress(item.rootAddress, 8)}
            </code>
            <a
              href={getBasescanAddressUrl(item.network as Network, item.rootAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-surface-500 hover:text-primary-400 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <span
              className={cn(
                "badge",
                item.network === "base-mainnet" ? "badge-primary" : "badge-accent"
              )}
            >
              {item.network === "base-mainnet" ? "Mainnet" : "Sepolia"}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-surface-500">
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {formattedDate}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium",
              statusConfig.className
            )}
          >
            {statusConfig.icon}
            {statusConfig.label}
          </span>

          {item.status === "done" ? (
            <Link
              to={`/graph/${item.id}`}
              className="btn btn-primary btn-sm"
            >
              View Graph
            </Link>
          ) : item.status === "running" ? (
            <span className="btn btn-secondary btn-sm cursor-not-allowed opacity-50">
              In Progress
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getStatusConfig(status: string) {
  switch (status) {
    case "done":
      return {
        label: "Complete",
        icon: <CheckCircle className="w-4 h-4" />,
        className: "bg-emerald-900/50 text-emerald-400",
      };
    case "running":
      return {
        label: "Running",
        icon: <Loader className="w-4 h-4 animate-spin" />,
        className: "bg-primary-900/50 text-primary-400",
      };
    case "queued":
      return {
        label: "Queued",
        icon: <Clock className="w-4 h-4" />,
        className: "bg-amber-900/50 text-amber-400",
      };
    case "error":
      return {
        label: "Failed",
        icon: <XCircle className="w-4 h-4" />,
        className: "bg-red-900/50 text-red-400",
      };
    default:
      return {
        label: status,
        icon: null,
        className: "bg-surface-800 text-surface-400",
      };
  }
}

