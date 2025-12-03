import { useState } from "react";
import {
  Settings,
  ChevronLeft,
  ChevronRight,
  Check,
  Layers,
  GitBranch,
  FileCode,
  Boxes,
  RefreshCw,
} from "lucide-react";
import { cn } from "../utils/cn";

interface ControlMenuProps {
  visibleNodeKinds: Set<string>;
  visibleEdgeKinds: Set<string>;
  onToggleNodeKind: (kind: string) => void;
  onToggleEdgeKind: (kind: string) => void;
  onApply: () => void;
  onPresetChange?: (preset: ViewPreset) => void;
}

// View presets for quick configuration
export interface ViewPreset {
  name: string;
  description: string;
  nodeKinds: string[];
  edgeKinds: string[];
}

export const VIEW_PRESETS: ViewPreset[] = [
  {
    name: "Full Graph",
    description: "Show all nodes and edges",
    nodeKinds: ["contract", "sourceFile", "typeDef", "address"],
    edgeKinds: [
      "IS_PROXY_OF", "CALLS_RUNTIME", "CREATED_BY", "CREATED", "HAS_SOURCE_FILE",
      "DECLARES_TYPE", "DEFINED_BY", "IMPLEMENTS_INTERFACE", "EXTENDS_CONTRACT",
      "USES_LIBRARY", "USES_TYPE_INTERFACE", "REFERENCES_ADDRESS", "SOURCE_DECLARED_IMPL"
    ],
  },
  {
    name: "Contracts Only",
    description: "Focus on contract relationships",
    nodeKinds: ["contract"],
    edgeKinds: ["IS_PROXY_OF", "CALLS_RUNTIME", "CREATED_BY", "CREATED", "SOURCE_DECLARED_IMPL", "REFERENCES_ADDRESS"],
  },
  {
    name: "Source Code",
    description: "Contracts with their source files",
    nodeKinds: ["contract", "sourceFile"],
    edgeKinds: ["IS_PROXY_OF", "HAS_SOURCE_FILE", "SOURCE_DECLARED_IMPL", "CREATED_BY"],
  },
  {
    name: "Type Hierarchy",
    description: "Focus on inheritance and types",
    nodeKinds: ["contract", "sourceFile", "typeDef"],
    edgeKinds: [
      "HAS_SOURCE_FILE", "DECLARES_TYPE", "DEFINED_BY", "IMPLEMENTS_INTERFACE",
      "EXTENDS_CONTRACT", "USES_LIBRARY", "USES_TYPE_INTERFACE"
    ],
  },
  {
    name: "Factory Relations",
    description: "Focus on deployment and creation",
    nodeKinds: ["contract", "address"],
    edgeKinds: ["CREATED_BY", "CREATED"],
  },
  {
    name: "Proxy Architecture",
    description: "Proxy patterns and implementations",
    nodeKinds: ["contract"],
    edgeKinds: ["IS_PROXY_OF", "CALLS_RUNTIME", "SOURCE_DECLARED_IMPL"],
  },
];

// Node categories with icons
const nodeCategories = [
  {
    title: "Core Nodes",
    icon: <Boxes className="w-4 h-4" />,
    items: [
      { id: "contract", label: "Contracts", color: "#3b82f6", description: "Smart contracts" },
      { id: "address", label: "Addresses", color: "#64748b", description: "External addresses" },
      { id: "event", label: "Events", color: "#f43f5e", description: "Contract events (coming soon)" },
    ],
  },
  {
    title: "Code Nodes",
    icon: <FileCode className="w-4 h-4" />,
    items: [
      { id: "sourceFile", label: "Source Files", color: "#22c55e", description: "Verified/decompiled sources" },
      { id: "typeDef", label: "Type Definitions", color: "#8b5cf6", description: "Interfaces, libraries, etc." },
    ],
  },
];

// Edge categories with semantic grouping
const edgeCategories = [
  {
    title: "Contract Relationships",
    icon: <Layers className="w-4 h-4" />,
    items: [
      { id: "IS_PROXY_OF", label: "Proxy → Implementation", color: "#f97316", description: "EIP-1967/1167 proxy pattern" },
      { id: "SOURCE_DECLARED_IMPL", label: "Source Declared Impl", color: "#fb923c", description: "Implementation found in source" },
      { id: "CALLS_RUNTIME", label: "Runtime Calls", color: "#3b82f6", description: "Dynamic contract calls" },
      { id: "REFERENCES_ADDRESS", label: "Hardcoded References", color: "#64748b", description: "Addresses in source code" },
    ],
  },
  {
    title: "Factory / Deployment",
    icon: <GitBranch className="w-4 h-4" />,
    items: [
      { id: "CREATED_BY", label: "Created By", color: "#22c55e", description: "Contract deployment origin" },
      { id: "CREATED", label: "Created", color: "#22c55e", description: "Factory → created contracts" },
    ],
  },
  {
    title: "Source Relationships",
    icon: <FileCode className="w-4 h-4" />,
    items: [
      { id: "HAS_SOURCE_FILE", label: "Has Source", color: "#8b5cf6", description: "Contract source files" },
      { id: "DECLARES_TYPE", label: "Declares Type", color: "#ec4899", description: "Source file type declarations" },
      { id: "DEFINED_BY", label: "Defined By", color: "#06b6d4", description: "Contract main type" },
    ],
  },
  {
    title: "Type Inheritance",
    icon: <Boxes className="w-4 h-4" />,
    items: [
      { id: "EXTENDS_CONTRACT", label: "Extends", color: "#f43f5e", description: "Contract inheritance" },
      { id: "IMPLEMENTS_INTERFACE", label: "Implements", color: "#eab308", description: "Interface implementation" },
      { id: "USES_LIBRARY", label: "Uses Library", color: "#14b8a6", description: "Library usage" },
      { id: "USES_TYPE_INTERFACE", label: "Uses Type", color: "#a855f7", description: "Type references" },
    ],
  },
];

