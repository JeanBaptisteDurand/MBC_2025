// ============================================
// API Endpoints
// ============================================

import { api } from "./client";
import type {
  StartAnalysisRequest,
  StartAnalysisResponse,
  AnalysisStatusResponse,
  GraphData,
  AnalysisSummary,
  AnalysisHistoryItem,
  SourceCodeResponse,
  RagChatRequest,
  RagChatResponse,
  RagChatMessage,
} from "@baselens/core";

// ============================================
// Analysis Endpoints
// ============================================

export async function startAnalysis(
  data: StartAnalysisRequest
): Promise<StartAnalysisResponse> {
  return api.post<StartAnalysisResponse>("/api/analyze", data);
}

export async function getAnalysisStatus(
  jobId: string
): Promise<AnalysisStatusResponse> {
  return api.get<AnalysisStatusResponse>(`/api/analyze/${jobId}/status`);
}

export async function getGraphData(analysisId: string): Promise<GraphData> {
  return api.get<GraphData>(`/api/analysis/${analysisId}/graph`);
}

export async function getAnalysisSummary(
  analysisId: string
): Promise<AnalysisSummary> {
  return api.get<AnalysisSummary>(`/api/analysis/${analysisId}/summary`);
}

export async function getContractExplanation(
  analysisId: string,
  address: string
): Promise<{ explanation: string }> {
  return api.get<{ explanation: string }>(
    `/api/analysis/${analysisId}/contract/${address}/explanation`
  );
}

export async function getAnalysisHistory(): Promise<AnalysisHistoryItem[]> {
  return api.get<AnalysisHistoryItem[]>("/api/analysis/history");
}

export async function getAnalysisDetails(analysisId: string): Promise<{
  id: string;
  rootAddress: string;
  network: string;
  status: string;
  createdAt: string;
  error?: string;
  contracts: {
    address: string;
    name: string | null;
    kindOnChain: string;
    verified: boolean;
    sourceType: string;
  }[];
  counts: {
    sourceFiles: number;
    typeDefs: number;
    edges: number;
  };
}> {
  return api.get(`/api/analysis/${analysisId}`);
}

// ============================================
// Source Code Endpoints
// ============================================

export async function getSourceCode(
  analysisId: string,
  address: string
): Promise<SourceCodeResponse> {
  return api.get<SourceCodeResponse>(`/api/source/${analysisId}/${address}`);
}

export async function getContractAbi(
  analysisId: string,
  address: string
): Promise<{ address: string; name: string | null; abi: unknown[] }> {
  return api.get(`/api/source/${analysisId}/${address}/abi`);
}

export async function getContractTypes(
  analysisId: string,
  address: string
): Promise<{
  types: {
    id: string;
    name: string;
    kind: string;
    instanciable: boolean;
    isRootContractType: boolean;
    sourceFile: string;
  }[];
}> {
  return api.get(`/api/source/${analysisId}/${address}/types`);
}

export async function getTypeDefinition(
  analysisId: string,
  address: string,
  typeName: string
): Promise<{
  typeName: string;
  kind: string;
  sourceFile: string;
  sourceType: "verified" | "decompiled";
  code: string;
  extracted: boolean;
}> {
  return api.get(`/api/source/${analysisId}/${address}/type/${encodeURIComponent(typeName)}`);
}

// ============================================
// RAG Chat Endpoints
// ============================================

export async function sendRagMessage(
  data: RagChatRequest
): Promise<RagChatResponse> {
  return api.post<RagChatResponse>("/api/rag/chat", data);
}

export async function getRagChat(
  analysisId: string,
  chatId?: string
): Promise<{
  chatId: string | null;
  messages: RagChatMessage[];
}> {
  const params: Record<string, string> = { analysisId };
  if (chatId) {
    params.chatId = chatId;
  }
  return api.get("/api/rag/chat", params);
}

export async function getRagChatHistory(
  chatId: string
): Promise<{
  chatId: string;
  messages: RagChatMessage[];
}> {
  return api.get(`/api/rag/chat/${chatId}/history`);
}

