import { X, Bot, Loader } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getContractExplanation } from "../api/endpoints";
import { shortenAddress } from "../utils/explorers";

interface ExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysisId: string;
  address: string;
}

export default function ExplanationModal({
  isOpen,
  onClose,
  analysisId,
  address,
}: ExplanationModalProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["contractExplanation", analysisId, address],
    queryFn: () => getContractExplanation(analysisId, address),
    enabled: isOpen && !!address,
  });

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-2xl max-h-[80vh] bg-surface-900 border border-surface-700 rounded-xl shadow-2xl z-50 flex flex-col animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700 bg-gradient-to-r from-accent-900/20 to-primary-900/20">
            <div className="flex items-center gap-3">
              <Bot className="w-5 h-5 text-accent-400" />
              <div>
                <Dialog.Title className="font-semibold text-surface-100">
                  AI Contract Explanation
                </Dialog.Title>
                <p className="text-sm text-surface-400 font-mono">
                  {shortenAddress(address, 8)}
                </p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="p-2 rounded text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader className="w-8 h-8 animate-spin text-accent-500 mb-4" />
                <p className="text-surface-400">Generating AI explanation...</p>
                <p className="text-sm text-surface-500 mt-2">
                  This may take a moment
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-surface-400">Failed to generate explanation</p>
                <p className="text-sm text-surface-500 mt-2">
                  Please try again later
                </p>
              </div>
            ) : data?.explanation ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {data.explanation}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-surface-400">No explanation available</p>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

