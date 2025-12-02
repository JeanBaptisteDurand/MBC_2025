import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { FileCode, Shield, Factory, Layers, Sparkles, AlertTriangle, Wallet } from "lucide-react";
import type { ContractNode as ContractNodeType } from "@baselens/core";
import { cn } from "../../utils/cn";
import { shortenAddress } from "../../utils/explorers";

function ContractNode({ data, selected }: NodeProps<ContractNodeType>) {
  const isProxy = data.kindOnChain === "PROXY";
  const isImpl = data.kindOnChain === "IMPLEMENTATION";
  const isEoa = data.kindOnChain === "EOA";
  const isWallet = isEoa; // EOA = Wallet (Externally Owned Account)

  const getNodeStyle = () => {
    if (isWallet) {
      return {
        border: "border-slate-500 border-dashed",
        shadow: "shadow-slate-500/20",
        glow: "ring-slate-500/20",
        iconBg: "bg-gradient-to-br from-slate-600 to-slate-700",
        iconText: "text-white",
        headerBg: "bg-gradient-to-r from-slate-900/50 to-transparent",
      };
    }
    if (data.isRoot) {
      return {
        border: "border-orange-500",
        shadow: "shadow-orange-500/30",
        glow: "ring-orange-500/30",
        iconBg: "bg-gradient-to-br from-orange-600 to-amber-600",
        iconText: "text-white",
        headerBg: "bg-gradient-to-r from-orange-900/50 to-transparent",
      };
    }
    if (isProxy) {
      return {
        border: "border-purple-500",
        shadow: "shadow-purple-500/30",
        glow: "ring-purple-500/30",
        iconBg: "bg-gradient-to-br from-purple-600 to-violet-600",
        iconText: "text-white",
        headerBg: "bg-gradient-to-r from-purple-900/50 to-transparent",
      };
    }
    if (isImpl) {
      return {
        border: "border-blue-500",
        shadow: "shadow-blue-500/30",
        glow: "ring-blue-500/30",
        iconBg: "bg-gradient-to-br from-blue-600 to-cyan-600",
        iconText: "text-white",
        headerBg: "bg-gradient-to-r from-blue-900/50 to-transparent",
      };
    }
    if (data.isFactory) {
      return {
        border: "border-emerald-500",
        shadow: "shadow-emerald-500/30",
        glow: "ring-emerald-500/30",
        iconBg: "bg-gradient-to-br from-emerald-600 to-green-600",
        iconText: "text-white",
        headerBg: "bg-gradient-to-r from-emerald-900/50 to-transparent",
      };
    }
    return {
      border: "border-surface-600",
      shadow: "shadow-surface-500/10",
      glow: "ring-surface-500/20",
      iconBg: "bg-surface-700",
      iconText: "text-surface-300",
      headerBg: "",
    };
  };

  const style = getNodeStyle();
  const hasError = data.tags?.decompileError;

  return (
    <div
      className={cn(
        "relative rounded-2xl border-2 shadow-xl min-w-[200px] max-w-[280px] transition-all duration-300",
        "bg-gradient-to-b from-surface-800/95 to-surface-900/95 backdrop-blur-md",
        style.border,
        style.shadow,
        selected && `ring-2 ring-offset-2 ring-offset-surface-950 ${style.glow}`
      )}
    >
      {/* Decorative top glow */}
      {data.isRoot && (
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-orange-400 to-transparent" />
      )}

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          "!w-4 !h-4 !-top-2 !border-2 !rounded-full transition-all",
          "!bg-surface-800 !border-surface-500",
          "hover:!bg-primary-500 hover:!border-primary-400"
        )}
      />

      {/* Header with icon */}
      <div className={cn("flex items-center gap-3 p-4 rounded-t-xl", style.headerBg)}>
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shadow-lg",
            style.iconBg
          )}
        >
          {isWallet ? (
            <Wallet className={cn("w-5 h-5", style.iconText)} />
          ) : isProxy ? (
            <Layers className={cn("w-5 h-5", style.iconText)} />
          ) : isImpl ? (
            <Shield className={cn("w-5 h-5", style.iconText)} />
          ) : data.isFactory ? (
            <Factory className={cn("w-5 h-5", style.iconText)} />
          ) : (
            <FileCode className={cn("w-5 h-5", style.iconText)} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">
            {isWallet ? "Wallet (EOA)" : isProxy ? "Proxy" : isImpl ? "Implementation" : data.isFactory ? "Deployer Factory" : "Contract"}
          </p>
          <p className="text-sm font-mono font-semibold text-surface-100 truncate">
            {shortenAddress(data.address)}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-4">
        {/* Contract Name */}
        {data.name && (
          <p className="text-sm font-bold text-surface-100 truncate mb-3 flex items-center gap-1">
            {data.verified && <Sparkles className="w-3 h-3 text-emerald-400" />}
            {data.name}
          </p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {data.isRoot && (
            <span className="badge bg-gradient-to-r from-orange-600/50 to-amber-600/50 text-orange-300 border border-orange-500/50 shadow-sm">
              ⭐ Root
            </span>
          )}
          {isProxy && (
            <span className="badge bg-purple-900/60 text-purple-300 border border-purple-500/50">
              Proxy
            </span>
          )}
          {isImpl && (
            <span className="badge bg-blue-900/60 text-blue-300 border border-blue-500/50">
              Impl
            </span>
          )}
          {data.isFactory && (
            <span className="badge bg-emerald-900/60 text-emerald-300 border border-emerald-500/50">
              🏭 Deployer
            </span>
          )}
          {isWallet && (
            <span className="badge bg-slate-700 text-slate-300 border border-slate-500">
              👤 Wallet
            </span>
          )}
          {data.verified ? (
            <span className="badge badge-success">
              ✓ Verified
            </span>
          ) : data.sourceType === "decompiled" ? (
            <span className="badge badge-warning">
              Decompiled
            </span>
          ) : (
            <span className="badge bg-surface-700 text-surface-500 border border-surface-600">
              No Source
            </span>
          )}
          {hasError && (
            <span className="badge badge-error flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Error
            </span>
          )}
        </div>

        {/* Compiler info for verified contracts */}
        {data.tags?.compilerVersion && (
          <div className="mt-3 pt-3 border-t border-surface-700/50">
            <p className="text-[10px] text-surface-500 truncate">
              <span className="text-surface-400">Compiler:</span> {data.tags.compilerVersion}
            </p>
          </div>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          "!w-4 !h-4 !-bottom-2 !border-2 !rounded-full transition-all",
          "!bg-surface-800 !border-surface-500",
          "hover:!bg-primary-500 hover:!border-primary-400"
        )}
      />
    </div>
  );
}

export default memo(ContractNode);
