import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "../utils/cn";

interface LegendItem {
  label: string;
  color: string;
  type: "node" | "edge";
}

const legendItems: LegendItem[] = [
  // Nodes
  { label: "Root Contract", color: "#f97316", type: "node" },
  { label: "Proxy", color: "#8b5cf6", type: "node" },
  { label: "Implementation", color: "#3b82f6", type: "node" },
  { label: "Factory", color: "#22c55e", type: "node" },
  { label: "Contract", color: "#6b7280", type: "node" },
  { label: "Source (Verified)", color: "#22c55e", type: "node" },
  { label: "Source (Decompiled)", color: "#eab308", type: "node" },
  { label: "Interface", color: "#06b6d4", type: "node" },
  { label: "Library", color: "#14b8a6", type: "node" },
  // Edges
  { label: "IS_PROXY_OF", color: "#f97316", type: "edge" },
  { label: "CALLS_RUNTIME", color: "#3b82f6", type: "edge" },
  { label: "CREATED_BY", color: "#22c55e", type: "edge" },
  { label: "HAS_SOURCE_FILE", color: "#8b5cf6", type: "edge" },
  { label: "EXTENDS_CONTRACT", color: "#f43f5e", type: "edge" },
  { label: "IMPLEMENTS_INTERFACE", color: "#eab308", type: "edge" },
  { label: "USES_LIBRARY", color: "#14b8a6", type: "edge" },
];

export default function Legend() {
  const [isExpanded, setIsExpanded] = useState(false);

  const nodeItems = legendItems.filter((item) => item.type === "node");
  const edgeItems = legendItems.filter((item) => item.type === "edge");

  return (
    <div
      className={cn(
        "absolute bottom-4 left-4 z-10 transition-all duration-300",
        "bg-surface-900/95 backdrop-blur-sm border border-surface-700 rounded-xl shadow-lg",
        isExpanded ? "w-72" : "w-auto"
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-surface-100 hover:bg-surface-800/50 rounded-xl transition-colors"
      >
        <span>Legend</span>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-surface-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-surface-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4 animate-fade-in">
          {/* Nodes */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">
              Nodes
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {nodeItems.map((item) => (
                <LegendItemRow key={item.label} item={item} />
              ))}
            </div>
          </div>

          {/* Edges */}
          <div>
            <h4 className="text-xs font-semibold text-surface-500 uppercase mb-2">
              Edges
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {edgeItems.map((item) => (
                <LegendItemRow key={item.label} item={item} isEdge />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LegendItemRow({
  item,
  isEdge,
}: {
  item: LegendItem;
  isEdge?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {isEdge ? (
        <div
          className="w-4 h-0.5 rounded-full"
          style={{ backgroundColor: item.color }}
        />
      ) : (
        <div
          className="w-3 h-3 rounded-full border-2"
          style={{ borderColor: item.color }}
        />
      )}
      <span className="text-xs text-surface-400 truncate">{item.label}</span>
    </div>
  );
}

