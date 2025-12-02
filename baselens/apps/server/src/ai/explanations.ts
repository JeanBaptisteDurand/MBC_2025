// ============================================
// AI Explanations - Summary & Analysis Generation
// ============================================

import { prisma, storeEmbedding } from "../db/prismaClient.js";
import { logger } from "../logger.js";
import { chatCompletion, createEmbedding, truncateToTokens } from "./openai.js";
import type { AnalysisSummary } from "@baselens/core";

// ============================================
// Prompts
// ============================================

const SYSTEM_PROMPT = `You are an expert blockchain security analyst specializing in EVM smart contracts on Base L2. 
You analyze smart contract code, identify patterns, and explain contract behavior clearly.
You are familiar with common patterns like:
- EIP-1967 proxy patterns (TransparentUpgradeableProxy, UUPS)
- EIP-1167 minimal proxy / clone pattern
- Factory patterns
- OpenZeppelin contracts (Ownable, AccessControl, ERC20, ERC721, etc.)
- Common DeFi patterns (AMM, lending, staking)
- Security vulnerabilities and best practices

When analyzing contracts, be concise but thorough. Highlight important security considerations.`;

const GLOBAL_SUMMARY_PROMPT = `Analyze the following smart contract system and provide:

1. **Overview**: What is this contract system? What does it do?
2. **Architecture**: Describe the contract relationships (proxies, implementations, factories, dependencies)
3. **Key Contracts**: List the main contracts and their purposes
4. **Security Notes**: Any security considerations, upgrade patterns, access control, or potential risks

Contracts in this analysis:
{contracts}

Source code snippets:
{sources}

Provide a clear, structured analysis.`;

const CONTRACT_EXPLANATION_PROMPT = `Analyze the following EVM smart contract and provide:

1. **Purpose**: What does this contract do?
2. **Key Functions**: List the main functions and what they do
3. **State Variables**: Important state the contract manages
4. **Access Control**: Who can do what?
5. **Security Notes**: Any security considerations

Contract: {name} ({address})
Type: {kindOnChain}
{sourceInfo}

{sourceCode}

Provide a concise but comprehensive explanation.`;

const SECURITY_NOTES_PROMPT = `Based on the following contract analysis, identify security considerations:

{analysisContext}

Focus on:
1. Upgrade risks (if proxy pattern is used)
2. Access control and privileged functions
3. External calls and reentrancy risks
4. Value handling and potential loss scenarios
5. Common vulnerability patterns

Be specific and actionable in your notes.`;

// ============================================
// Summary Generation
// ============================================

/**
 * Generate a global summary for an analysis
 */
