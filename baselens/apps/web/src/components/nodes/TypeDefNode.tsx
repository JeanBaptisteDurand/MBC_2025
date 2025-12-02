import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Box, Puzzle, Library, Code2, Braces } from "lucide-react";
import type { TypeDefNode as TypeDefNodeType } from "@baselens/core";
import { cn } from "../../utils/cn";

function TypeDefNode({ data, selected }: NodeProps<TypeDefNodeType>) {
  const getTypeConfig = () => {
    switch (data.typeKind) {
      case "INTERFACE":
        return {
          icon: <Puzzle className="w-4 h-4" />,
          label: "Interface",
          border: "border-cyan-500/70",
          shadow: "shadow-cyan-500/20",
          glow: "ring-cyan-500/30",
          iconBg: "bg-gradient-to-br from-cyan-600 to-blue-600",
          badgeClass: "bg-cyan-900/60 text-cyan-300 border-cyan-500/50",
          accent: "via-cyan-400",
        };
      case "ABSTRACT_CONTRACT":
        return {
          icon: <Box className="w-4 h-4" />,
          label: "Abstract",
          border: "border-violet-500/70",
          shadow: "shadow-violet-500/20",
          glow: "ring-violet-500/30",
          iconBg: "bg-gradient-to-br from-violet-600 to-purple-600",
          badgeClass: "bg-violet-900/60 text-violet-300 border-violet-500/50",
          accent: "via-violet-400",
        };
      case "LIBRARY":
        return {
          icon: <Library className="w-4 h-4" />,
          label: "Library",
          border: "border-teal-500/70",
          shadow: "shadow-teal-500/20",
          glow: "ring-teal-500/30",
          iconBg: "bg-gradient-to-br from-teal-600 to-emerald-600",
          badgeClass: "bg-teal-900/60 text-teal-300 border-teal-500/50",
          accent: "via-teal-400",
        };
      case "CONTRACT_IMPL":
        return {
          icon: <Code2 className="w-4 h-4" />,
          label: "Deployable Contract",
          border: "border-pink-500/70",
          shadow: "shadow-pink-500/20",
          glow: "ring-pink-500/30",
          iconBg: "bg-gradient-to-br from-pink-600 to-rose-600",
          badgeClass: "bg-pink-900/60 text-pink-300 border-pink-500/50",
          accent: "via-pink-400",
        };
      default:
        return {
          icon: <Braces className="w-4 h-4" />,
          label: data.typeKind || "Type",
          border: "border-surface-500/70",
          shadow: "shadow-surface-500/10",
          glow: "ring-surface-500/20",
          iconBg: "bg-surface-700",
          badgeClass: "bg-surface-800 text-surface-400 border-surface-600",
          accent: "via-surface-400",
        };
    }
  };

  const config = getTypeConfig();

  return (
    <div
      className={cn(
        "relative rounded-xl border-2 shadow-lg min-w-[150px] max-w-[200px] transition-all duration-300",
        "bg-gradient-to-b from-surface-800/90 to-surface-900/90 backdrop-blur-md",
        config.border,
        config.shadow,
        selected && `ring-2 ring-offset-2 ring-offset-surface-950 ${config.glow}`
      )}
    >
      {/* Top accent line */}
      <div className={cn(
        "absolute inset-x-0 -top-px h-0.5 rounded-t-xl bg-gradient-to-r from-transparent to-transparent",
        config.accent
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
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shadow-md",
              config.iconBg
            )}
          >
            <span className="text-white">{config.icon}</span>
          </div>
          <p className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">
            {config.label}
          </p>
        </div>

        {/* Type Name */}
        <p className="text-sm font-semibold text-surface-100 truncate mb-2" title={data.name}>
          {data.name}
        </p>

        {/* Badges */}
        <div className="flex flex-wrap gap-1">
          <span className={cn("badge border text-[10px]", config.badgeClass)}>
            {config.label}
          </span>
          {data.instanciable && (
            <span className="badge badge-success text-[10px]">
              Deployable
            </span>
          )}
          {data.isRootContractType && (
            <span className="badge bg-orange-900/60 text-orange-300 border border-orange-500/50 text-[10px]">
              Root Type
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

export default memo(TypeDefNode);
