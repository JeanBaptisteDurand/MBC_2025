import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Zap, Shield, GitBranch, LogIn } from "lucide-react";
import { useAccount } from "wagmi";
import AnalyzeForm from "../components/AnalyzeForm";
import ProgressBar from "../components/ProgressBar";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../contexts/AuthContext";
import { startAnalysis, getAnalysisStatus } from "../api/endpoints";
import type { Network } from "@baselens/core";

export default function Home() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  const { isAuthenticated, login, isLoading: authLoading } = useAuth();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  const handleAnalyze = async (address: string, network: Network) => {
    // Check authentication
    if (!isAuthenticated) {
      toast({
        title: "Authentication required",
        description: "Please sign in to start an analysis",
        variant: "error",
      });
      try {
        await login();
      } catch (error) {
        console.error("Login failed:", error);
      }
      return;
    }

    setIsAnalyzing(true);
    setProgress(0);
    setStatusMessage("Starting analysis...");

    try {
      // Start analysis
      const { jobId } = await startAnalysis({
        address,
        network,
        maxDepth: 2,
      });

      // Poll for status
      const pollInterval = setInterval(async () => {
        try {
          const status = await getAnalysisStatus(jobId);

          setProgress(status.progress);
          setStatusMessage(getStatusMessage(status.status, status.progress));

          if (status.status === "done" && status.analysisId) {
            clearInterval(pollInterval);
            setIsAnalyzing(false);
            toast({
              title: "Analysis complete",
              description: "Redirecting to graph view...",
              variant: "success",
            });
            navigate(`/graph/${status.analysisId}`);
          } else if (status.status === "error") {
            clearInterval(pollInterval);
            setIsAnalyzing(false);
            toast({
              title: "Analysis failed",
              description: status.error || "An error occurred",
              variant: "error",
            });
          }
        } catch (error) {
          clearInterval(pollInterval);
          setIsAnalyzing(false);
          toast({
            title: "Error",
            description: "Failed to check analysis status",
            variant: "error",
          });
        }
      }, 1000);

      // Cleanup on unmount
      return () => clearInterval(pollInterval);
    } catch (error) {
      setIsAnalyzing(false);
      toast({
        title: "Failed to start analysis",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "error",
      });
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary-950/50 via-transparent to-transparent" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-accent-500/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-5xl md:text-6xl font-display font-bold mb-6">
              <span className="gradient-text">Analyze</span> Smart Contracts
              <br />
              on <span className="text-primary-400">Base</span>
            </h1>
            <p className="text-xl text-surface-400 mb-12">
              Explore contract relationships, proxy patterns, and source code.
              AI-powered insights for EVM smart contracts on Base L2.
            </p>

            {/* Analyze Form */}
            <div className="max-w-xl mx-auto">
              {isAnalyzing ? (
                <div className="card p-8 animate-fade-in">
                  <ProgressBar
                    progress={progress}
                    message={statusMessage}
                  />
                </div>
              ) : !isConnected ? (
                <div className="card p-8 text-center">
                  <p className="text-surface-400 mb-4">Connect your wallet to get started</p>
                </div>
              ) : !isAuthenticated && !authLoading ? (
                <div className="card p-8 text-center">
                  <LogIn className="w-12 h-12 text-primary-400 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold mb-2">Sign In Required</h2>
                  <p className="text-surface-400 mb-6">
                    Please sign in with your wallet to start analyzing contracts
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        await login();
                      } catch (error) {
                        toast({
                          title: "Login failed",
                          description: error instanceof Error ? error.message : "Please try again",
                          variant: "error",
                        });
                      }
                    }}
                    className="btn btn-primary"
                  >
                    Sign In
                  </button>
                </div>
              ) : authLoading ? (
                <div className="card p-8 text-center">
                  <p className="text-surface-400">Loading...</p>
                </div>
              ) : (
                <AnalyzeForm onAnalyze={handleAnalyze} />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 border-t border-surface-800">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<GitBranch className="w-8 h-8" />}
              title="Contract Graph"
              description="Visualize proxy patterns, inheritance, and runtime relationships in an interactive graph."
            />
            <FeatureCard
              icon={<Search className="w-8 h-8" />}
              title="Source Analysis"
              description="View verified source code or AI-decompiled bytecode with syntax highlighting."
            />
            <FeatureCard
              icon={<Shield className="w-8 h-8" />}
              title="AI Insights"
              description="Get security notes, contract explanations, and ask questions about the code."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="card p-6 group hover:border-primary-700/50 transition-colors">
      <div className="w-14 h-14 rounded-xl bg-primary-900/50 flex items-center justify-center text-primary-400 mb-4 group-hover:bg-primary-900 transition-colors">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-surface-400">{description}</p>
    </div>
  );
}

function getStatusMessage(status: string, progress: number): string {
  switch (status) {
    case "queued":
      return "Waiting in queue...";
    case "running":
      if (progress < 20) return "Starting analysis...";
      if (progress < 40) return "Analyzing on-chain data...";
      if (progress < 60) return "Fetching source code...";
      if (progress < 80) return "Building contract graph...";
      if (progress < 95) return "Generating AI insights...";
      return "Finalizing...";
    case "done":
      return "Analysis complete!";
    case "error":
      return "Analysis failed";
    default:
      return "Processing...";
  }
}
