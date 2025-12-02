import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node as FlowNode,
  type Edge as FlowEdge,
} from "reactflow";
import "reactflow/dist/style.css";
import { Bot, Loader, AlertCircle } from "lucide-react";
import { getGraphData, getAnalysisSummary } from "../api/endpoints";
import type { Node, Edge, GraphData } from "@baselens/core";
import ContractNode from "../components/nodes/ContractNode";
import SourceFileNode from "../components/nodes/SourceFileNode";
import TypeDefNode from "../components/nodes/TypeDefNode";
import RightDrawer from "../components/RightDrawer";
import Legend from "../components/Legend";
import ControlMenu from "../components/ControlMenu";
import AiInterfaceDrawer from "../components/AiInterfaceDrawer";
import RagChatWidget from "../components/RagChatWidget";
import SourceCodeModal from "../components/SourceCodeModal";
import ExplanationModal from "../components/ExplanationModal";

// Node type components
const nodeTypes = {
  contract: ContractNode,
  sourceFile: SourceFileNode,
  typeDef: TypeDefNode,
};

// Transform graph data to React Flow format
function transformToFlowData(
  graphData: GraphData,
  visibleNodeKinds: Set<string>,
  visibleEdgeKinds: Set<string>
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const filteredNodes = graphData.nodes.filter((node) =>
    visibleNodeKinds.has(node.kind)
  );

  const nodeIds = new Set(filteredNodes.map((n) => n.id));

  const nodes: FlowNode[] = filteredNodes.map((node, index) => {
    // Simple grid layout
    const col = index % 5;
    const row = Math.floor(index / 5);

    return {
      id: node.id,
      type: node.kind,
      position: { x: col * 300, y: row * 200 },
      data: node,
    };
  });

  const edges: FlowEdge[] = graphData.edges
    .filter(
      (edge) =>
        visibleEdgeKinds.has(edge.kind) &&
        nodeIds.has(edge.from) &&
        nodeIds.has(edge.to)
    )
    .map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.kind.replace(/_/g, " "),
      type: "smoothstep",
      animated: edge.kind === "IS_PROXY_OF",
      style: { stroke: getEdgeColor(edge.kind) },
      labelStyle: { fontSize: 10, fill: "#9ca3af" },
      labelBgStyle: { fill: "#1f2937", fillOpacity: 0.8 },
    }));

  return { nodes, edges };
}

function getEdgeColor(kind: string): string {
  const colors: Record<string, string> = {
    IS_PROXY_OF: "#f97316",
    CALLS_RUNTIME: "#3b82f6",
    CREATED_BY: "#22c55e",
    CREATED: "#22c55e",
    HAS_SOURCE_FILE: "#8b5cf6",
    DECLARES_TYPE: "#ec4899",
    DEFINED_BY: "#06b6d4",
    IMPLEMENTS_INTERFACE: "#eab308",
    EXTENDS_CONTRACT: "#f43f5e",
    USES_LIBRARY: "#14b8a6",
    USES_TYPE_INTERFACE: "#a855f7",
  };
  return colors[kind] || "#6b7280";
}

