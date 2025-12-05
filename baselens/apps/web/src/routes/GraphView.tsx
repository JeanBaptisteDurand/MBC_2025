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

// Circular layout configuration
const CIRCULAR_LAYOUT_CONFIG = {
  // Base radius for contract circle (will be scaled based on number of contracts)
  BASE_CONTRACT_RADIUS: 800,
  // Minimum radius for contract circle
  MIN_CONTRACT_RADIUS: 6000,
  // Maximum radius for contract circle
  MAX_CONTRACT_RADIUS: 24000,
  // Inner orbit radius for source files and deployer wallets (relative to contract position)
  INNER_ORBIT_RADIUS: 720,
  // Outer orbit radius for type definitions (relative to contract position)
  OUTER_ORBIT_RADIUS: 1280,
  // Outer circle radius for EOA wallets (absolute from center)
  EOA_ORBIT_RADIUS: 3200,
  // Spacing between nodes on the same orbit
  MIN_NODE_SPACING: 400,
};

// Helper function to calculate position on a circle
function getPositionOnCircle(
  centerX: number,
  centerY: number,
  radius: number,
  angle: number
): { x: number; y: number } {
  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle),
  };
}

// Calculate optimal radius for contract circle based on number of contracts
function calculateContractCircleRadius(numContracts: number): number {
  if (numContracts === 0) return CIRCULAR_LAYOUT_CONFIG.MIN_CONTRACT_RADIUS;
  if (numContracts === 1) return CIRCULAR_LAYOUT_CONFIG.MIN_CONTRACT_RADIUS;

  // Calculate circumference needed: numContracts * MIN_NODE_SPACING
  const circumference = numContracts * CIRCULAR_LAYOUT_CONFIG.MIN_NODE_SPACING;
  // Calculate radius from circumference: r = C / (2 * π)
  const calculatedRadius = circumference / (2 * Math.PI);

  // Clamp between min and max
  return Math.max(
    CIRCULAR_LAYOUT_CONFIG.MIN_CONTRACT_RADIUS,
    Math.min(calculatedRadius, CIRCULAR_LAYOUT_CONFIG.MAX_CONTRACT_RADIUS)
  );
}

