import { useState } from "react";
import { Settings, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { cn } from "../utils/cn";

interface ControlMenuProps {
  visibleNodeKinds: Set<string>;
  visibleEdgeKinds: Set<string>;
  onToggleNodeKind: (kind: string) => void;
  onToggleEdgeKind: (kind: string) => void;
  onApply: () => void;
}

const nodeKinds = [
  { id: "contract", label: "Contracts", color: "#3b82f6" },
  { id: "sourceFile", label: "Source Files", color: "#22c55e" },
  { id: "typeDef", label: "Type Definitions", color: "#8b5cf6" },
];

const edgeKinds = [
  { id: "IS_PROXY_OF", label: "Proxy → Implementation", color: "#f97316" },
  { id: "CALLS_RUNTIME", label: "Runtime Calls", color: "#3b82f6" },
  { id: "CREATED_BY", label: "Created By", color: "#22c55e" },
  { id: "CREATED", label: "Created", color: "#22c55e" },
  { id: "HAS_SOURCE_FILE", label: "Has Source File", color: "#8b5cf6" },
  { id: "DECLARES_TYPE", label: "Declares Type", color: "#ec4899" },
  { id: "DEFINED_BY", label: "Defined By", color: "#06b6d4" },
  { id: "EXTENDS_CONTRACT", label: "Extends Contract", color: "#f43f5e" },
  { id: "IMPLEMENTS_INTERFACE", label: "Implements Interface", color: "#eab308" },
  { id: "USES_LIBRARY", label: "Uses Library", color: "#14b8a6" },
  { id: "USES_TYPE_INTERFACE", label: "Uses Type/Interface", color: "#a855f7" },
];

export default function ControlMenu({
  visibleNodeKinds,
  visibleEdgeKinds,
  onToggleNodeKind,
  onToggleEdgeKind,
  onApply,
}: ControlMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={cn(
        "absolute top-4 left-4 z-10 transition-all duration-300",
        isOpen ? "w-72" : "w-auto"
      )}
    >
      {/* Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="btn btn-secondary flex items-center gap-2 shadow-lg"
        >
          <Settings className="w-5 h-5" />
          Filters
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Panel */}
      {isOpen && (
        <div className="bg-surface-900/95 backdrop-blur-sm border border-surface-700 rounded-xl shadow-lg animate-slide-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-surface-400" />
              <span className="font-medium">Filters</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 max-h-[60vh] overflow-y-auto">
            {/* Node Types */}
            <div className="mb-6">
              <h4 className="text-xs font-semibold text-surface-500 uppercase mb-3">
                Node Types
              </h4>
              <div className="space-y-2">
                {nodeKinds.map((kind) => (
                  <FilterCheckbox
                    key={kind.id}
                    label={kind.label}
                    color={kind.color}
                    checked={visibleNodeKinds.has(kind.id)}
                    onChange={() => onToggleNodeKind(kind.id)}
                  />
                ))}
              </div>
            </div>

            {/* Edge Types */}
            <div className="mb-6">
              <h4 className="text-xs font-semibold text-surface-500 uppercase mb-3">
                Edge Types
              </h4>
              <div className="space-y-2">
                {edgeKinds.map((kind) => (
                  <FilterCheckbox
                    key={kind.id}
                    label={kind.label}
                    color={kind.color}
                    checked={visibleEdgeKinds.has(kind.id)}
                    onChange={() => onToggleEdgeKind(kind.id)}
                    isEdge
                  />
                ))}
              </div>
            </div>

            {/* Apply Button */}
            <button
              onClick={onApply}
              className="btn btn-primary w-full"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterCheckbox({
  label,
  color,
  checked,
  onChange,
  isEdge,
}: {
  label: string;
  color: string;
  checked: boolean;
  onChange: () => void;
  isEdge?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div
        className={cn(
          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
          checked
            ? "bg-primary-600 border-primary-600"
            : "border-surface-600 group-hover:border-surface-500"
        )}
        onClick={onChange}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <div className="flex items-center gap-2 flex-1">
        {isEdge ? (
          <div
            className="w-4 h-0.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        ) : (
          <div
            className="w-3 h-3 rounded-full border-2"
            style={{ borderColor: color }}
          />
        )}
        <span className="text-sm text-surface-300 group-hover:text-surface-100 transition-colors">
          {label}
        </span>
      </div>
    </label>
  );
}