export default function GraphView() {
  const { analysisId } = useParams<{ analysisId: string }>();

  // State
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [visibleNodeKinds, setVisibleNodeKinds] = useState<Set<string>>(
    new Set(["contract", "sourceFile", "typeDef"])
  );
  const [visibleEdgeKinds, setVisibleEdgeKinds] = useState<Set<string>>(
    new Set([
      "IS_PROXY_OF",
      "CALLS_RUNTIME",
      "CREATED_BY",
      "CREATED",
      "HAS_SOURCE_FILE",
      "DECLARES_TYPE",
      "DEFINED_BY",
      "IMPLEMENTS_INTERFACE",
      "EXTENDS_CONTRACT",
      "USES_LIBRARY",
      "USES_TYPE_INTERFACE",
    ])
  );
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [sourceCodeModal, setSourceCodeModal] = useState<{
    isOpen: boolean;
    address: string;
  }>({ isOpen: false, address: "" });
  const [explanationModal, setExplanationModal] = useState<{
    isOpen: boolean;
    address: string;
  }>({ isOpen: false, address: "" });

  // Fetch graph data
  const {
    data: graphData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["graphData", analysisId],
    queryFn: () => getGraphData(analysisId!),
    enabled: !!analysisId,
    staleTime: Infinity,
  });

  // Update flow when graph data or filters change
  const updateFlow = useCallback(() => {
    if (!graphData) return;

    const { nodes: flowNodes, edges: flowEdges } = transformToFlowData(
      graphData,
      visibleNodeKinds,
      visibleEdgeKinds
    );

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [graphData, visibleNodeKinds, visibleEdgeKinds, setNodes, setEdges]);

  // Effect to update flow when data changes
  useState(() => {
    updateFlow();
  });

  // Update whenever graphData or filters change
  if (graphData && nodes.length === 0) {
    updateFlow();
  }

  // Handle node click
  const onNodeClick = useCallback((_: React.MouseEvent, node: FlowNode) => {
    setSelectedNode(node.data as Node);
  }, []);

  // Handle filter changes
  const toggleNodeKind = (kind: string) => {
    setVisibleNodeKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  };

  const toggleEdgeKind = (kind: string) => {
    setVisibleEdgeKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin text-primary-500 mx-auto mb-4" />
          <p className="text-surface-400">Loading graph data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-surface-400">Failed to load graph data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] relative">
      {/* React Flow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: "smoothstep",
        }}
      >
        <Background color="#374151" gap={20} />
        <Controls className="!bg-surface-900/80 !border-surface-700" />
        <MiniMap
          className="!bg-surface-900/80 !border-surface-700"
          nodeColor={(node) => {
            const colors: Record<string, string> = {
              contract: "#3b82f6",
              sourceFile: "#22c55e",
              typeDef: "#8b5cf6",
            };
            return colors[node.type || ""] || "#6b7280";
          }}
        />
      </ReactFlow>

      {/* Legend */}
      <Legend />

      {/* Control Menu */}
      <ControlMenu
        visibleNodeKinds={visibleNodeKinds}
        visibleEdgeKinds={visibleEdgeKinds}
        onToggleNodeKind={toggleNodeKind}
        onToggleEdgeKind={toggleEdgeKind}
        onApply={updateFlow}
      />

      {/* AI Button */}
      <button
        onClick={() => setIsAiDrawerOpen(true)}
        className="absolute top-4 right-4 btn btn-accent flex items-center gap-2 shadow-lg"
      >
        <Bot className="w-5 h-5" />
        AI Analysis
      </button>

      {/* Right Drawer (Node Details) */}
      <RightDrawer
        node={selectedNode}
        analysisId={analysisId!}
        onClose={() => setSelectedNode(null)}
        onViewSource={(address) =>
          setSourceCodeModal({ isOpen: true, address })
        }
        onViewExplanation={(address) =>
          setExplanationModal({ isOpen: true, address })
        }
      />

      {/* AI Interface Drawer */}
      <AiInterfaceDrawer
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
        analysisId={analysisId!}
      />

      {/* RAG Chat Widget */}
      <RagChatWidget analysisId={analysisId!} />

      {/* Source Code Modal */}
      <SourceCodeModal
        isOpen={sourceCodeModal.isOpen}
        onClose={() => setSourceCodeModal({ isOpen: false, address: "" })}
        analysisId={analysisId!}
        address={sourceCodeModal.address}
      />

      {/* Explanation Modal */}
      <ExplanationModal
        isOpen={explanationModal.isOpen}
        onClose={() => setExplanationModal({ isOpen: false, address: "" })}
        analysisId={analysisId!}
        address={explanationModal.address}
      />
    </div>
  );
}

