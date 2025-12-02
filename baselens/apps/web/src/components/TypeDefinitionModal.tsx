import { X, Copy, Download, Code2, CheckCircle, AlertTriangle, Puzzle, Book, Box } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { getTypeDefinition } from "../api/endpoints";
import { copyToClipboard } from "../utils/explorers";
import { useToast } from "./ui/Toast";
import { cn } from "../utils/cn";

interface TypeDefinitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysisId: string;
  address: string;
  typeName: string;
  typeKind: string;
}

export default function TypeDefinitionModal({
  isOpen,
  onClose,
  analysisId,
  address,
  typeName,
  typeKind,
}: TypeDefinitionModalProps) {
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["typeDefinition", analysisId, address, typeName],
    queryFn: () => getTypeDefinition(analysisId, address, typeName),
    enabled: isOpen && !!address && !!typeName,
  });

  const handleCopy = async () => {
    if (data?.code) {
      await copyToClipboard(data.code);
      toast({ title: "Copied to clipboard", variant: "success" });
    }
  };

  const handleDownload = () => {
    if (data?.code) {
      const blob = new Blob([data.code], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${typeName}.sol`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Get type info for display
  const getTypeInfo = () => {
    switch (typeKind) {
      case "INTERFACE":
        return {
          icon: <Puzzle className="w-5 h-5" />,
          label: "Interface",
          color: "cyan",
        };
      case "LIBRARY":
        return {
          icon: <Book className="w-5 h-5" />,
          label: "Library",
          color: "teal",
        };
      case "ABSTRACT_CONTRACT":
        return {
          icon: <Box className="w-5 h-5" />,
          label: "Abstract Contract",
          color: "violet",
        };
      case "CONTRACT_IMPL":
        return {
          icon: <Code2 className="w-5 h-5" />,
          label: "Deployable Contract",
          color: "pink",
        };
      default:
        return {
          icon: <Code2 className="w-5 h-5" />,
          label: "Type Definition",
          color: "surface",
        };
    }
  };

  const typeInfo = getTypeInfo();

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-4xl h-[80vh] bg-surface-900 border border-surface-700 rounded-xl shadow-2xl z-50 flex flex-col animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center",
                typeInfo.color === "cyan" && "bg-gradient-to-br from-cyan-600 to-cyan-700 text-white",
                typeInfo.color === "teal" && "bg-gradient-to-br from-teal-600 to-teal-700 text-white",
                typeInfo.color === "violet" && "bg-gradient-to-br from-violet-600 to-violet-700 text-white",
                typeInfo.color === "pink" && "bg-gradient-to-br from-pink-600 to-pink-700 text-white",
                typeInfo.color === "surface" && "bg-surface-700 text-surface-300"
              )}>
                {typeInfo.icon}
              </div>
              <div>
                <Dialog.Title className="font-semibold text-surface-100">
                  {typeName}
                </Dialog.Title>
                <p className="text-xs text-surface-500">{typeInfo.label}</p>
              </div>
              {data && (
                <span
                  className={cn(
                    "badge flex items-center gap-1 ml-2",
                    data.sourceType === "verified"
                      ? "badge-success"
                      : "badge-warning"
                  )}
                >
                  {data.sourceType === "verified" ? (
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
              {data?.extracted && (
                <span className="badge bg-emerald-900/50 text-emerald-400 border-emerald-700/50 ml-1">
                  Extracted
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="btn btn-ghost btn-sm"
                disabled={!data?.code}
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
              <button
                onClick={handleDownload}
                className="btn btn-ghost btn-sm"
                disabled={!data?.code}
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

          {/* Source File Info */}
          {data?.sourceFile && (
            <div className="px-6 py-2 bg-surface-800/50 border-b border-surface-700">
              <p className="text-xs text-surface-500">
                From: <span className="font-mono text-surface-400">{data.sourceFile}</span>
              </p>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
              </div>
            ) : error ? (
              <div className="h-full flex items-center justify-center text-surface-400">
                Failed to load type definition
              </div>
            ) : data?.code ? (
              <div className="h-full overflow-auto">
                <pre className="p-6 overflow-x-auto">
                  <code className="text-sm font-mono text-surface-200 whitespace-pre">
                    {data.code}
                  </code>
                </pre>
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