export async function generateAnalysisSummary(analysisId: string): Promise<AnalysisSummary> {
  logger.info(`[AI] ========================================`);
  logger.info(`[AI] GENERATING ANALYSIS SUMMARY`);
  logger.info(`[AI] Analysis ID: ${analysisId}`);
  logger.info(`[AI] ========================================`);
  
  // Fetch analysis data
  logger.info(`[AI] Fetching analysis data from database...`);
  const [analysis, contracts] = await Promise.all([
    prisma.analysis.findUnique({ where: { id: analysisId } }),
    prisma.contract.findMany({
      where: { analysisId },
      include: { analysis: true },
    }),
  ]);
  
  if (!analysis) {
    logger.error(`[AI] ❌ Analysis not found: ${analysisId}`);
    throw new Error(`Analysis not found: ${analysisId}`);
  }
  
  logger.info(`[AI] Found ${contracts.length} contracts in analysis`);
  
  // Build context
  const contractsContext = contracts.map((c) => {
    return `- ${c.name || "Unknown"} (${c.address}): ${c.kindOnChain}${c.verified ? " [verified]" : c.sourceType === "decompiled" ? " [decompiled]" : ""}`;
  }).join("\n");
  
  logger.debug(`[AI] Contracts context:\n${contractsContext}`);
  
  // Get source snippets (truncated)
  const sourceSnippets: string[] = [];
  for (const contract of contracts.slice(0, 5)) { // Limit to first 5 contracts
    if (contract.sourceCode) {
      const snippet = truncateToTokens(contract.sourceCode, 500);
      sourceSnippets.push(`### ${contract.name || contract.address}\n\`\`\`solidity\n${snippet}\n\`\`\``);
      logger.debug(`[AI] Added source snippet for ${contract.name || contract.address} (${snippet.length} chars)`);
    }
  }
  
  // Generate summary
  logger.info(`[AI] Step 1: Generating global summary...`);
  const summaryPrompt = GLOBAL_SUMMARY_PROMPT
    .replace("{contracts}", contractsContext)
    .replace("{sources}", sourceSnippets.join("\n\n") || "No source code available");
  
  const summary = await chatCompletion([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: summaryPrompt },
  ]);
  
  logger.info(`[AI] ✅ Global summary generated (${summary.length} chars)`);
  
  // Generate security notes
  logger.info(`[AI] Step 2: Generating security notes...`);
  const securityPrompt = SECURITY_NOTES_PROMPT.replace("{analysisContext}", summary);
  
  const securityNotes = await chatCompletion([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: securityPrompt },
  ], { maxTokens: 1000 });
  
  logger.info(`[AI] ✅ Security notes generated (${securityNotes.length} chars)`);
  
  // Generate ultra summary
  logger.info(`[AI] Step 3: Generating ultra summary...`);
  const ultraSummary = await chatCompletion([
    { role: "system", content: "Summarize the following in 1-2 sentences:" },
    { role: "user", content: summary },
  ], { maxTokens: 100 });
  
  logger.info(`[AI] ✅ Ultra summary generated (${ultraSummary.length} chars)`);
  
  // Save to database
  logger.info(`[AI] Saving summary to database...`);
  await prisma.globalAnalysisSummary.upsert({
    where: { analysisId },
    create: {
      analysisId,
      summary,
      securityNotes,
      ultraSummary,
    },
    update: {
      summary,
      securityNotes,
      ultraSummary,
    },
  });
  
  logger.info(`[AI] ✅ Summary saved to GlobalAnalysisSummary table`);
  logger.info(`[AI] ========================================`);
  logger.info(`[AI] SUMMARY GENERATION COMPLETE`);
  logger.info(`[AI] ========================================`);
  
  return { summary, securityNotes, ultraSummary };
}

/**
 * Generate explanation for a specific contract
 */
export async function generateContractExplanation(
  analysisId: string,
  address: string
): Promise<string> {
  logger.info(`[AI] Generating explanation for contract ${address}...`);
  
  const contract = await prisma.contract.findFirst({
    where: {
      analysisId,
      address: address.toLowerCase(),
    },
  });
  
  if (!contract) {
    logger.error(`[AI] ❌ Contract not found: ${address}`);
    throw new Error(`Contract not found: ${address}`);
  }
  
  logger.info(`[AI] Contract: ${contract.name || "Unknown"}, type: ${contract.kindOnChain}`);
  logger.info(`[AI] Source: ${contract.verified ? "verified" : contract.sourceType}`);
  
  const sourceInfo = contract.verified
    ? "Source: Verified on Basescan"
    : contract.sourceType === "decompiled"
      ? "Source: Decompiled (Panoramix)"
      : "Source: Not available";
  
  const sourceCode = contract.sourceCode
    ? truncateToTokens(contract.sourceCode, 3000)
    : "Source code not available";
  
  const prompt = CONTRACT_EXPLANATION_PROMPT
    .replace("{name}", contract.name || "Unknown")
    .replace("{address}", contract.address)
    .replace("{kindOnChain}", contract.kindOnChain)
    .replace("{sourceInfo}", sourceInfo)
    .replace("{sourceCode}", sourceCode);
  
  const explanation = await chatCompletion([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ]);
  
  logger.info(`[AI] ✅ Contract explanation generated (${explanation.length} chars)`);
  
  return explanation;
}

// ============================================
// RAG Indexing
// ============================================

/**
 * Index analysis content for RAG
 */