export default function ControlMenu({
  visibleNodeKinds,
  visibleEdgeKinds,
  onToggleNodeKind,
  onToggleEdgeKind,
  onApply,
  onPresetChange,
}: ControlMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"presets" | "nodes" | "edges">("presets");

  const applyPreset = (preset: ViewPreset) => {
    // Get all current items
    const allNodeIds = nodeCategories.flatMap((c) => c.items.map((i) => i.id));
    const allEdgeIds = edgeCategories.flatMap((c) => c.items.map((i) => i.id));

    // Toggle off nodes not in preset
    allNodeIds.forEach((id) => {
      const shouldBeVisible = preset.nodeKinds.includes(id);
      const isCurrentlyVisible = visibleNodeKinds.has(id);
      if (shouldBeVisible !== isCurrentlyVisible) {
        onToggleNodeKind(id);
      }
    });

    // Toggle off edges not in preset
    allEdgeIds.forEach((id) => {
      const shouldBeVisible = preset.edgeKinds.includes(id);
      const isCurrentlyVisible = visibleEdgeKinds.has(id);
      if (shouldBeVisible !== isCurrentlyVisible) {
        onToggleEdgeKind(id);
      }
    });

    onPresetChange?.(preset);
    onApply();
  };

  // Quick toggle helpers
  const allNodesVisible = nodeCategories.every((cat) =>
    cat.items.every((item) => visibleNodeKinds.has(item.id))
  );
  const allEdgesVisible = edgeCategories.every((cat) =>
    cat.items.every((item) => visibleEdgeKinds.has(item.id))
  );

  const toggleAllNodes = () => {
    const allIds = nodeCategories.flatMap((c) => c.items.map((i) => i.id));
    if (allNodesVisible) {
      // Keep at least contracts visible
      allIds.filter((id) => id !== "contract").forEach(onToggleNodeKind);
    } else {
      allIds.filter((id) => !visibleNodeKinds.has(id)).forEach(onToggleNodeKind);
    }
  };

  const toggleAllEdges = () => {
    const allIds = edgeCategories.flatMap((c) => c.items.map((i) => i.id));
    if (allEdgesVisible) {
      allIds.forEach(onToggleEdgeKind);
    } else {
      allIds.filter((id) => !visibleEdgeKinds.has(id)).forEach(onToggleEdgeKind);
    }
  };

  const toggleCategory = (category: typeof edgeCategories[0], isNodeCategory: boolean) => {
    const allVisible = category.items.every((item) =>
      isNodeCategory ? visibleNodeKinds.has(item.id) : visibleEdgeKinds.has(item.id)
    );
    category.items.forEach((item) => {
      if (allVisible || (!allVisible && !(isNodeCategory ? visibleNodeKinds.has(item.id) : visibleEdgeKinds.has(item.id)))) {
        isNodeCategory ? onToggleNodeKind(item.id) : onToggleEdgeKind(item.id);
      }
    });
  };

  return (
    <div
      className={cn(
        "absolute top-4 left-4 z-10 transition-all duration-300",
        isOpen ? "w-80" : "w-auto"
      )}
    >
      {/* Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="btn btn-secondary flex items-center gap-2 shadow-lg hover:shadow-xl transition-shadow"
        >
          <Settings className="w-5 h-5" />
          Filters
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Panel */}
      {isOpen && (
        <div className="bg-surface-900/95 backdrop-blur-md border border-surface-700 rounded-xl shadow-2xl animate-slide-in overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 bg-surface-800/50">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary-400" />
              <span className="font-semibold text-surface-100">Graph Filters</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-surface-700">
            <button
              onClick={() => setActiveTab("presets")}
              className={cn(
                "flex-1 py-2.5 text-xs font-medium transition-colors",
                activeTab === "presets"
                  ? "text-primary-400 border-b-2 border-primary-400 bg-surface-800/30"
                  : "text-surface-400 hover:text-surface-200 hover:bg-surface-800/20"
              )}
            >
              Presets
            </button>
            <button
              onClick={() => setActiveTab("nodes")}
              className={cn(
                "flex-1 py-2.5 text-xs font-medium transition-colors",
                activeTab === "nodes"
                  ? "text-primary-400 border-b-2 border-primary-400 bg-surface-800/30"
                  : "text-surface-400 hover:text-surface-200 hover:bg-surface-800/20"
              )}
            >
              Nodes
            </button>
            <button
              onClick={() => setActiveTab("edges")}
              className={cn(
                "flex-1 py-2.5 text-xs font-medium transition-colors",
                activeTab === "edges"
                  ? "text-primary-400 border-b-2 border-primary-400 bg-surface-800/30"
                  : "text-surface-400 hover:text-surface-200 hover:bg-surface-800/20"
              )}
            >
              Edges
            </button>
          </div>

          {/* Content */}
          <div className="p-4 max-h-[55vh] overflow-y-auto custom-scrollbar">
            {activeTab === "presets" ? (
              <div className="space-y-2">
                <p className="text-xs text-surface-500 mb-3">
                  Quick presets to focus on different aspects of the graph
                </p>
                {VIEW_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    className="w-full text-left p-3 rounded-lg border border-surface-700 hover:border-primary-500/50 hover:bg-surface-800/50 transition-all group"
                  >
                    <p className="font-medium text-surface-200 group-hover:text-primary-400 transition-colors">
                      {preset.name}
                    </p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      {preset.description}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-[10px] bg-surface-800 text-surface-400 px-1.5 py-0.5 rounded">
                        {preset.nodeKinds.length} nodes
                      </span>
                      <span className="text-[10px] bg-surface-800 text-surface-400 px-1.5 py-0.5 rounded">
                        {preset.edgeKinds.length} edges
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : activeTab === "nodes" ? (
              <>
                {/* Quick toggle for all nodes */}
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs text-surface-500">Quick toggle</span>
                  <button
                    onClick={toggleAllNodes}
                    className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    {allNodesVisible ? "Hide all" : "Show all"}
                  </button>
                </div>

                {/* Node categories */}
                {nodeCategories.map((category) => (
                  <div key={category.title} className="mb-5">
                    <button
                      onClick={() => toggleCategory(category, true)}
                      className="flex items-center gap-2 mb-3 text-xs font-semibold text-surface-400 uppercase tracking-wider hover:text-surface-200 transition-colors"
                    >
                      {category.icon}
                      <span>{category.title}</span>
                    </button>
                    <div className="space-y-2 pl-1">
                      {category.items.map((item) => (
                        <FilterCheckbox
                          key={item.id}
                          label={item.label}
                          description={item.description}
                          color={item.color}
                          checked={visibleNodeKinds.has(item.id)}
                          onChange={() => onToggleNodeKind(item.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <>
                {/* Quick toggle for all edges */}
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs text-surface-500">Quick toggle</span>
                  <button
                    onClick={toggleAllEdges}
                    className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    {allEdgesVisible ? "Hide all" : "Show all"}
                  </button>
                </div>

                {/* Edge categories */}
                {edgeCategories.map((category) => (
                  <div key={category.title} className="mb-5">
                    <button
                      onClick={() => toggleCategory(category, false)}
                      className="flex items-center gap-2 mb-3 text-xs font-semibold text-surface-400 uppercase tracking-wider hover:text-surface-200 transition-colors"
                    >
                      {category.icon}
                      <span>{category.title}</span>
                    </button>
                    <div className="space-y-2 pl-1">
                      {category.items.map((item) => (
                        <FilterCheckbox
                          key={item.id}
                          label={item.label}
                          description={item.description}
                          color={item.color}
                          checked={visibleEdgeKinds.has(item.id)}
                          onChange={() => onToggleEdgeKind(item.id)}
                          isEdge
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-4 py-3 border-t border-surface-700 bg-surface-800/30">
            <button onClick={onApply} className="btn btn-primary w-full flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Re-layout Graph
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterCheckbox({
  label,
  description,
  color,
  checked,
  onChange,
  isEdge,
}: {
  label: string;
  description?: string;
  color: string;
  checked: boolean;
  onChange: () => void;
  isEdge?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group p-2 rounded-lg hover:bg-surface-800/50 transition-colors">
      <div
        className={cn(
          "w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center transition-all",
          checked
            ? "border-primary-500 bg-primary-500/20"
            : "border-surface-600 group-hover:border-surface-500"
        )}
        onClick={onChange}
      >
        {checked && <Check className="w-3 h-3 text-primary-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isEdge ? (
            <div
              className="w-5 h-0.5 rounded-full"
              style={{ backgroundColor: color }}
            />
          ) : (
            <div
              className="w-3.5 h-3.5 rounded-full"
              style={{ backgroundColor: color, opacity: 0.8 }}
            />
          )}
          <span className="text-sm text-surface-200 group-hover:text-surface-100 transition-colors">
            {label}
          </span>
        </div>
        {description && (
          <p className="text-xs text-surface-500 mt-0.5 ml-7">{description}</p>
        )}
      </div>
    </label>
  );
}
