// ============================================
// AI Explanations - Summary & Analysis Generation
// ============================================

import { prisma, storeEmbedding } from "../db/prismaClient.js";
import { logger } from "../logger.js";
import { chatCompletion, createEmbedding, truncateToTokens } from "./openai.js";
import { extractTypeDefinition } from "../routes/source.js";
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
 * Skips EOA (wallets) from the summary
 */
export async function generateAnalysisSummary(analysisId: string): Promise<AnalysisSummary> {
  logger.info(`[AI] ========================================`);
  logger.info(`[AI] GENERATING ANALYSIS SUMMARY`);
  logger.info(`[AI] Analysis ID: ${analysisId}`);
  logger.info(`[AI] ========================================`);

  // Fetch analysis data
  logger.info(`[AI] Fetching analysis data from database...`);
  const [analysis, allContracts] = await Promise.all([
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

  // Filter out EOA (wallets) - only include contracts with actual code
  const contracts = allContracts.filter(c => c.kindOnChain !== "EOA");
  const skippedEOA = allContracts.length - contracts.length;

  logger.info(`[AI] Found ${allContracts.length} total, ${contracts.length} contracts for summary (skipped ${skippedEOA} EOA wallets)`);

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
 * If forceRegenerate is false, will return cached explanation if available and source type hasn't changed
 */
export async function generateContractExplanation(
  analysisId: string,
  address: string,
  forceRegenerate: boolean = false
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

  // Check if we have a cached explanation and source type hasn't changed
  if (!forceRegenerate && contract.aiExplanation && contract.aiExplanationSourceType === contract.sourceType) {
    logger.info(`[AI] ✅ Returning cached explanation (${contract.aiExplanation.length} chars)`);
    return contract.aiExplanation;
  }

  // Check if source type has upgraded (from none/decompiled to verified)
  const sourceUpgraded = contract.aiExplanationSourceType &&
    (contract.aiExplanationSourceType === "none" || contract.aiExplanationSourceType === "decompiled") &&
    contract.sourceType === "verified";

  if (sourceUpgraded) {
    logger.info(`[AI] 🔄 Source upgraded from ${contract.aiExplanationSourceType} to ${contract.sourceType}, regenerating explanation...`);
  }

  const sourceInfo = contract.verified
    ? "Source: Verified on Basescan"
    : contract.sourceType === "decompiled"
      ? "Source: Decompiled (Panoramix)"
      : "Source: Not available";

  // Build context based on what we have
  let codeContext = "";
  if (contract.sourceCode) {
    codeContext = truncateToTokens(contract.sourceCode, 3000);
  } else if (contract.abiJson) {
    // If no source code, use ABI for context
    const abiStr = JSON.stringify(contract.abiJson, null, 2);
    codeContext = `ABI (no source code available):\n${truncateToTokens(abiStr, 2000)}`;
  } else {
    codeContext = "No source code or ABI available";
  }

  // Add noSource context if applicable
  let additionalContext = "";
  if (contract.noSource) {
    additionalContext = "\n\nNote: Decompilation failed for this contract. The decompiler could not extract meaningful code.";
    if (contract.decompileError) {
      additionalContext += `\nDecompiler output: ${truncateToTokens(contract.decompileError, 500)}`;
    }
  }

  const prompt = CONTRACT_EXPLANATION_PROMPT
    .replace("{name}", contract.name || "Unknown")
    .replace("{address}", contract.address)
    .replace("{kindOnChain}", contract.kindOnChain)
    .replace("{sourceInfo}", sourceInfo)
    .replace("{sourceCode}", codeContext + additionalContext);

  const explanation = await chatCompletion([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ]);

  // Save the explanation to the database
  await prisma.contract.update({
    where: {
      analysisId_address: {
        analysisId,
        address: contract.address,
      },
    },
    data: {
      aiExplanation: explanation,
      aiExplanationSourceType: contract.sourceType,
    },
  });

  logger.info(`[AI] ✅ Contract explanation generated and cached (${explanation.length} chars)`);

  return explanation;
}

/**
 * Generate AI explanations for all contracts in an analysis
 * This is called during the analysis process to pre-generate all explanations
 * Skips EOA (wallets) and uses parallel processing for speed
 */
export async function generateAllContractExplanations(analysisId: string): Promise<void> {
  logger.info(`[AI] ========================================`);
  logger.info(`[AI] GENERATING ALL CONTRACT EXPLANATIONS`);
  logger.info(`[AI] Analysis ID: ${analysisId}`);
  logger.info(`[AI] ========================================`);

  const contracts = await prisma.contract.findMany({
    where: { analysisId },
    select: {
      address: true,
      name: true,
      kindOnChain: true,
      sourceType: true,
      aiExplanation: true,
      aiExplanationSourceType: true,
    },
  });

  // Filter out EOA (wallets) - only process contracts with actual code
  const contractsToProcess = contracts.filter(c => c.kindOnChain !== "EOA");
  const skippedEOA = contracts.length - contractsToProcess.length;

  logger.info(`[AI] Found ${contracts.length} total, ${contractsToProcess.length} contracts to process (skipped ${skippedEOA} EOA wallets)`);

  // Separate contracts that need generation vs already cached
  const needsGeneration: typeof contractsToProcess = [];
  let cached = 0;

  for (const contract of contractsToProcess) {
    if (contract.aiExplanation && contract.aiExplanationSourceType === contract.sourceType) {
      logger.debug(`[AI] Skipping ${contract.address.slice(0, 10)}... (already has explanation)`);
      cached++;
    } else {
      needsGeneration.push(contract);
    }
  }

  logger.info(`[AI] ${needsGeneration.length} contracts need AI explanation, ${cached} already cached`);

  if (needsGeneration.length === 0) {
    logger.info(`[AI] ✅ All contracts already have explanations`);
    return;
  }

  // Process in parallel batches to speed up while avoiding rate limits
  const BATCH_SIZE = 5; // Process 5 contracts at a time
  let generated = 0;
  let errors = 0;

  for (let i = 0; i < needsGeneration.length; i += BATCH_SIZE) {
    const batch = needsGeneration.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(needsGeneration.length / BATCH_SIZE);

    logger.info(`[AI] Processing batch ${batchNum}/${totalBatches} (${batch.length} contracts)...`);

    // Process batch in parallel
    const results = await Promise.allSettled(
      batch.map(async (contract) => {
        logger.info(`[AI] Generating explanation for ${contract.name || contract.address.slice(0, 10)}...`);
        return generateContractExplanation(analysisId, contract.address);
      })
    );

    // Count results
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const contract = batch[j];
      if (result.status === "fulfilled") {
        generated++;
      } else {
        logger.error(`[AI] ❌ Failed to generate explanation for ${contract.address}:`, result.reason);
        errors++;
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < needsGeneration.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  logger.info(`[AI] ========================================`);
  logger.info(`[AI] CONTRACT EXPLANATIONS COMPLETE`);
  logger.info(`[AI] Generated: ${generated}, Cached: ${cached}, Skipped EOA: ${skippedEOA}, Errors: ${errors}`);
  logger.info(`[AI] ========================================`);
}

// ============================================
// RAG Indexing
// ============================================

/**
 * Index analysis content for RAG
 * Skips EOA (wallets) and uses parallel processing for speed
 */
export async function indexAnalysisForRag(analysisId: string): Promise<void> {
  logger.info(`[AI] ========================================`);
  logger.info(`[AI] INDEXING ANALYSIS FOR RAG`);
  logger.info(`[AI] Analysis ID: ${analysisId}`);
  logger.info(`[AI] ========================================`);

  // Fetch all relevant content
  logger.info(`[AI] Fetching content to index...`);
  const [contracts, summary, sourceFiles] = await Promise.all([
    prisma.contract.findMany({ where: { analysisId } }),
    prisma.globalAnalysisSummary.findUnique({ where: { analysisId } }),
    prisma.sourceFile.findMany({
      where: { analysisId },
      include: { typeDefs: true },
    }),
  ]);

  // Filter out EOA (wallets) - only index contracts with actual code
  const contractsToIndex = contracts.filter(c => c.kindOnChain !== "EOA");
  const skippedEOA = contracts.length - contractsToIndex.length;

  logger.info(`[AI] Found ${contracts.length} total, ${contractsToIndex.length} contracts to index (skipped ${skippedEOA} EOA wallets), summary: ${summary ? "YES" : "NO"}, source files: ${sourceFiles.length}`);

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

  // Add contract documents (excluding EOA)
  for (const contract of contractsToIndex) {
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

  // Add type definitions (interfaces, contracts, libraries, abstract contracts)
  // Extract type definitions from source files
  for (const sourceFile of sourceFiles) {
    for (const typeDef of sourceFile.typeDefs) {
      // Extract the type definition code from the source file
      const extractedCode = extractTypeDefinition(
        sourceFile.content,
        typeDef.name,
        typeDef.kind as "INTERFACE" | "LIBRARY" | "ABSTRACT_CONTRACT" | "CONTRACT_IMPL"
      );

      const parts: string[] = [];
      parts.push(`Type Definition: ${typeDef.name}`);
      parts.push(`Kind: ${typeDef.kind}`);
      parts.push(`Contract Address: ${sourceFile.contractAddress}`);
      parts.push(`Source File: ${sourceFile.path}`);
      parts.push(`Instanciable: ${typeDef.instanciable}`);
      if (typeDef.isRootContractType) {
        parts.push(`Root Contract Type: Yes`);
      }

      if (extractedCode) {
        // Truncate extracted code for embedding
        const truncatedCode = truncateToTokens(extractedCode, 2000);
        parts.push(`\nSource Code:\n${truncatedCode}`);
      } else {
        // Fallback: include a snippet from the source file around the type name
        const typeNameIndex = sourceFile.content.indexOf(typeDef.name);
        if (typeNameIndex !== -1) {
          const snippet = sourceFile.content.slice(
            Math.max(0, typeNameIndex - 200),
            Math.min(sourceFile.content.length, typeNameIndex + 2000)
          );
          parts.push(`\nSource Code (snippet):\n${snippet}`);
        }
      }

      // Build refId: typedef:contractAddress:typeName
      const refId = `typedef:${sourceFile.contractAddress}:${typeDef.name}`;

      documents.push({
        kind: "type",
        refId,
        content: parts.join("\n"),
      });

      logger.debug(`[AI] Added type definition ${typeDef.name} from ${sourceFile.contractAddress.slice(0, 10)}... to index`);
    }
  }

  logger.info(`[AI] Prepared ${documents.length} documents for indexing`);

  // Process in parallel batches for speed
  const BATCH_SIZE = 5;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(documents.length / BATCH_SIZE);

    logger.info(`[AI] Indexing batch ${batchNum}/${totalBatches} (${batch.length} documents)...`);

    // Process batch in parallel
    const results = await Promise.allSettled(
      batch.map(async (doc) => {
        // Create the document first
        const ragDoc = await prisma.ragDocument.create({
          data: {
            analysisId,
            kind: doc.kind,
            refId: doc.refId,
            content: doc.content,
          },
        });

        // Create and store embedding
        const embedding = await createEmbedding(doc.content);
        await storeEmbedding(ragDoc.id, embedding);

        return ragDoc.id;
      })
    );

    // Count results
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const doc = batch[j];
      if (result.status === "fulfilled") {
        successCount++;
        logger.debug(`[AI] ✅ Indexed ${doc.kind}:${doc.refId.slice(0, 10)}...`);
      } else {
        errorCount++;
        logger.error(`[AI] ❌ Failed to index ${doc.refId}:`, result.reason);
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < documents.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  logger.info(`[AI] ========================================`);
  logger.info(`[AI] RAG INDEXING COMPLETE`);
  logger.info(`[AI] Success: ${successCount}, Errors: ${errorCount}, Skipped EOA: ${skippedEOA}`);
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