export async function indexAnalysisForRag(analysisId: string): Promise<void> {
  logger.info(`[AI] ========================================`);
  logger.info(`[AI] INDEXING ANALYSIS FOR RAG`);
  logger.info(`[AI] Analysis ID: ${analysisId}`);
  logger.info(`[AI] ========================================`);
  
  // Fetch all relevant content
  logger.info(`[AI] Fetching content to index...`);
  const [contracts, summary] = await Promise.all([
    prisma.contract.findMany({ where: { analysisId } }),
    prisma.globalAnalysisSummary.findUnique({ where: { analysisId } }),
  ]);
  
  logger.info(`[AI] Found ${contracts.length} contracts, summary: ${summary ? "YES" : "NO"}`);
  
  const documents: { kind: string; refId: string; content: string }[] = [];
  
  // Add global summary
  if (summary) {
    documents.push({
      kind: "global",
      refId: "summary",
      content: `Global Analysis Summary:\n${summary.summary}\n\nSecurity Notes:\n${summary.securityNotes}`,
    });
    logger.info(`[AI] Added global summary to index (${summary.summary.length + summary.securityNotes.length} chars)`);
  }
  
  // Add contract documents
  for (const contract of contracts) {
    const parts: string[] = [];
    parts.push(`Contract: ${contract.name || "Unknown"}`);
    parts.push(`Address: ${contract.address}`);
    parts.push(`Type: ${contract.kindOnChain}`);
    parts.push(`Verified: ${contract.verified}`);
    
    if (contract.sourceCode) {
      // Truncate source code for embedding
      const truncatedSource = truncateToTokens(contract.sourceCode, 2000);
      parts.push(`\nSource Code:\n${truncatedSource}`);
    }
    
    documents.push({
      kind: "contract",
      refId: contract.address,
      content: parts.join("\n"),
    });
    
    logger.debug(`[AI] Added contract ${contract.address.slice(0, 10)}... to index`);
  }
  
  logger.info(`[AI] Prepared ${documents.length} documents for indexing`);
  
  // Create embeddings and store documents
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    logger.info(`[AI] Indexing document ${i + 1}/${documents.length}: ${doc.kind}:${doc.refId.slice(0, 20)}...`);
    
    try {
      // Create the document first
      const ragDoc = await prisma.ragDocument.create({
        data: {
          analysisId,
          kind: doc.kind,
          refId: doc.refId,
          content: doc.content,
        },
      });
      
      logger.debug(`[AI] Created RagDocument: ${ragDoc.id}`);
      
      // Create and store embedding
      const embedding = await createEmbedding(doc.content);
      await storeEmbedding(ragDoc.id, embedding);
      
      logger.info(`[AI] ✅ Document indexed with ${embedding.length}-dim embedding`);
      successCount++;
      
    } catch (error) {
      logger.error(`[AI] ❌ Failed to index document ${doc.refId}:`, error);
      errorCount++;
    }
  }
  
  logger.info(`[AI] ========================================`);
  logger.info(`[AI] RAG INDEXING COMPLETE`);
  logger.info(`[AI] Success: ${successCount}, Errors: ${errorCount}`);
  logger.info(`[AI] ========================================`);
}

/**
 * Get or generate summary for an analysis
 */
export async function getAnalysisSummary(analysisId: string): Promise<AnalysisSummary | null> {
  logger.info(`[AI] Getting summary for analysis ${analysisId}...`);
  
  const existing = await prisma.globalAnalysisSummary.findUnique({
    where: { analysisId },
  });
  
  if (existing) {
    logger.info(`[AI] ✅ Found existing summary in database`);
    return {
      summary: existing.summary,
      securityNotes: existing.securityNotes,
      ultraSummary: existing.ultraSummary,
    };
  }
  
  logger.info(`[AI] No existing summary, generating new one...`);
  
  // Generate if not exists
  try {
    return await generateAnalysisSummary(analysisId);
  } catch (error) {
    logger.error("[AI] ❌ Failed to generate summary:", error);
    return null;
  }
}
