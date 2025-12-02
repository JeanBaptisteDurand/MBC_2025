import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Wallet, Building2 } from "lucide-react";
import type { AddressNode as AddressNodeType } from "@baselens/core";
import { cn } from "../../utils/cn";
import { shortenAddress } from "../../utils/explorers";

function AddressNode({ data, selected }: NodeProps<AddressNodeType>) {
  const isDeployer = data.label?.includes("Factory") || data.label?.includes("Deployer");

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-xl border-2 shadow-lg min-w-[160px] transition-all duration-200",
        "bg-surface-900/90 backdrop-blur-sm",
        selected && "ring-2 ring-primary-500 ring-offset-2 ring-offset-surface-950",
        isDeployer
          ? "border-emerald-500/60 shadow-emerald-500/10"
          : "border-slate-500/60 shadow-slate-500/10"
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
            isDeployer
              ? "bg-emerald-900/50 text-emerald-400"
              : "bg-slate-800 text-slate-400"
          )}
        >
          {isDeployer ? (
            <Building2 className="w-4 h-4" />
          ) : (
            <Wallet className="w-4 h-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-surface-500">
            {isDeployer ? "Deployer" : "Address"}
          </p>
          <p className="text-sm font-mono font-medium truncate">
            {shortenAddress(data.address)}
          </p>
        </div>
      </div>

      {/* Label */}
      {data.label && (
        <p className="text-xs text-surface-400 truncate mb-2">
          {data.label}
        </p>
      )}

      {/* Badge */}
      <div className="flex flex-wrap gap-1">
        {isDeployer ? (
          <span className="badge bg-emerald-900/50 text-emerald-400 border-emerald-700/50">
            Deployer
          </span>
        ) : (
          <span className="badge bg-slate-800 text-slate-400 border-slate-600">
            EOA
          </span>
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

export default memo(AddressNode);
