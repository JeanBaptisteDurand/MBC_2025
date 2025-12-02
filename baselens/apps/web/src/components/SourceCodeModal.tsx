import { X, Copy, Download, FileCode, CheckCircle, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { getSourceCode } from "../api/endpoints";
import { copyToClipboard } from "../utils/explorers";
import { useToast } from "./ui/Toast";
import { cn } from "../utils/cn";

interface SourceCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysisId: string;
  address: string;
  filePath?: string; // If provided, only show this specific file
}

export default function SourceCodeModal({
  isOpen,
  onClose,
  analysisId,
  address,
  filePath,
}: SourceCodeModalProps) {
  const { toast } = useToast();

  const { data: sourceData, isLoading, error } = useQuery({
    queryKey: ["sourceCode", analysisId, address],
    queryFn: () => getSourceCode(analysisId, address),
    enabled: isOpen && !!address,
  });

  // Filter files if a specific file path is provided
  const displayFiles = filePath && sourceData?.files
    ? sourceData.files.filter((f) => f.path === filePath)
    : sourceData?.files;

  const handleCopy = async () => {
    if (displayFiles?.[0]?.content) {
      await copyToClipboard(displayFiles[0].content);
      toast({ title: "Copied to clipboard", variant: "success" });
    }
  };

  const handleDownload = () => {
    if (displayFiles?.[0]) {
      const blob = new Blob([displayFiles[0].content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = displayFiles[0].path;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-4xl h-[80vh] bg-surface-900 border border-surface-700 rounded-xl shadow-2xl z-50 flex flex-col animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
            <div className="flex items-center gap-3">
              <FileCode className="w-5 h-5 text-primary-400" />
              <Dialog.Title className="font-semibold text-surface-100">
                {filePath ? filePath.split("/").pop() : "Source Code"}
              </Dialog.Title>
              {displayFiles?.[0] && (
                <span
                  className={cn(
                    "badge flex items-center gap-1",
                    displayFiles[0].sourceType === "verified"
                      ? "badge-success"
                      : "badge-warning"
                  )}
                >
                  {displayFiles[0].sourceType === "verified" ? (
                    <>
                      <CheckCircle className="w-3 h-3" />
                      Verified
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3 h-3" />
                      Decompiled
                    </>
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="btn btn-ghost btn-sm"
                disabled={!displayFiles?.length}
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
              <button
                onClick={handleDownload}
                className="btn btn-ghost btn-sm"
                disabled={!displayFiles?.length}
              >
                <Download className="w-4 h-4" />
                Download
              </button>
              <Dialog.Close asChild>
                <button className="p-2 rounded text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
              </div>
            ) : error ? (
              <div className="h-full flex items-center justify-center text-surface-400">
                Failed to load source code
              </div>
            ) : displayFiles?.length ? (
              <div className="h-full overflow-auto">
                {displayFiles.map((file, index) => (
                  <div key={index} className="border-b border-surface-800 last:border-0">
                    {/* File Header - only show if multiple files */}
                    {displayFiles.length > 1 && (
                      <div className="sticky top-0 px-6 py-2 bg-surface-800/90 backdrop-blur-sm border-b border-surface-700">
                        <div className="flex items-center gap-2">
                          <FileCode className="w-4 h-4 text-surface-400" />
                          <span className="text-sm font-mono text-surface-300">
                            {file.path}
                          </span>
                          <span
                            className={cn(
                              "badge text-xs",
                              file.sourceType === "verified"
                                ? "badge-success"
                                : "badge-warning"
                            )}
                          >
                            {file.sourceType}
                          </span>
                        </div>
                      </div>
                    )}
                    {/* Code */}
                    <pre className="p-6 overflow-x-auto">
                      <code className="text-sm font-mono text-surface-200 whitespace-pre">
                        {file.content}
                      </code>
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-surface-400">
                No source code available
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

