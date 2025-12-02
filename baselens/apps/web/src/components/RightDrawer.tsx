import { X, ExternalLink, Copy, Code, Bot, Layers, Factory, Shield, FileText } from "lucide-react";
import type { Node, ContractNode, SourceFileNode, TypeDefNode } from "@baselens/core";
import { useQuery } from "@tanstack/react-query";
import { cn } from "../utils/cn";
import { shortenAddress, getBasescanAddressUrl, getBasescanTxUrl, copyToClipboard } from "../utils/explorers";
import { getContractAbi } from "../api/endpoints";
import { useToast } from "./ui/Toast";

interface RightDrawerProps {
  node: Node | null;
  analysisId: string;
  onClose: () => void;
  onViewSource: (address: string) => void;
  onViewExplanation: (address: string) => void;
}

export default function RightDrawer({
  node,
  analysisId,
  onClose,
  onViewSource,
  onViewExplanation,
}: RightDrawerProps) {
  const { toast } = useToast();

  if (!node) return null;

  const handleCopy = async (text: string) => {
    await copyToClipboard(text);
    toast({ title: "Copied to clipboard", variant: "success" });
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 w-96 bg-surface-900/95 backdrop-blur-sm border-l border-surface-700 shadow-2xl z-20 animate-slide-in overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700">
        <h3 className="font-semibold text-surface-100">Node Details</h3>
        <button
          onClick={onClose}
          className="p-1 rounded text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {node.kind === "contract" && (
          <ContractDetails
            node={node}
            analysisId={analysisId}
            onCopy={handleCopy}
            onViewSource={onViewSource}
            onViewExplanation={onViewExplanation}
          />
        )}
        {node.kind === "sourceFile" && (
          <SourceFileDetails
            node={node}
            onViewSource={onViewSource}
          />
        )}
        {node.kind === "typeDef" && (
          <TypeDefDetails node={node} />
        )}
      </div>
    </div>
  );
}

