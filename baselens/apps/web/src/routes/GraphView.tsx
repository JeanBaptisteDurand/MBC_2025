import { useState, useCallback, useEffect, useMemo } from "react";
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
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { Bot, Loader, AlertCircle } from "lucide-react";
import { getGraphData } from "../api/endpoints";
import type { Node, Edge, GraphData, ContractNode as ContractNodeData } from "@baselens/core";
import ContractNode from "../components/nodes/ContractNode";
import SourceFileNode from "../components/nodes/SourceFileNode";
import TypeDefNode from "../components/nodes/TypeDefNode";
import AddressNode from "../components/nodes/AddressNode";
import EventNode from "../components/nodes/EventNode";
import RightDrawer from "../components/RightDrawer";
import Legend from "../components/Legend";
import ControlMenu from "../components/ControlMenu";
import AiInterfaceDrawer from "../components/AiInterfaceDrawer";
import RagChatWidget from "../components/RagChatWidget";
import SourceCodeModal from "../components/SourceCodeModal";
import TypeDefinitionModal from "../components/TypeDefinitionModal";
import ExplanationModal from "../components/ExplanationModal";

// Node type components for React Flow
const nodeTypes = {
  contract: ContractNode,
  sourceFile: SourceFileNode,
  typeDef: TypeDefNode,
  address: AddressNode,
  event: EventNode,
};

// Edge colors matching our logic
const EDGE_COLORS: Record<string, string> = {
  IS_PROXY_OF: "#f97316",
  CALLS_RUNTIME: "#3b82f6",
  CREATED_BY: "#22c55e",
  CREATED: "#22c55e",
  HAS_SOURCE_FILE: "#8b5cf6",
  DECLARES_TYPE: "#ec4899",
  IMPLEMENTS_INTERFACE: "#eab308",
  EXTENDS_CONTRACT: "#f43f5e",
  USES_LIBRARY: "#14b8a6",
  USES_TYPE_INTERFACE: "#a855f7",
  REFERENCES_ADDRESS: "#64748b",
  SOURCE_DECLARED_IMPL: "#fb923c",
};

// Layout configuration - tuned for visual clarity
const LAYOUT_CONFIG = {
  CONTRACT_HORIZONTAL_SPACING: 450,
  CONTRACT_VERTICAL_SPACING: 350,
  SOURCE_FILE_OFFSET_X: 280,
  SOURCE_FILE_OFFSET_Y: 60,
  TYPE_DEF_OFFSET_X: 60,
  TYPE_DEF_OFFSET_Y: 90,
  ADDRESS_OFFSET_X: -320,
  ADDRESS_OFFSET_Y: -50,
  PROXY_IMPL_OFFSET_X: 350,
  PROXY_IMPL_OFFSET_Y: 50,
};

