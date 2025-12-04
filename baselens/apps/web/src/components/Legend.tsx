import { useState } from "react";
import { ChevronUp, ChevronDown, Info } from "lucide-react";
import { cn } from "../utils/cn";

interface LegendItem {
  label: string;
  color: string;
  type: "node" | "edge";
  category?: string;
}

const legendItems: LegendItem[] = [
  // Contract Node Types
  { label: "Root Contract", color: "#f97316", type: "node", category: "Contracts" },
  { label: "Proxy", color: "#8b5cf6", type: "node", category: "Contracts" },
  { label: "Implementation", color: "#3b82f6", type: "node", category: "Contracts" },
  { label: "Factory", color: "#22c55e", type: "node", category: "Contracts" },
  { label: "Simple Contract", color: "#6b7280", type: "node", category: "Contracts" },

  // Source Nodes
  { label: "Verified Source", color: "#10b981", type: "node", category: "Source" },
  { label: "Decompiled Source", color: "#f59e0b", type: "node", category: "Source" },

  // Type Nodes
  { label: "Interface", color: "#06b6d4", type: "node", category: "Types" },
  { label: "Library", color: "#14b8a6", type: "node", category: "Types" },
  { label: "Abstract Contract", color: "#8b5cf6", type: "node", category: "Types" },

  // Address Nodes
  { label: "Deployer/Factory", color: "#22c55e", type: "node", category: "Addresses" },
  { label: "External Address", color: "#64748b", type: "node", category: "Addresses" },

  // Event Nodes (future)
  { label: "Event", color: "#f43f5e", type: "node", category: "Events" },

  // Contract Relationship Edges
  { label: "Is Proxy Of", color: "#f97316", type: "edge", category: "Contract" },
  { label: "Source Impl", color: "#fb923c", type: "edge", category: "Contract" },
  { label: "Runtime Calls", color: "#3b82f6", type: "edge", category: "Contract" },
  { label: "Hardcoded Ref", color: "#64748b", type: "edge", category: "Contract" },

  // Deployment Edges
  { label: "Created By", color: "#22c55e", type: "edge", category: "Deploy" },
  { label: "Created", color: "#22c55e", type: "edge", category: "Deploy" },

  // Source Edges
  { label: "Has Source", color: "#8b5cf6", type: "edge", category: "Source" },
  { label: "Declares Type", color: "#ec4899", type: "edge", category: "Source" },

  // Type Edges
  { label: "Extends", color: "#f43f5e", type: "edge", category: "Inheritance" },
  { label: "Implements", color: "#eab308", type: "edge", category: "Inheritance" },
  { label: "Uses Library", color: "#14b8a6", type: "edge", category: "Inheritance" },
];

export default function Legend() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const nodeItems = legendItems.filter((item) => item.type === "node");
  const edgeItems = legendItems.filter((item) => item.type === "edge");

  // Group by category
  const nodeCategories = [...new Set(nodeItems.map((i) => i.category))];
  const edgeCategories = [...new Set(edgeItems.map((i) => i.category))];

  return (
    <div
      className={cn(
        "absolute bottom-4 left-14 z-10 transition-all duration-300 ease-out",
        "bg-surface-900/95 backdrop-blur-md border border-surface-700 rounded-xl shadow-2xl",
        isExpanded ? "w-80" : "w-auto"
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-surface-100 hover:bg-surface-800/50 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-primary-400" />
          <span>Legend</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-surface-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-surface-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4 animate-fade-in max-h-[50vh] overflow-y-auto custom-scrollbar">
          {/* Nodes Section */}
          <div className="mb-5">
            <h4 className="text-xs font-bold text-primary-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary-400" />
              Nodes
            </h4>

            {nodeCategories.map((category) => (
              <div key={category} className="mb-3">
                <p className="text-[10px] font-medium text-surface-500 uppercase tracking-wider mb-1.5 ml-1">
                  {category}
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {nodeItems
                    .filter((item) => item.category === category)
                    .map((item) => (
                      <LegendItemRow
                        key={item.label}
                        item={item}
                        isHovered={hoveredItem === item.label}
                        onHover={setHoveredItem}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-surface-600 to-transparent mb-5" />

          {/* Edges Section */}
          <div>
            <h4 className="text-xs font-bold text-primary-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-4 h-0.5 rounded-full bg-primary-400" />
              Edges
            </h4>

            {edgeCategories.map((category) => (
              <div key={category} className="mb-3">
                <p className="text-[10px] font-medium text-surface-500 uppercase tracking-wider mb-1.5 ml-1">
                  {category}
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {edgeItems
                    .filter((item) => item.category === category)
                    .map((item) => (
                      <LegendItemRow
                        key={item.label}
                        item={item}
                        isEdge
                        isHovered={hoveredItem === item.label}
                        onHover={setHoveredItem}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LegendItemRow({
  item,
  isEdge,
  isHovered,
  onHover,
}: {
  item: LegendItem;
  isEdge?: boolean;
  isHovered: boolean;
  onHover: (label: string | null) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1 px-1.5 rounded transition-colors cursor-default",
        isHovered && "bg-surface-800/70"
      )}
      onMouseEnter={() => onHover(item.label)}
      onMouseLeave={() => onHover(null)}
    >
      {isEdge ? (
        <div className="relative w-5 h-3 flex items-center">
          <div
            className="w-full h-0.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <div
            className="absolute right-0 w-0 h-0 border-l-4 border-y-2 border-y-transparent border-l-current"
            style={{ color: item.color }}
          />
        </div>
      ) : (
        <div
          className="w-3.5 h-3.5 rounded-full ring-2 ring-offset-1 ring-offset-surface-900"
          style={{ backgroundColor: item.color, ringColor: item.color }}
        />
      )}
      <span className={cn(
        "text-xs transition-colors",
        isHovered ? "text-surface-100" : "text-surface-400"
      )}>
        {item.label}
      </span>
    </div>
  );
}
