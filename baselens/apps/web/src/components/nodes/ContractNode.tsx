import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { FileCode, Shield, Factory, Layers } from "lucide-react";
import type { ContractNode as ContractNodeType } from "@baselens/core";
import { cn } from "../../utils/cn";
import { shortenAddress } from "../../utils/explorers";

function ContractNode({ data, selected }: NodeProps<ContractNodeType>) {
  const isProxy = data.kindOnChain === "PROXY";
  const isImpl = data.kindOnChain === "IMPLEMENTATION";
  const isEoa = data.kindOnChain === "EOA";

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-xl border-2 shadow-lg min-w-[180px] transition-all duration-200",
        "bg-surface-900/90 backdrop-blur-sm",
        selected && "ring-2 ring-primary-500 ring-offset-2 ring-offset-surface-950",
        data.isRoot
          ? "border-orange-500 shadow-orange-500/20"
          : isProxy
          ? "border-purple-500 shadow-purple-500/20"
          : isImpl
          ? "border-blue-500 shadow-blue-500/20"
          : data.isFactory
          ? "border-green-500 shadow-green-500/20"
          : "border-surface-600"
      )}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-surface-400 !w-3 !h-3 !border-2 !border-surface-600"
      />

      {/* Icon */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            data.isRoot
              ? "bg-orange-900/50 text-orange-400"
              : isProxy
              ? "bg-purple-900/50 text-purple-400"
              : isImpl
              ? "bg-blue-900/50 text-blue-400"
              : data.isFactory
              ? "bg-green-900/50 text-green-400"
              : "bg-surface-800 text-surface-400"
          )}
        >
          {isProxy ? (
            <Layers className="w-4 h-4" />
          ) : isImpl ? (
            <Shield className="w-4 h-4" />
          ) : data.isFactory ? (
            <Factory className="w-4 h-4" />
          ) : (
            <FileCode className="w-4 h-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-surface-500 truncate">Contract</p>
          <p className="text-sm font-mono font-medium truncate">
            {shortenAddress(data.address)}
          </p>
        </div>
      </div>

      {/* Name */}
      {data.name && (
        <p className="text-sm font-semibold text-surface-100 truncate mb-2">
          {data.name}
        </p>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-1">
        {data.isRoot && (
          <span className="badge bg-orange-900/50 text-orange-400 border-orange-700/50">
            Root
          </span>
        )}
        {isProxy && (
          <span className="badge bg-purple-900/50 text-purple-400 border-purple-700/50">
            Proxy
          </span>
        )}
        {isImpl && (
          <span className="badge bg-blue-900/50 text-blue-400 border-blue-700/50">
            Impl
          </span>
        )}
        {data.isFactory && (
          <span className="badge bg-green-900/50 text-green-400 border-green-700/50">
            Factory
          </span>
        )}
        {isEoa && (
          <span className="badge bg-surface-700 text-surface-400">EOA</span>
        )}
        {data.verified && (
          <span className="badge badge-success">Verified</span>
        )}
        {data.sourceType === "decompiled" && (
          <span className="badge badge-warning">Decompiled</span>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-surface-400 !w-3 !h-3 !border-2 !border-surface-600"
      />
    </div>
  );
}

export default memo(ContractNode);

