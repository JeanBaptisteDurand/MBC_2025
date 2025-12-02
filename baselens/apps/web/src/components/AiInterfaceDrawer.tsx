import { X, Loader, FileText, Shield, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import * as Tabs from "@radix-ui/react-tabs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getAnalysisSummary } from "../api/endpoints";
import { cn } from "../utils/cn";

interface AiInterfaceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  analysisId: string;
}

export default function AiInterfaceDrawer({
  isOpen,
  onClose,
  analysisId,
}: AiInterfaceDrawerProps) {
  const { data: summary, isLoading, error } = useQuery({
    queryKey: ["analysisSummary", analysisId],
    queryFn: () => getAnalysisSummary(analysisId),
    enabled: isOpen && !!analysisId,
  });

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 right-0 bottom-0 w-[480px] bg-surface-900/95 backdrop-blur-sm border-l border-surface-700 shadow-2xl z-30 animate-slide-in overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 bg-gradient-to-r from-accent-900/20 to-primary-900/20">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent-400" />
          <h3 className="font-semibold text-surface-100">AI Analysis</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader className="w-8 h-8 animate-spin text-accent-500 mx-auto mb-4" />
            <p className="text-surface-400">Generating AI analysis...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-surface-400">Failed to load AI analysis</p>
            <p className="text-sm text-surface-500 mt-2">
              The analysis may still be processing
            </p>
          </div>
        </div>
      ) : summary ? (
        <Tabs.Root defaultValue="summary" className="flex-1 flex flex-col overflow-hidden">
          <Tabs.List className="flex border-b border-surface-700 px-4">
            <Tabs.Trigger
              value="summary"
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                "data-[state=active]:border-accent-500 data-[state=active]:text-accent-400",
                "data-[state=inactive]:border-transparent data-[state=inactive]:text-surface-400 data-[state=inactive]:hover:text-surface-200"
              )}
            >
              <FileText className="w-4 h-4" />
              Summary
            </Tabs.Trigger>
            <Tabs.Trigger
              value="security"
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                "data-[state=active]:border-accent-500 data-[state=active]:text-accent-400",
                "data-[state=inactive]:border-transparent data-[state=inactive]:text-surface-400 data-[state=inactive]:hover:text-surface-200"
              )}
            >
              <Shield className="w-4 h-4" />
              Security
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="summary" className="flex-1 overflow-y-auto p-4">
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {summary.summary}
              </ReactMarkdown>
            </div>
          </Tabs.Content>

          <Tabs.Content value="security" className="flex-1 overflow-y-auto p-4">
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {summary.securityNotes}
              </ReactMarkdown>
            </div>
          </Tabs.Content>
        </Tabs.Root>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-surface-400">No analysis available</p>
        </div>
      )}

      {/* Ultra Summary Footer */}
      {summary?.ultraSummary && (
        <div className="px-4 py-3 border-t border-surface-700 bg-surface-800/50">
          <p className="text-xs text-surface-500 uppercase mb-1">Quick Summary</p>
          <p className="text-sm text-surface-300">{summary.ultraSummary}</p>
        </div>
      )}
    </div>
  );
}

