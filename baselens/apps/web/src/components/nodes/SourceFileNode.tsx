import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { FileText, FileCode2, CheckCircle, AlertTriangle } from "lucide-react";
import type { SourceFileNode as SourceFileNodeType } from "@baselens/core";
import { cn } from "../../utils/cn";

function SourceFileNode({ data, selected }: NodeProps<SourceFileNodeType>) {
  const isVerified = data.sourceType === "verified";
  const fileName = data.path.split("/").pop() || data.path;
  const isMainFile = fileName.toLowerCase().includes(data.contractAddress.toLowerCase().slice(2, 8));

  const style = isVerified
    ? {
      border: "border-emerald-500/70",
      shadow: "shadow-emerald-500/20",
      glow: "ring-emerald-500/30",
      iconBg: "bg-gradient-to-br from-emerald-600 to-green-600",
      accentColor: "emerald",
    }
    : {
      border: "border-amber-500/70",
      shadow: "shadow-amber-500/20",
      glow: "ring-amber-500/30",
      iconBg: "bg-gradient-to-br from-amber-600 to-yellow-600",
      accentColor: "amber",
    };

  return (
    <div
      className={cn(
        "relative rounded-xl border-2 shadow-lg min-w-[180px] max-w-[240px] transition-all duration-300",
        "bg-gradient-to-b from-surface-800/90 to-surface-900/90 backdrop-blur-md",
        style.border,
        style.shadow,
        selected && `ring-2 ring-offset-2 ring-offset-surface-950 ${style.glow}`
      )}
    >
      {/* Top accent line */}
      <div className={cn(
        "absolute inset-x-0 -top-px h-0.5 rounded-t-xl",
        isVerified
          ? "bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
          : "bg-gradient-to-r from-transparent via-amber-400 to-transparent"
      )} />

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          "!w-3 !h-3 !-top-1.5 !border-2 !rounded-full transition-all",
          "!bg-surface-800 !border-surface-500",
          "hover:!bg-primary-500 hover:!border-primary-400"
        )}
      />

      {/* Content */}
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center shadow-md",
              style.iconBg
            )}
          >
            {isVerified ? (
              <FileCode2 className="w-4 h-4 text-white" />
            ) : (
              <FileText className="w-4 h-4 text-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">
              Source File
            </p>
          </div>
        </div>

        {/* File Path */}
        <p className="text-sm font-mono text-surface-100 truncate mb-3" title={data.path}>
          {fileName}
        </p>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
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
          {isMainFile && (
            <span className="badge bg-surface-700 text-surface-400 border border-surface-600 text-[10px]">
              Main
            </span>
          )}
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          "!w-3 !h-3 !-bottom-1.5 !border-2 !rounded-full transition-all",
          "!bg-surface-800 !border-surface-500",
          "hover:!bg-primary-500 hover:!border-primary-400"
        )}
      />
    </div>
  );
}

export default memo(SourceFileNode);
