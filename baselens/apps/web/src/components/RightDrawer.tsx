import { X, ExternalLink, Copy, Code, Bot, Layers, Factory, Shield, FileText, Wallet, Book, Box, Puzzle } from "lucide-react";
import type { Node, ContractNode, SourceFileNode, TypeDefNode, AddressNode } from "@baselens/core";
import { useQuery } from "@tanstack/react-query";
import { cn } from "../utils/cn";
import { shortenAddress, getBasescanAddressUrl, getBasescanTxUrl, copyToClipboard } from "../utils/explorers";
import { getContractAbi } from "../api/endpoints";
import { useToast } from "./ui/Toast";

interface RightDrawerProps {
  node: Node | null;
  analysisId: string;
  onClose: () => void;
  onViewSource: (address: string, filePath?: string) => void;
  onViewExplanation: (address: string) => void;
  onViewTypeDefinition: (address: string, typeName: string, typeKind: string) => void;
}

export default function RightDrawer({
  node,
  analysisId,
  onClose,
  onViewSource,
  onViewExplanation,
  onViewTypeDefinition,
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
          <TypeDefDetails
            node={node}
            onViewSource={onViewSource}
            onViewTypeDefinition={onViewTypeDefinition}
          />
        )}
        {node.kind === "address" && (
          <AddressDetails
            node={node}
            onCopy={handleCopy}
          />
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
          {node.kindOnChain === "EOA" && (
            <span className="badge bg-slate-700 text-slate-300 border-slate-500/50 flex items-center gap-1">
              <Wallet className="w-3 h-3" />
              Wallet (EOA)
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
              Deployer Factory
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
  onViewSource: (address: string, filePath?: string) => void;
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
        onClick={() => onViewSource(node.contractAddress, node.path)}
        className="btn btn-primary w-full flex items-center justify-center gap-2"
      >
        <Code className="w-4 h-4" />
        Open Full Source
      </button>
    </div>
  );
}

function TypeDefDetails({
  node,
  onViewSource,
  onViewTypeDefinition,
}: {
  node: TypeDefNode;
  onViewSource: (address: string, filePath?: string) => void;
  onViewTypeDefinition: (address: string, typeName: string, typeKind: string) => void;
}) {
  // Parse sourceFileId to get contract address and file path
  // Format: "source:0xabc123:contracts/MyContract.sol"
  const sourceFileIdParts = node.sourceFileId.replace("source:", "").split(":");
  const contractAddress = sourceFileIdParts[0] || "";
  const filePath = sourceFileIdParts.slice(1).join(":") || "";
  const fileName = filePath.split("/").pop() || filePath;

  // Get icon and description based on type kind
  const getTypeInfo = () => {
    switch (node.typeKind) {
      case "INTERFACE":
        return {
          icon: <Puzzle className="w-5 h-5" />,
          color: "cyan",
          label: "Interface",
          description: "An interface defines a contract's external API without implementation. Other contracts can implement this interface.",
        };
      case "LIBRARY":
        return {
          icon: <Book className="w-5 h-5" />,
          color: "teal",
          label: "Library",
          description: "A library contains reusable code that can be called by other contracts. Libraries cannot store state and cannot receive ETH.",
        };
      case "ABSTRACT_CONTRACT":
        return {
          icon: <Box className="w-5 h-5" />,
          color: "violet",
          label: "Abstract Contract",
          description: "An abstract contract has at least one unimplemented function. It cannot be deployed directly but must be inherited.",
        };
      case "CONTRACT_IMPL":
        return {
          icon: <FileText className="w-5 h-5" />,
          color: "pink",
          label: "Deployable Contract",
          description: "A concrete contract implementation that can be deployed to the blockchain. This is the main type that gets deployed.",
        };
      default:
        return {
          icon: <FileText className="w-5 h-5" />,
          color: "surface",
          label: "Type Definition",
          description: "A Solidity type definition.",
        };
    }
  };

  const typeInfo = getTypeInfo();

  return (
    <div className="space-y-6">
      {/* Type Header */}
      <div className="flex items-start gap-4">
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center shadow-lg",
          typeInfo.color === "cyan" && "bg-gradient-to-br from-cyan-600 to-cyan-700 text-white",
          typeInfo.color === "teal" && "bg-gradient-to-br from-teal-600 to-teal-700 text-white",
          typeInfo.color === "violet" && "bg-gradient-to-br from-violet-600 to-violet-700 text-white",
          typeInfo.color === "pink" && "bg-gradient-to-br from-pink-600 to-pink-700 text-white",
          typeInfo.color === "surface" && "bg-surface-700 text-surface-300"
        )}>
          {typeInfo.icon}
        </div>
        <div>
          <p className="text-surface-100 font-semibold text-lg">{node.name}</p>
          <p className="text-xs text-surface-500 mt-1">
            {typeInfo.label}
          </p>
        </div>
      </div>

      {/* Contract Address */}
      {contractAddress && (
        <div>
          <label className="text-xs font-semibold text-surface-500 uppercase">Contract Address</label>
          <div className="flex items-center gap-2 mt-1">
            <code className="text-sm font-mono text-surface-300 truncate flex-1">
              {shortenAddress(contractAddress, 8)}
            </code>
            <a
              href={getBasescanAddressUrl("base-mainnet", contractAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded text-surface-400 hover:text-primary-400 hover:bg-surface-800"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}

      {/* Source File */}
      <div>
        <label className="text-xs font-semibold text-surface-500 uppercase">Defined In</label>
        <p className="text-surface-300 mt-1 font-mono text-sm truncate" title={filePath}>
          {fileName}
        </p>
      </div>

      {/* Type Badge */}
      <div>
        <label className="text-xs font-semibold text-surface-500 uppercase">Type Category</label>
        <div className="mt-2">
          <span className={cn(
            "badge flex items-center gap-1.5",
            node.typeKind === "INTERFACE" && "bg-cyan-900/50 text-cyan-400 border-cyan-700/50",
            node.typeKind === "ABSTRACT_CONTRACT" && "bg-violet-900/50 text-violet-400 border-violet-700/50",
            node.typeKind === "LIBRARY" && "bg-teal-900/50 text-teal-400 border-teal-700/50",
            node.typeKind === "CONTRACT_IMPL" && "bg-pink-900/50 text-pink-400 border-pink-700/50"
          )}>
            {typeInfo.icon}
            {typeInfo.label}
          </span>
        </div>
      </div>

      {/* Properties */}
      <div>
        <label className="text-xs font-semibold text-surface-500 uppercase">Properties</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {node.instanciable ? (
            <span className="badge badge-success">✓ Deployable</span>
          ) : (
            <span className="badge bg-surface-700 text-surface-400">
              Not Deployable
            </span>
          )}
          {node.isRootContractType && (
            <span className="badge bg-orange-900/50 text-orange-400 border-orange-700/50">
              ⭐ Main Contract
            </span>
          )}
        </div>
      </div>

      {/* Explanation */}
      <div className="p-4 rounded-lg bg-surface-800/50 border border-surface-700">
        <p className="text-sm text-surface-400 leading-relaxed">
          {typeInfo.description}
        </p>
      </div>

      {/* Deployable Contract explanation */}
      {node.typeKind === "CONTRACT_IMPL" && (
        <div className="p-4 rounded-lg bg-pink-900/20 border border-pink-700/30">
          <p className="text-xs font-semibold text-pink-400 uppercase mb-2">What is a Deployable Contract?</p>
          <p className="text-sm text-surface-300 leading-relaxed">
            A <strong>Deployable Contract</strong> is a fully implemented contract that can be deployed to the blockchain.
            Unlike interfaces, abstract contracts, and libraries, this type has all functions implemented and can exist on-chain as a standalone contract.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      {contractAddress && (
        <div className="pt-4 border-t border-surface-700 space-y-2">
          {/* Primary action - View extracted type definition */}
          <button
            onClick={() => onViewTypeDefinition(contractAddress, node.name, node.typeKind)}
            className="btn btn-primary w-full flex items-center justify-center gap-2"
          >
            <Code className="w-4 h-4" />
            View {typeInfo.label} Code
          </button>

          {/* Secondary action - View full source file */}
          {filePath && (
            <button
              onClick={() => onViewSource(contractAddress, filePath)}
              className="btn btn-secondary w-full flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              View Full Source File
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AddressDetails({
  node,
  onCopy,
}: {
  node: AddressNode;
  onCopy: (text: string) => void;
}) {
  // Check if this is a deployer wallet (EOA that deployed contracts)
  const isDeployerWallet = node.label?.includes("Deployer Wallet");

  return (
    <div className="space-y-6">
      {/* Header with Icon */}
      <div className="flex items-start gap-4">
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center shadow-lg",
          isDeployerWallet
            ? "bg-gradient-to-br from-emerald-600 to-green-600 text-white"
            : "bg-gradient-to-br from-slate-600 to-slate-700 text-white"
        )}>
          <Wallet className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs font-medium text-surface-500 uppercase">
            {isDeployerWallet ? "Deployer Wallet" : "External Wallet"}
          </p>
          <p className="text-surface-100 font-semibold text-lg">
            {isDeployerWallet ? "EOA Deployer" : "Wallet Address"}
          </p>
        </div>
      </div>

      {/* Address */}
      <div>
        <label className="text-xs font-semibold text-surface-500 uppercase">Address</label>
        <div className="flex items-center gap-2 mt-1">
          <code className="text-sm font-mono text-surface-100 flex-1 truncate">
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

      {/* Label */}
      {node.label && (
        <div>
          <label className="text-xs font-semibold text-surface-500 uppercase">Role</label>
          <div className="mt-2">
            <span className={cn(
              "badge flex items-center gap-1.5",
              isDeployerWallet
                ? "bg-emerald-900/50 text-emerald-400 border-emerald-700/50"
                : "bg-slate-700 text-slate-300 border-slate-500"
            )}>
              <Wallet className="w-3 h-3" />
              {node.label}
            </span>
          </div>
        </div>
      )}

      {/* Explanation */}
      <div className="p-4 rounded-lg bg-surface-800/50 border border-surface-700">
        <p className="text-sm text-surface-400 leading-relaxed">
          {isDeployerWallet ? (
            <>
              This is a <strong>Deployer Wallet</strong> (EOA - Externally Owned Account) that deployed
              one or more contracts in this analysis. Unlike factory contracts, this is a regular wallet
              controlled by a private key.
            </>
          ) : (
            <>
              This is an <strong>external address</strong> referenced in the analyzed contracts.
              It could be a wallet, a contract outside the analysis scope, or a hardcoded address in the source code.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