// Intelligent layout algorithm
function computeSmartLayout(
  graphData: GraphData,
  visibleNodeKinds: Set<string>,
  visibleEdgeKinds: Set<string>
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  // When "address" is not visible but "contract" is, we're in a contracts-focused view
  const hideWallets = !visibleNodeKinds.has("address") && visibleNodeKinds.has("contract");

  // Detect contract-only mode
  const isContractOnlyMode = visibleNodeKinds.has("contract") &&
    !visibleNodeKinds.has("sourceFile") &&
    !visibleNodeKinds.has("typeDef") &&
    !visibleNodeKinds.has("address");

  // Collect addresses referenced by REFERENCES_ADDRESS edges when in contract-only mode
  const referencedAddresses = new Set<string>();
  if (isContractOnlyMode) {
    for (const edge of graphData.edges) {
      if (edge.kind === "REFERENCES_ADDRESS" && edge.to.startsWith("address:")) {
        const address = edge.to.replace("address:", "");
        referencedAddresses.add(address);
      }
    }
  }

  // Filter nodes based on visibility settings
  const filteredNodes = graphData.nodes.filter((node) => {
    // Handle address nodes - show deployer wallets and referenced addresses when contracts are visible
    if (node.kind === "address") {
      if (visibleNodeKinds.has("address")) {
        return true;
      }
      // Always include deployer addresses when contracts are visible
      if (
        visibleNodeKinds.has("contract") &&
        "label" in node &&
        typeof node.label === "string" &&
        node.label.startsWith("Deployer Wallet")
      ) {
        return true;
      }
      // Include addresses referenced by REFERENCES_ADDRESS edges in contract-only mode
      if (isContractOnlyMode && "address" in node && referencedAddresses.has(node.address)) {
        return true;
      }
      return false;
    }

    // Handle contract nodes
    if (node.kind === "contract") {
      if (!visibleNodeKinds.has("contract")) {
        return false;
      }
      // EOA are wallets, not real contracts - always hide them in contracts-focused views
      if (hideWallets && "kindOnChain" in node && (node as ContractNodeData).kindOnChain === "EOA") {
        return false;
      }
      // Show all real contracts (PROXY, CONTRACT_SIMPLE, IMPLEMENTATION)
      return true;
    }

    // For all other node kinds, use standard visibility check
    return visibleNodeKinds.has(node.kind);
  });
  const nodeIds = new Set(filteredNodes.map((n) => n.id));

  // Build adjacency maps for relationships
  const proxyToImpl = new Map<string, string>();
  const contractToSource = new Map<string, string[]>();
  const sourceToTypes = new Map<string, string[]>();
  const contractToCreator = new Map<string, string>();
  const creatorToContracts = new Map<string, string[]>();
  const contractReferences = new Map<string, string[]>();

  for (const edge of graphData.edges) {
    const from = edge.from;
    const to = edge.to;

    if (edge.kind === "IS_PROXY_OF") {
      proxyToImpl.set(from, to);
    } else if (edge.kind === "HAS_SOURCE_FILE") {
      const sources = contractToSource.get(from) || [];
      sources.push(to);
      contractToSource.set(from, sources);
    } else if (edge.kind === "DECLARES_TYPE") {
      const types = sourceToTypes.get(from) || [];
      types.push(to);
      sourceToTypes.set(from, types);
    } else if (edge.kind === "CREATED_BY") {
      contractToCreator.set(from, to);
      const contracts = creatorToContracts.get(to) || [];
      contracts.push(from);
      creatorToContracts.set(to, contracts);
    } else if (edge.kind === "REFERENCES_ADDRESS") {
      const refs = contractReferences.get(from) || [];
      refs.push(to);
      contractReferences.set(from, refs);
    }
  }

  // Find root contract
  const contracts = filteredNodes.filter((n) => n.kind === "contract") as (Node & { kind: "contract" })[];
  const rootContract = contracts.find((c) => (c as ContractNodeData).isRoot);

  // Position tracking
  const nodePositions = new Map<string, { x: number; y: number }>();
  const positionedNodes = new Set<string>();

  // Helper to position a contract and its related nodes
  function positionContractCluster(
    contractId: string,
    baseX: number,
    baseY: number,
    level: number = 0
  ) {
    if (positionedNodes.has(contractId)) return;
    positionedNodes.add(contractId);

    // Position the contract
    nodePositions.set(contractId, { x: baseX, y: baseY });

    // Position source files to the right
    const sourceFiles = contractToSource.get(contractId) || [];
    sourceFiles.forEach((sourceId, idx) => {
      if (!nodeIds.has(sourceId)) return;
      const sourceX = baseX + LAYOUT_CONFIG.SOURCE_FILE_OFFSET_X;
      const sourceY = baseY + idx * LAYOUT_CONFIG.SOURCE_FILE_OFFSET_Y;
      nodePositions.set(sourceId, { x: sourceX, y: sourceY });
      positionedNodes.add(sourceId);

      // Position type definitions below source files
      const types = sourceToTypes.get(sourceId) || [];
      types.forEach((typeId, typeIdx) => {
        if (!nodeIds.has(typeId)) return;
        const typeX = sourceX + LAYOUT_CONFIG.TYPE_DEF_OFFSET_X + (typeIdx % 3) * 150;
        const typeY = sourceY + LAYOUT_CONFIG.TYPE_DEF_OFFSET_Y + Math.floor(typeIdx / 3) * 100;
        nodePositions.set(typeId, { x: typeX, y: typeY });
        positionedNodes.add(typeId);
      });
    });

    // Position implementation if this is a proxy (to the right)
    const implId = proxyToImpl.get(contractId);
    if (implId && !positionedNodes.has(implId) && nodeIds.has(implId)) {
      positionContractCluster(
        implId,
        baseX + LAYOUT_CONFIG.PROXY_IMPL_OFFSET_X,
        baseY + LAYOUT_CONFIG.PROXY_IMPL_OFFSET_Y,
        level + 1
      );
    }

    // Position creator address to the left
    const creatorId = contractToCreator.get(contractId);
    if (creatorId && !positionedNodes.has(creatorId) && nodeIds.has(creatorId)) {
      nodePositions.set(creatorId, {
        x: baseX + LAYOUT_CONFIG.ADDRESS_OFFSET_X,
        y: baseY + LAYOUT_CONFIG.ADDRESS_OFFSET_Y,
      });
      positionedNodes.add(creatorId);
    }

    // Position referenced addresses below
    const refs = contractReferences.get(contractId) || [];
    refs.forEach((refId, idx) => {
      if (!positionedNodes.has(refId) && nodeIds.has(refId)) {
        nodePositions.set(refId, {
          x: baseX + (idx % 3) * 180 - 180,
          y: baseY + LAYOUT_CONFIG.CONTRACT_VERTICAL_SPACING + Math.floor(idx / 3) * 100,
        });
        positionedNodes.add(refId);
      }
    });
  }

  // Start layout from root contract
  let currentY = 0;

  if (rootContract) {
    positionContractCluster(rootContract.id, 0, currentY);
    currentY += LAYOUT_CONFIG.CONTRACT_VERTICAL_SPACING;
  }

  // Position remaining contracts in rows
  const remainingContracts = contracts.filter((c) => !positionedNodes.has(c.id));

  // Group by: proxies, factories, implementations, simple contracts
  const proxies = remainingContracts.filter((c) => (c as ContractNodeData).kindOnChain === "PROXY");
  const factories = remainingContracts.filter((c) => (c as ContractNodeData).isFactory);
  const impls = remainingContracts.filter((c) => (c as ContractNodeData).kindOnChain === "IMPLEMENTATION");
  const others = remainingContracts.filter(
    (c) =>
      (c as ContractNodeData).kindOnChain !== "PROXY" &&
      !(c as ContractNodeData).isFactory &&
      (c as ContractNodeData).kindOnChain !== "IMPLEMENTATION"
  );

  // Layout each group
  const groups = [proxies, factories, impls, others];

  for (const group of groups) {
    let col = 0;
    for (const contract of group) {
      if (!positionedNodes.has(contract.id)) {
        const x = col * LAYOUT_CONFIG.CONTRACT_HORIZONTAL_SPACING;
        positionContractCluster(contract.id, x, currentY);
        col++;
        if (col >= 4) {
          col = 0;
          currentY += LAYOUT_CONFIG.CONTRACT_VERTICAL_SPACING;
        }
      }
    }
    if (col > 0) {
      currentY += LAYOUT_CONFIG.CONTRACT_VERTICAL_SPACING;
    }
  }

  // Position any remaining unpositioned nodes (addresses, etc.)
  const allFilteredIds = new Set(filteredNodes.map((n) => n.id));
  let remainingCol = 0;
  for (const node of filteredNodes) {
    if (!positionedNodes.has(node.id)) {
      nodePositions.set(node.id, {
        x: remainingCol * 200,
        y: currentY,
      });
      remainingCol++;
      if (remainingCol >= 6) {
        remainingCol = 0;
        currentY += 150;
      }
    }
  }

  // Build final nodes array
  const flowNodes: FlowNode[] = filteredNodes.map((node) => {
    const pos = nodePositions.get(node.id) || { x: 0, y: 0 };
    return {
      id: node.id,
      type: node.kind,
      position: pos,
      data: node,
    };
  });

  // Build edges with proper styling based on edge type
  // When in "contract only" mode, always include REFERENCES_ADDRESS edges
  const flowEdges: FlowEdge[] = graphData.edges
    .filter(
      (edge) => {
        // Always show REFERENCES_ADDRESS edges in contract-only mode
        const shouldShow = visibleEdgeKinds.has(edge.kind) ||
          (isContractOnlyMode && edge.kind === "REFERENCES_ADDRESS");

        return shouldShow && nodeIds.has(edge.from) && nodeIds.has(edge.to);
      }
    )
    .map((edge) => {
      const color = EDGE_COLORS[edge.kind] || "#6b7280";
      const isImportant = ["IS_PROXY_OF", "CALLS_RUNTIME", "CREATED_BY", "CREATED"].includes(edge.kind);
      const isHierarchy = ["EXTENDS_CONTRACT", "IMPLEMENTS_INTERFACE", "USES_LIBRARY"].includes(edge.kind);

      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: formatEdgeLabel(edge.kind),
        type: isHierarchy ? "smoothstep" : "default",
        animated: edge.kind === "IS_PROXY_OF" || edge.kind === "CALLS_RUNTIME",
        style: {
          stroke: color,
          strokeWidth: isImportant ? 2 : 1,
          opacity: isImportant ? 1 : 0.7,
        },
        labelStyle: {
          fontSize: 9,
          fill: "#d1d5db",
          fontWeight: isImportant ? 600 : 400,
        },
        labelBgStyle: {
          fill: "#111827",
          fillOpacity: 0.95,
          rx: 4,
          ry: 4,
        },
        labelBgPadding: [6, 3] as [number, number],
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: isImportant ? 18 : 14,
          height: isImportant ? 18 : 14,
        },
      };
    });

  return { nodes: flowNodes, edges: flowEdges };
}

