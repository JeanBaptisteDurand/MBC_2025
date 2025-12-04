// ============================================
// BaseLens Core Types
// Shared types for graph data, analysis, and AI
// ============================================

// ============================================
// Node ID Types
// ============================================

export type NodeId =
  | `contract:${string}` // address
  | `source:${string}` // source file id
  | `typedef:${string}` // type definition id
  | `event:${string}` // event id
  | `address:${string}`; // EOA or address node

// ============================================
// Network Types
// ============================================

export type Network = "base-mainnet" | "base-sepolia";

// ============================================
// Contract On-Chain Kind
// ============================================

export type ContractKindOnChain =
  | "EOA"
  | "CONTRACT_SIMPLE"
  | "PROXY"
  | "IMPLEMENTATION";

// ============================================
// Source Type
// ============================================

export type SourceType = "verified" | "decompiled" | "none";

// ============================================
// Type Definition Kind
// ============================================

export type TypeDefKind =
  | "INTERFACE"
  | "ABSTRACT_CONTRACT"
  | "CONTRACT_IMPL"
  | "LIBRARY";

// ============================================
// Edge Kinds
// ============================================

export type EdgeKind =
  | "IS_PROXY_OF"
  | "CALLS_RUNTIME"
  | "CREATED_BY"
  | "CREATED"
  | "HAS_SOURCE_FILE"
  | "DECLARES_TYPE"
  | "DEFINED_BY"
  | "IMPLEMENTS_INTERFACE"
  | "EXTENDS_CONTRACT"
  | "USES_LIBRARY"
  | "USES_TYPE_INTERFACE"
  | "REFERENCES_ADDRESS"      // Hardcoded address found in source code
  | "SOURCE_DECLARED_IMPL";   // Implementation declared in source patterns

// ============================================
// Node Types
// ============================================

export interface ContractNode {
  kind: "contract";
  id: `contract:${string}`;
  address: string;
  name?: string;
  isRoot: boolean;
  kindOnChain: ContractKindOnChain;
  isFactory?: boolean;
  verified: boolean;
  sourceType: SourceType;
  creatorAddress?: string;
  creationTxHash?: string;
  tags?: ContractTags;
}

export interface ContractTags {
  isFactory?: boolean;
  hasEip1967ImplSlot?: boolean;
  isMinimalProxy?: boolean;
  proxyAdmin?: string;
  implementationAddress?: string;
  // Basescan metadata
  proxyFlag?: "0" | "1";
  swarmSource?: string;
  compilerVersion?: string;
  optimizationUsed?: string;
  runs?: string;
  evmVersion?: string;
  library?: string;
  licenseType?: string;
  // Error tracking
  decompileError?: string;
}

export interface SourceFileNode {
  kind: "sourceFile";
  id: `source:${string}`;
  contractAddress: string;
  path: string;
  sourceType: "verified" | "decompiled";
}

export interface TypeDefNode {
  kind: "typeDef";
  id: `typedef:${string}`;
  name: string;
  typeKind: TypeDefKind;
  instanciable: boolean;
  isRootContractType?: boolean;
  sourceFileId: `source:${string}`;
}

export interface EventNode {
  kind: "event";
  id: `event:${string}`;
  contractAddress: string;
  signature: string;
  txHash: string;
  timestamp: string;
}

export interface AddressNode {
  kind: "address";
  id: `address:${string}`;
  address: string;
  label?: string;
}

export type Node =
  | ContractNode
  | SourceFileNode
  | TypeDefNode
  | EventNode
  | AddressNode;

// ============================================
// Edge Type
// ============================================

export interface Edge {
  id: string;
  from: NodeId;
  to: NodeId;
  kind: EdgeKind;
  evidence?: EdgeEvidence;
}

export interface EdgeEvidence {
  txHashes?: string[];
  storageSlot?: string;
  storageValue?: string;
  codeFragments?: string[];
  traces?: string[];
  [key: string]: unknown;
}

// ============================================
// Graph Data
// ============================================

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
  stats?: GraphStats;
}

export interface GraphStats {
  totalContracts: number;
  totalProxies: number;
  totalSourceFiles: number;
  totalTypeDefs: number;
  verifiedContracts: number;
  decompiledContracts: number;
}

// ============================================
// Analysis Types
// ============================================

export type AnalysisStatus = "queued" | "running" | "done" | "error";

export interface AnalysisParams {
  address: string;
  network: Network;
  maxDepth?: number;
}

export interface AnalysisResult {
  id: string;
  rootAddress: string;
  network: Network;
  status: AnalysisStatus;
  createdAt: string;
  error?: string;
}

export interface AnalysisStatusResponse {
  jobId: string;
  status: AnalysisStatus;
  progress: number;
  analysisId?: string;
  error?: string;
}