function ContractDetails({
  node,
  analysisId,
  onCopy,
  onViewSource,
  onViewExplanation,
}: {
  node: ContractNode;
  analysisId: string;
  onCopy: (text: string) => void;
  onViewSource: (address: string) => void;
  onViewExplanation: (address: string) => void;
}) {
  const { data: abiData } = useQuery({
    queryKey: ["contractAbi", analysisId, node.address],
    queryFn: () => getContractAbi(analysisId, node.address),
    enabled: !!node.address,
  });

  const abi = abiData?.abi as Array<{ type: string; name?: string; stateMutability?: string; inputs?: Array<{ name: string; type: string }>; outputs?: Array<{ type: string }> }> || [];
  const functions = abi.filter((item) => item.type === "function");
  const events = abi.filter((item) => item.type === "event");

  return (
    <div className="space-y-6">
      {/* Address */}
      <div>
        <label className="text-xs font-semibold text-surface-500 uppercase">Address</label>
        <div className="flex items-center gap-2 mt-1">
          <code className="text-sm font-mono text-surface-100 flex-1">
            {shortenAddress(node.address, 10)}
          </code>
          <button
            onClick={() => onCopy(node.address)}
            className="p-1 rounded text-surface-400 hover:text-surface-100 hover:bg-surface-800"
          >
            <Copy className="w-4 h-4" />
          </button>
          <a
            href={getBasescanAddressUrl("base-mainnet", node.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded text-surface-400 hover:text-primary-400 hover:bg-surface-800"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Name */}
      {node.name && (
        <div>
          <label className="text-xs font-semibold text-surface-500 uppercase">Name</label>
          <p className="text-surface-100 mt-1">{node.name}</p>
        </div>
      )}

      {/* Badges */}
      <div>
        <label className="text-xs font-semibold text-surface-500 uppercase">Type & Status</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {node.isRoot && (
            <span className="badge bg-orange-900/50 text-orange-400 border-orange-700/50 flex items-center gap-1">
              <Layers className="w-3 h-3" />
              Root Contract
            </span>
          )}
          {node.kindOnChain === "PROXY" && (
            <span className="badge bg-purple-900/50 text-purple-400 border-purple-700/50">Proxy</span>
          )}
          {node.kindOnChain === "IMPLEMENTATION" && (
            <span className="badge bg-blue-900/50 text-blue-400 border-blue-700/50 flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Implementation
            </span>
          )}
          {node.isFactory && (
            <span className="badge bg-green-900/50 text-green-400 border-green-700/50 flex items-center gap-1">
              <Factory className="w-3 h-3" />
              Factory
            </span>
          )}
          {node.verified && (
            <span className="badge badge-success">Verified</span>
          )}
          {node.sourceType === "decompiled" && (
            <span className="badge badge-warning">Decompiled</span>
          )}
        </div>
      </div>

      {/* Creator */}
      {node.creatorAddress && (
        <div>
          <label className="text-xs font-semibold text-surface-500 uppercase">Creator</label>
          <div className="flex items-center gap-2 mt-1">
            <code className="text-sm font-mono text-surface-300">
              {shortenAddress(node.creatorAddress)}
            </code>
            <a
              href={getBasescanAddressUrl("base-mainnet", node.creatorAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-400 hover:underline text-sm"
            >
              View
            </a>
          </div>
        </div>
      )}

      {/* Creation Tx */}
      {node.creationTxHash && (
        <div>
          <label className="text-xs font-semibold text-surface-500 uppercase">Creation Tx</label>
          <a
            href={getBasescanTxUrl("base-mainnet", node.creationTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-400 hover:underline text-sm flex items-center gap-1 mt-1"
          >
            View on Basescan
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* ABI Summary */}
      {abi.length > 0 && (
        <div>
          <label className="text-xs font-semibold text-surface-500 uppercase">ABI Summary</label>
          <div className="flex gap-4 mt-2 text-sm">
            <span className="text-surface-400">
              <span className="text-surface-100 font-semibold">{functions.length}</span> functions
            </span>
            <span className="text-surface-400">
              <span className="text-surface-100 font-semibold">{events.length}</span> events
            </span>
          </div>
        </div>
      )}

      {/* Functions List */}
      {functions.length > 0 && (
        <div>
          <label className="text-xs font-semibold text-surface-500 uppercase">Functions</label>
          <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
            {functions.slice(0, 10).map((fn, i) => (
              <div
                key={i}
                className="text-sm font-mono p-2 rounded bg-surface-800 hover:bg-surface-700 cursor-pointer"
                onClick={() => onViewSource(node.address)}
              >
                <span className="text-primary-400">{fn.name}</span>
                <span className="text-surface-500">
                  ({fn.inputs?.map((inp) => inp.type).join(", ") || ""})
                </span>
                {fn.stateMutability && (
                  <span className={cn(
                    "ml-2 text-xs",
                    fn.stateMutability === "view" || fn.stateMutability === "pure"
                      ? "text-emerald-400"
                      : fn.stateMutability === "payable"
                      ? "text-amber-400"
                      : "text-surface-500"
                  )}>
                    {fn.stateMutability}
                  </span>
                )}
              </div>
            ))}
            {functions.length > 10 && (
              <p className="text-xs text-surface-500 text-center py-2">
                +{functions.length - 10} more functions
              </p>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2 pt-4 border-t border-surface-700">
        {node.sourceType !== "none" && (
          <button
            onClick={() => onViewSource(node.address)}
            className="btn btn-secondary w-full flex items-center justify-center gap-2"
          >
            <Code className="w-4 h-4" />
            View Source Code
          </button>
        )}
        <button
          onClick={() => onViewExplanation(node.address)}
          className="btn btn-accent w-full flex items-center justify-center gap-2"
        >
          <Bot className="w-4 h-4" />
          See AI Explanation
        </button>
      </div>
    </div>
  );
}

function SourceFileDetails({
  node,
  onViewSource,
}: {
  node: SourceFileNode;
  onViewSource: (address: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-semibold text-surface-500 uppercase">File Path</label>
        <p className="text-surface-100 mt-1 font-mono text-sm">{node.path}</p>
      </div>

      <div>
        <label className="text-xs font-semibold text-surface-500 uppercase">Source Type</label>
        <div className="mt-2">
          {node.sourceType === "verified" ? (
            <span className="badge badge-success flex items-center gap-1 w-fit">
              <FileText className="w-3 h-3" />
              Verified Source
            </span>
          ) : (
            <span className="badge badge-warning flex items-center gap-1 w-fit">
              <FileText className="w-3 h-3" />
              Decompiled
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => onViewSource(node.contractAddress)}
        className="btn btn-primary w-full flex items-center justify-center gap-2"
      >
        <Code className="w-4 h-4" />
        Open Full Source
      </button>
    </div>
  );
}

function TypeDefDetails({ node }: { node: TypeDefNode }) {
  return (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-semibold text-surface-500 uppercase">Type Name</label>
        <p className="text-surface-100 mt-1 font-semibold text-lg">{node.name}</p>
      </div>

      <div>
        <label className="text-xs font-semibold text-surface-500 uppercase">Kind</label>
        <div className="mt-2">
          <span className={cn(
            "badge",
            node.typeKind === "INTERFACE" && "bg-cyan-900/50 text-cyan-400 border-cyan-700/50",
            node.typeKind === "ABSTRACT_CONTRACT" && "bg-violet-900/50 text-violet-400 border-violet-700/50",
            node.typeKind === "LIBRARY" && "bg-teal-900/50 text-teal-400 border-teal-700/50",
            node.typeKind === "CONTRACT_IMPL" && "bg-pink-900/50 text-pink-400 border-pink-700/50"
          )}>
            {node.typeKind.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-surface-500 uppercase">Properties</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {node.instanciable && (
            <span className="badge badge-success">Instanciable</span>
          )}
          {node.isRootContractType && (
            <span className="badge bg-orange-900/50 text-orange-400 border-orange-700/50">
              Root Contract Type
            </span>
          )}
          {!node.instanciable && (
            <span className="badge bg-surface-700 text-surface-400">
              Not Instanciable
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

