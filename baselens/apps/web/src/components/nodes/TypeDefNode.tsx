import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Box, Puzzle, Library, Code2 } from "lucide-react";
import type { TypeDefNode as TypeDefNodeType } from "@baselens/core";
import { cn } from "../../utils/cn";

function TypeDefNode({ data, selected }: NodeProps<TypeDefNodeType>) {
  const getTypeConfig = () => {
    switch (data.typeKind) {
      case "INTERFACE":
        return {
          icon: <Puzzle className="w-4 h-4" />,
          color: "cyan",
          label: "Interface",
        };
      case "ABSTRACT_CONTRACT":
        return {
          icon: <Box className="w-4 h-4" />,
          color: "violet",
          label: "Abstract",
        };
      case "LIBRARY":
        return {
          icon: <Library className="w-4 h-4" />,
          color: "teal",
          label: "Library",
        };
      case "CONTRACT_IMPL":
        return {
          icon: <Code2 className="w-4 h-4" />,
          color: "pink",
          label: "Contract",
        };
      default:
        return {
          icon: <Box className="w-4 h-4" />,
          color: "gray",
          label: data.typeKind,
        };
    }
  };

  const config = getTypeConfig();

  const colorClasses = {
    cyan: {
      border: "border-cyan-500 shadow-cyan-500/20",
      icon: "bg-cyan-900/50 text-cyan-400",
      badge: "bg-cyan-900/50 text-cyan-400 border-cyan-700/50",
    },
    violet: {
      border: "border-violet-500 shadow-violet-500/20",
      icon: "bg-violet-900/50 text-violet-400",
      badge: "bg-violet-900/50 text-violet-400 border-violet-700/50",
    },
    teal: {
      border: "border-teal-500 shadow-teal-500/20",
      icon: "bg-teal-900/50 text-teal-400",
      badge: "bg-teal-900/50 text-teal-400 border-teal-700/50",
    },
    pink: {
      border: "border-pink-500 shadow-pink-500/20",
      icon: "bg-pink-900/50 text-pink-400",
      badge: "bg-pink-900/50 text-pink-400 border-pink-700/50",
    },
    gray: {
      border: "border-surface-500 shadow-surface-500/20",
      icon: "bg-surface-800 text-surface-400",
      badge: "bg-surface-800 text-surface-400 border-surface-600",
    },
  };

  const colors = colorClasses[config.color as keyof typeof colorClasses];

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-xl border-2 shadow-lg min-w-[140px] transition-all duration-200",
        "bg-surface-900/90 backdrop-blur-sm",
        selected && "ring-2 ring-primary-500 ring-offset-2 ring-offset-surface-950",
        colors.border
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
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", colors.icon)}>
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-surface-500">{config.label}</p>
        </div>
      </div>

      {/* Type Name */}
      <p className="text-sm font-semibold text-surface-100 truncate mb-2">
        {data.name}
      </p>

      {/* Badges */}
      <div className="flex flex-wrap gap-1">
        <span className={cn("badge", colors.badge)}>{config.label}</span>
        {data.instanciable && (
          <span className="badge badge-success">Instanciable</span>
        )}
        {data.isRootContractType && (
          <span className="badge bg-orange-900/50 text-orange-400 border-orange-700/50">
            Root Type
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

export default memo(TypeDefNode);