export interface AnalysisHistoryItem {
  id: string;
  rootAddress: string;
  network: Network;
  status: AnalysisStatus;
  createdAt: string;
}

// ============================================
// AI/Summary Types
// ============================================

export interface AnalysisSummary {
  summary: string;
  securityNotes: string;
  ultraSummary: string;
}

export interface ContractExplanation {
  address: string;
  name?: string;
  explanation: string;
  functions?: FunctionSummary[];
  securityNotes?: string;
}

export interface FunctionSummary {
  name: string;
  signature: string;
  description?: string;
  stateMutability: string;
  inputs: { name: string; type: string }[];
  outputs: { type: string }[];
}

// ============================================
// RAG Types
// ============================================

export type RagDocumentKind = "contract" | "type" | "global" | "note";

export interface RagChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

/** Graph context sent with RAG chat for better AI understanding */
export interface RagGraphContext {
  /** Active nodes visible on the graph */
  visibleNodes?: {
    id: string;
    kind: string;
    name?: string;
    address?: string;
  }[];
  /** Edges showing relationships between nodes */
  edges?: {
    kind: string;
    from: string;
    to: string;
  }[];
}

export interface RagChatRequest {
  analysisId: string;
  chatId?: string;
  question: string;
  /** Graph context for better AI understanding */
  graphContext?: RagGraphContext;
}

export interface RagChatResponse {
  chatId: string;
  answer: string;
  messages?: RagChatMessage[];
  sourcesUsed?: RagSourceUsed[];
}

export interface RagSourceUsed {
  kind: string;
  refId: string;
  contractAddress?: string;
  nodeId?: string;
  similarity: number;
  contentPreview?: string;
}

// ============================================
// ABI Types (simplified)
// ============================================

export interface AbiFunction {
  name: string;
  type: "function" | "constructor" | "fallback" | "receive";
  stateMutability: "pure" | "view" | "nonpayable" | "payable";
  inputs: AbiParameter[];
  outputs: AbiParameter[];
}

export interface AbiEvent {
  name: string;
  type: "event";
  inputs: AbiParameter[];
  anonymous?: boolean;
}

export interface AbiParameter {
  name: string;
  type: string;
  indexed?: boolean;
  components?: AbiParameter[];
}

export type AbiItem = AbiFunction | AbiEvent | { type: string;[key: string]: unknown };

// ============================================
// API Request/Response Types
// ============================================

export interface StartAnalysisRequest {
  address: string;
  network: Network;
  maxDepth?: number;
}

export interface StartAnalysisResponse {
  jobId: string;
}

export interface SourceCodeResponse {
  address: string;
  sourceType: SourceType;
  files: {
    path: string;
    content: string;
    sourceType: "verified" | "decompiled";
  }[];
}

// ============================================
// Utility Types
// ============================================

export function isContractNode(node: Node): node is ContractNode {
  return node.kind === "contract";
}

export function isSourceFileNode(node: Node): node is SourceFileNode {
  return node.kind === "sourceFile";
}

export function isTypeDefNode(node: Node): node is TypeDefNode {
  return node.kind === "typeDef";
}

export function isEventNode(node: Node): node is EventNode {
  return node.kind === "event";
}

export function isAddressNode(node: Node): node is AddressNode {
  return node.kind === "address";
}

// ============================================
// Constants
// ============================================

export const EDGE_COLORS: Record<EdgeKind, string> = {
  IS_PROXY_OF: "#f97316", // orange
  CALLS_RUNTIME: "#3b82f6", // blue
  CREATED_BY: "#22c55e", // green
  CREATED: "#22c55e", // green
  HAS_SOURCE_FILE: "#8b5cf6", // purple
  DECLARES_TYPE: "#ec4899", // pink
  DEFINED_BY: "#06b6d4", // cyan
  IMPLEMENTS_INTERFACE: "#eab308", // yellow
  EXTENDS_CONTRACT: "#f43f5e", // rose
  USES_LIBRARY: "#14b8a6", // teal
  USES_TYPE_INTERFACE: "#a855f7", // violet
  REFERENCES_ADDRESS: "#64748b", // slate - for hardcoded address references
  SOURCE_DECLARED_IMPL: "#fb923c", // orange-400 - for implementations found in source
};

export const NODE_COLORS = {
  contract: {
    root: "#f97316", // orange
    proxy: "#8b5cf6", // purple
    implementation: "#3b82f6", // blue
    factory: "#22c55e", // green
    simple: "#6b7280", // gray
    eoa: "#94a3b8", // slate
  },
  sourceFile: {
    verified: "#22c55e", // green
    decompiled: "#eab308", // yellow
  },
  typeDef: {
    interface: "#06b6d4", // cyan
    abstract: "#a855f7", // violet
    library: "#14b8a6", // teal
    impl: "#ec4899", // pink
  },
};

