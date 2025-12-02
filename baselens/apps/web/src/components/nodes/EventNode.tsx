import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Zap } from "lucide-react";
import type { EventNode as EventNodeType } from "@baselens/core";
import { cn } from "../../utils/cn";
import { shortenAddress } from "../../utils/explorers";

function EventNode({ data, selected }: NodeProps<EventNodeType>) {
  return (
    <div
      className={cn(
        "relative rounded-xl border-2 shadow-lg min-w-[160px] max-w-[220px] transition-all duration-300",
        "bg-gradient-to-b from-surface-800/90 to-surface-900/90 backdrop-blur-md",
        "border-rose-500/70 shadow-rose-500/20",
        selected && "ring-2 ring-offset-2 ring-offset-surface-950 ring-rose-500/30"
      )}
    >
      {/* Top accent line */}
      <div className="absolute inset-x-0 -top-px h-0.5 rounded-t-xl bg-gradient-to-r from-transparent via-rose-400 to-transparent" />

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
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-md bg-gradient-to-br from-rose-600 to-pink-600">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">
              Event
            </p>
          </div>
        </div>

        {/* Event Signature */}
        <p
          className="text-xs font-mono text-surface-200 truncate mb-2"
          title={data.signature}
        >
          {data.signature.split("(")[0]}
        </p>

        {/* Contract Address */}
        <p className="text-[10px] text-surface-500 truncate mb-2">
          Contract: {shortenAddress(data.contractAddress)}
        </p>

        {/* Badge */}
        <div className="flex flex-wrap gap-1">
          <span className="badge bg-rose-900/60 text-rose-300 border border-rose-500/50 text-[10px]">
            Event
          </span>
          {data.timestamp && (
            <span className="badge bg-surface-800 text-surface-400 border border-surface-600 text-[10px]">
              {new Date(data.timestamp).toLocaleDateString()}
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

export default memo(EventNode);