// Circular layout algorithm
function computeSmartLayout(
  graphData: GraphData,
  visibleNodeKinds: Set<string>,
  visibleEdgeKinds: Set<string>,
  hiddenContractIds: Set<string> = new Set()
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

  // Build adjacency maps
  const contractToSource = new Map<string, string[]>();
  const sourceToTypes = new Map<string, string[]>();
  const contractToCreator = new Map<string, string>();
  const contractReferences = new Map<string, string[]>();
  const contractToTypes = new Map<string, string[]>(); // Types defined by contract (via source)
  const proxyToImpl = new Map<string, string>();
  const implToProxy = new Map<string, string[]>();
  const contractToEoaWallets = new Map<string, string[]>(); // EOA wallets related to contract

  for (const edge of graphData.edges) {
    const from = edge.from;
    const to = edge.to;

    if (edge.kind === "IS_PROXY_OF") {
      proxyToImpl.set(from, to);
      const proxies = implToProxy.get(to) || [];
      proxies.push(from);
      implToProxy.set(to, proxies);
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
    } else if (edge.kind === "REFERENCES_ADDRESS") {
      const refs = contractReferences.get(from) || [];
      refs.push(to);
      contractReferences.set(from, refs);
      // Check if this is an EOA wallet
      if (to.startsWith("address:")) {
        const eoaWallets = contractToEoaWallets.get(from) || [];
        eoaWallets.push(to);
        contractToEoaWallets.set(from, eoaWallets);
      }
    }
  }

  // Build contractToTypes from sourceToTypes (after all edges are processed)
  for (const [sourceId, types] of sourceToTypes.entries()) {
    const contractId = Array.from(contractToSource.entries()).find(([_, sources]) =>
      sources.includes(sourceId)
    )?.[0];
    if (contractId) {
      const contractTypes = contractToTypes.get(contractId) || [];
      types.forEach(typeId => {
        if (!contractTypes.includes(typeId)) {
          contractTypes.push(typeId);
        }
      });
      contractToTypes.set(contractId, contractTypes);
    }
  }

  // Find all children nodes of hidden contracts (recursively)
  const hiddenNodeIds = new Set<string>();
  const findChildren = (contractId: string) => {
    hiddenNodeIds.add(contractId);

    // Add source files
    const sources = contractToSource.get(contractId) || [];
    sources.forEach((sourceId) => {
      hiddenNodeIds.add(sourceId);
      // Add type definitions from source files
      const types = sourceToTypes.get(sourceId) || [];
      types.forEach((typeId) => hiddenNodeIds.add(typeId));
    });

    // Add creator address
    const creatorId = contractToCreator.get(contractId);
    if (creatorId) {
      hiddenNodeIds.add(creatorId);
    }

    // Add referenced addresses
    const refs = contractReferences.get(contractId) || [];
    refs.forEach((refId) => hiddenNodeIds.add(refId));

    // Add proxy if this is an implementation
    const proxies = implToProxy.get(contractId) || [];
    proxies.forEach((proxyId) => {
      if (!hiddenContractIds.has(proxyId)) {
        // Only hide proxy if it's not explicitly hidden (to avoid circular hiding)
      }
    });

    // Add implementation if this is a proxy
    const implId = proxyToImpl.get(contractId);
    if (implId && hiddenContractIds.has(contractId)) {
      // If proxy is hidden, also hide its implementation
      if (!hiddenContractIds.has(implId)) {
        findChildren(implId);
      }
    }
  };

  // Build set of all hidden nodes (contracts + their children)
  hiddenContractIds.forEach((contractId) => {
    findChildren(contractId);
  });

  // Filter nodes based on visibility settings
  const filteredNodes = graphData.nodes.filter((node) => {
    // Skip if this node is hidden (contract or its child)
    if (hiddenNodeIds.has(node.id)) {
      return false;
    }

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

  // Separate contracts from EOA contracts (wallets)
  const allContracts = filteredNodes.filter((n) => n.kind === "contract") as (Node & { kind: "contract" })[];
  const contracts = allContracts.filter((c) => (c as ContractNodeData).kindOnChain !== "EOA");
  const eoaContracts = allContracts.filter((c) => (c as ContractNodeData).kindOnChain === "EOA");

  // Build map of EOA contracts to related contracts (via REFERENCES_ADDRESS edges)
  const eoaToContract = new Map<string, string>();
  for (const edge of graphData.edges) {
    if (edge.kind === "REFERENCES_ADDRESS" && edge.from.startsWith("contract:")) {
      const contractId = edge.from;
      const addressId = edge.to;
      // Find EOA contract with matching address
      const eoaContract = eoaContracts.find((c) => {
        if ("address" in c) {
          return addressId.includes((c as any).address);
        }
        return false;
      });
      if (eoaContract && nodeIds.has(contractId)) {
        eoaToContract.set(eoaContract.id, contractId);
      }
    }
  }

  // Position tracking
  const nodePositions = new Map<string, { x: number; y: number }>();
  const positionedNodes = new Set<string>();

  // Contract-only mode: Simple grid layout with 5 contracts per row
  if (isContractOnlyMode) {
    const CONTRACT_SPACING_X = 350;
    const CONTRACT_SPACING_Y = 300;
    const DEPLOYER_OFFSET_X = 180;
    const DEPLOYER_OFFSET_Y = -80;
    const CONTRACTS_PER_ROW = 5;

    // Position contracts in a grid (5 per row)
    contracts.forEach((contract, idx) => {
      if (hiddenNodeIds.has(contract.id)) return;

      const row = Math.floor(idx / CONTRACTS_PER_ROW);
      const col = idx % CONTRACTS_PER_ROW;
      const x = col * CONTRACT_SPACING_X;
      const y = row * CONTRACT_SPACING_Y;

      nodePositions.set(contract.id, { x, y });
      positionedNodes.add(contract.id);

      // Position deployer wallet near the contract
      const creatorId = contractToCreator.get(contract.id);
      if (creatorId && nodeIds.has(creatorId) && !positionedNodes.has(creatorId)) {
        const creatorNode = filteredNodes.find((n: any) => n.id === creatorId);
        const isDeployer = creatorNode && creatorNode.kind === "address" &&
          "label" in creatorNode &&
          typeof creatorNode.label === "string" &&
          (creatorNode.label.includes("Factory") || creatorNode.label.includes("Deployer"));

        if (isDeployer) {
          nodePositions.set(creatorId, {
            x: x + DEPLOYER_OFFSET_X,
            y: y + DEPLOYER_OFFSET_Y,
          });
          positionedNodes.add(creatorId);
        }
      }
    });

    // Position any remaining unpositioned nodes
    filteredNodes.forEach((node: any) => {
      if (!positionedNodes.has(node.id) && nodeIds.has(node.id)) {
        nodePositions.set(node.id, { x: 0, y: 0 });
        positionedNodes.add(node.id);
      }
    });
  } else {
    // Circular layout for normal mode
    const contractCircleRadius = contracts.length > 0
      ? calculateContractCircleRadius(contracts.length)
      : CIRCULAR_LAYOUT_CONFIG.MIN_CONTRACT_RADIUS;
    const centerX = 0;
    const centerY = 0;

    // Step 1: Position contracts in a circle
    if (contracts.length > 0) {
      contracts.forEach((contract, idx) => {
        if (hiddenNodeIds.has(contract.id)) return;

        const angle = (2 * Math.PI * idx) / contracts.length - Math.PI / 2; // Start from top
        const pos = getPositionOnCircle(centerX, centerY, contractCircleRadius, angle);
        nodePositions.set(contract.id, pos);
        positionedNodes.add(contract.id);
      });
    }

    // Step 2: Position source files and deployer wallets in inner orbit around contracts
    contracts.forEach((contract) => {
      if (!nodeIds.has(contract.id) || hiddenNodeIds.has(contract.id)) return;

      const contractPos = nodePositions.get(contract.id);
      if (!contractPos) return;

      // Calculate angle from center to contract
      const contractAngle = Math.atan2(contractPos.y - centerY, contractPos.x - centerX);

      // Position source files in inner orbit
      const sourceFiles = contractToSource.get(contract.id) || [];
      const visibleSourceFiles = sourceFiles.filter(id => nodeIds.has(id) && !positionedNodes.has(id));

      if (visibleSourceFiles.length > 0) {
        visibleSourceFiles.forEach((sourceId, idx) => {
          // Distribute source files evenly around the contract
          const sourceAngle = contractAngle + (2 * Math.PI * idx) / visibleSourceFiles.length - Math.PI / 2;
          const sourcePos = getPositionOnCircle(
            contractPos.x,
            contractPos.y,
            CIRCULAR_LAYOUT_CONFIG.INNER_ORBIT_RADIUS,
            sourceAngle
          );
          nodePositions.set(sourceId, sourcePos);
          positionedNodes.add(sourceId);
        });
      }

      // Position deployer wallet in inner orbit
      const creatorId = contractToCreator.get(contract.id);
      if (creatorId && nodeIds.has(creatorId) && !positionedNodes.has(creatorId)) {
        // Check if it's a deployer (not EOA)
        const creatorNode = filteredNodes.find(n => n.id === creatorId);
        const isDeployer = creatorNode && creatorNode.kind === "address" &&
          "label" in creatorNode &&
          typeof creatorNode.label === "string" &&
          (creatorNode.label.includes("Factory") || creatorNode.label.includes("Deployer"));

        if (isDeployer) {
          const deployerAngle = contractAngle + Math.PI / 4; // Offset angle
          const deployerPos = getPositionOnCircle(
            contractPos.x,
            contractPos.y,
            CIRCULAR_LAYOUT_CONFIG.INNER_ORBIT_RADIUS,
            deployerAngle
          );
          nodePositions.set(creatorId, deployerPos);
          positionedNodes.add(creatorId);
        }
      }
    });

    // Step 3: Position type definitions (Library, Abstract, Interface, Deployable) in outer orbit around contracts
    contracts.forEach((contract) => {
      if (!nodeIds.has(contract.id) || hiddenNodeIds.has(contract.id)) return;

      const contractPos = nodePositions.get(contract.id);
      if (!contractPos) return;

      const contractAngle = Math.atan2(contractPos.y - centerY, contractPos.x - centerX);

      // Get all types for this contract
      const types = contractToTypes.get(contract.id) || [];

      // Position types in outer orbit
      const visibleTypes = types.filter(id => nodeIds.has(id) && !positionedNodes.has(id));

      if (visibleTypes.length > 0) {
        // Group visible types by kind for clustering
        const visibleTypesByKind = new Map<string, string[]>();
        visibleTypes.forEach((typeId) => {
          const typeNode = filteredNodes.find(n => n.id === typeId);
          if (typeNode && typeNode.kind === "typeDef" && "typeKind" in typeNode) {
            const kind = (typeNode as any).typeKind || "OTHER";
            const kindTypes = visibleTypesByKind.get(kind) || [];
            kindTypes.push(typeId);
            visibleTypesByKind.set(kind, kindTypes);
          } else {
            // Fallback for types without kind
            const kindTypes = visibleTypesByKind.get("OTHER") || [];
            kindTypes.push(typeId);
            visibleTypesByKind.set("OTHER", kindTypes);
          }
        });

        // Position types evenly around the contract
        visibleTypes.forEach((typeId, idx) => {
          if (positionedNodes.has(typeId)) return;

          // Distribute types around the contract
          const typeAngle = contractAngle + (2 * Math.PI * idx) / visibleTypes.length - Math.PI / 2;
          const typePos = getPositionOnCircle(
            contractPos.x,
            contractPos.y,
            CIRCULAR_LAYOUT_CONFIG.OUTER_ORBIT_RADIUS,
            typeAngle
          );
          nodePositions.set(typeId, typePos);
          positionedNodes.add(typeId);
        });
      }
    });

    // Step 4: Position EOA wallets in outer circle
    eoaContracts.forEach((eoaContract, idx) => {
      if (hiddenNodeIds.has(eoaContract.id) || positionedNodes.has(eoaContract.id)) return;

      // Find related contract for this EOA
      const relatedContractId = eoaToContract.get(eoaContract.id);

      let angle: number;
      if (relatedContractId && nodeIds.has(relatedContractId)) {
        // Position near the related contract but on outer circle
        const relatedContractPos = nodePositions.get(relatedContractId);
        if (relatedContractPos) {
          const relatedAngle = Math.atan2(relatedContractPos.y - centerY, relatedContractPos.x - centerX);
          // Offset slightly from the contract angle
          angle = relatedAngle + (Math.PI / 6) * (idx % 2 === 0 ? 1 : -1);
        } else {
          angle = (2 * Math.PI * idx) / Math.max(eoaContracts.length, 1) - Math.PI / 2;
        }
      } else {
        // Distribute evenly on outer circle
        angle = (2 * Math.PI * idx) / Math.max(eoaContracts.length, 1) - Math.PI / 2;
      }

      const eoaPos = getPositionOnCircle(centerX, centerY, CIRCULAR_LAYOUT_CONFIG.EOA_ORBIT_RADIUS, angle);
      nodePositions.set(eoaContract.id, eoaPos);
      positionedNodes.add(eoaContract.id);
    });

    // Step 5: Position any remaining address nodes (non-deployer, non-EOA)
    const remainingAddresses = filteredNodes.filter(
      (n: any) => n.kind === "address" && !positionedNodes.has(n.id) && nodeIds.has(n.id)
    );
    remainingAddresses.forEach((address: any, idx: number) => {
      const angle = (2 * Math.PI * idx) / Math.max(remainingAddresses.length, 1) - Math.PI / 2;
      const pos = getPositionOnCircle(centerX, centerY, CIRCULAR_LAYOUT_CONFIG.EOA_ORBIT_RADIUS, angle);
      nodePositions.set(address.id, pos);
      positionedNodes.add(address.id);
    });

    // Step 6: Position any remaining unpositioned nodes
    filteredNodes.forEach((node: any) => {
      if (!positionedNodes.has(node.id) && nodeIds.has(node.id)) {
        // Place at a default position
        nodePositions.set(node.id, { x: centerX + 1000, y: centerY + 1000 });
        positionedNodes.add(node.id);
      }
    });
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
  const [hiddenContractIds, setHiddenContractIds] = useState<Set<string>>(new Set());
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
    return computeSmartLayout(graphData, visibleNodeKinds, visibleEdgeKinds, hiddenContractIds);
  }, [graphData, visibleNodeKinds, visibleEdgeKinds, hiddenContractIds, layoutKey]);

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

  const toggleContract = (contractId: string) => {
    setHiddenContractIds((prev) => {
      const next = new Set(prev);
      if (next.has(contractId)) {
        next.delete(contractId);
      } else {
        next.add(contractId);
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
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin text-primary-500 mx-auto mb-4" />
          <p className="text-surface-400">Loading graph data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-surface-400">Failed to load graph data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] relative">
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
        graphData={graphData}
        hiddenContractIds={hiddenContractIds}
        onToggleContract={toggleContract}
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