function formatEdgeLabel(kind: string): string {
  const labels: Record<string, string> = {
    IS_PROXY_OF: "→ impl",
    CALLS_RUNTIME: "calls",
    CREATED_BY: "deployed by",
    CREATED: "deployed",
    HAS_SOURCE_FILE: "source",
    DECLARES_TYPE: "declares",
    DEFINED_BY: "defines",
    IMPLEMENTS_INTERFACE: "implements",
    EXTENDS_CONTRACT: "extends",
    USES_LIBRARY: "uses lib",
    USES_TYPE_INTERFACE: "uses",
    REFERENCES_ADDRESS: "refs",
    SOURCE_DECLARED_IMPL: "→ source impl",
  };
  return labels[kind] || kind.replace(/_/g, " ").toLowerCase();
}

export default function GraphView() {
  const { analysisId } = useParams<{ analysisId: string }>();

  // State
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [visibleNodeKinds, setVisibleNodeKinds] = useState<Set<string>>(
    new Set(["contract", "sourceFile", "typeDef", "address", "event"])
  );
  const [visibleEdgeKinds, setVisibleEdgeKinds] = useState<Set<string>>(
    new Set([
      "IS_PROXY_OF",
      "CALLS_RUNTIME",
      "CREATED_BY",
      "CREATED",
      "HAS_SOURCE_FILE",
      "DECLARES_TYPE",
      "IMPLEMENTS_INTERFACE",
      "EXTENDS_CONTRACT",
      "USES_LIBRARY",
      "USES_TYPE_INTERFACE",
      "REFERENCES_ADDRESS",
      "SOURCE_DECLARED_IMPL",
    ])
  );
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [sourceCodeModal, setSourceCodeModal] = useState<{
    isOpen: boolean;
    address: string;
    filePath?: string;
  }>({ isOpen: false, address: "" });
  const [typeDefModal, setTypeDefModal] = useState<{
    isOpen: boolean;
    address: string;
    typeName: string;
    typeKind: string;
  }>({ isOpen: false, address: "", typeName: "", typeKind: "" });
  const [explanationModal, setExplanationModal] = useState<{
    isOpen: boolean;
    address: string;
  }>({ isOpen: false, address: "" });
  const [layoutKey, setLayoutKey] = useState(0);

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

  // Compute layout when data or filters change
  const computedLayout = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [] };
    return computeSmartLayout(graphData, visibleNodeKinds, visibleEdgeKinds);
  }, [graphData, visibleNodeKinds, visibleEdgeKinds, layoutKey]);

  // Update flow when computed layout changes
  useEffect(() => {
    setNodes(computedLayout.nodes);
    setEdges(computedLayout.edges);
  }, [computedLayout, setNodes, setEdges]);

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

  // Force re-layout
  const applyLayout = useCallback(() => {
    setLayoutKey((k) => k + 1);
  }, []);

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
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: "smoothstep",
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#374151" gap={20} size={1} />
        <Controls className="!bg-surface-900/80 !border-surface-700 !shadow-lg" />
        <MiniMap
          className="!bg-surface-900/80 !border-surface-700 !shadow-lg"
          nodeColor={(node) => {
            const colors: Record<string, string> = {
              contract: "#3b82f6",
              sourceFile: "#22c55e",
              typeDef: "#8b5cf6",
              address: "#64748b",
              event: "#f43f5e",
            };
            return colors[node.type || ""] || "#6b7280";
          }}
          maskColor="rgba(0, 0, 0, 0.7)"
          pannable
          zoomable
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
        onApply={applyLayout}
      />

      {/* Graph Stats Badge */}
      {graphData && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-4 py-2 bg-surface-900/90 backdrop-blur-md border border-surface-700 rounded-full shadow-lg">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-xs text-surface-300">
              {computedLayout.nodes.length} nodes
            </span>
          </div>
          <div className="w-px h-4 bg-surface-700" />
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-surface-300">
              {computedLayout.edges.length} edges
            </span>
          </div>
          {graphData.stats && (
            <>
              <div className="w-px h-4 bg-surface-700" />
              <span className="text-xs text-surface-500">
                {graphData.stats.verifiedContracts} verified · {graphData.stats.decompiledContracts} decompiled
              </span>
            </>
          )}
        </div>
      )}

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
        onViewSource={(address, filePath) =>
          setSourceCodeModal({ isOpen: true, address, filePath })
        }
        onViewExplanation={(address) =>
          setExplanationModal({ isOpen: true, address })
        }
        onViewTypeDefinition={(address, typeName, typeKind) =>
          setTypeDefModal({ isOpen: true, address, typeName, typeKind })
        }
      />

      {/* AI Interface Drawer */}
      <AiInterfaceDrawer
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
        analysisId={analysisId!}
      />

      {/* RAG Chat Widget */}
      <RagChatWidget analysisId={analysisId!} graphData={graphData} />

      {/* Source Code Modal */}
      <SourceCodeModal
        isOpen={sourceCodeModal.isOpen}
        onClose={() => setSourceCodeModal({ isOpen: false, address: "" })}
        analysisId={analysisId!}
        address={sourceCodeModal.address}
        filePath={sourceCodeModal.filePath}
      />

      {/* Type Definition Modal */}
      <TypeDefinitionModal
        isOpen={typeDefModal.isOpen}
        onClose={() => setTypeDefModal({ isOpen: false, address: "", typeName: "", typeKind: "" })}
        analysisId={analysisId!}
        address={typeDefModal.address}
        typeName={typeDefModal.typeName}
        typeKind={typeDefModal.typeKind}
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
