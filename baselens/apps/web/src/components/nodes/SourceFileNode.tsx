import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { FileText, CheckCircle, AlertTriangle } from "lucide-react";
import type { SourceFileNode as SourceFileNodeType } from "@baselens/core";
import { cn } from "../../utils/cn";

function SourceFileNode({ data, selected }: NodeProps<SourceFileNodeType>) {
  const isVerified = data.sourceType === "verified";

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-xl border-2 shadow-lg min-w-[160px] transition-all duration-200",
        "bg-surface-900/90 backdrop-blur-sm",
        selected && "ring-2 ring-primary-500 ring-offset-2 ring-offset-surface-950",
        isVerified
          ? "border-emerald-500 shadow-emerald-500/20"
          : "border-amber-500 shadow-amber-500/20"
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
            isVerified
              ? "bg-emerald-900/50 text-emerald-400"
              : "bg-amber-900/50 text-amber-400"
          )}
        >
          <FileText className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-surface-500">Source File</p>
        </div>
      </div>

      {/* File Path */}
      <p className="text-sm font-mono text-surface-100 truncate mb-2">
        {data.path.split("/").pop()}
      </p>

      {/* Source Type Badge */}
      <div className="flex items-center gap-1">
        {isVerified ? (
          <span className="badge badge-success flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Verified
          </span>
        ) : (
          <span className="badge badge-warning flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Decompiled
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

export default memo(SourceFileNode);

