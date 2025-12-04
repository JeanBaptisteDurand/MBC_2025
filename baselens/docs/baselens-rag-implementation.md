# BaseLens RAG Chat System - Implementation Summary

## Overview

The BaseLens RAG (Retrieval Augmented Generation) chat system has been enhanced to work similarly to SuiLens RAG, but adapted for EVM smart contracts on the Base network. The system provides AI-powered chat capabilities with complete analysis context, enhanced question processing, and source tracking.

## Key Features

### 1. Complete Analysis Inventory
- Loads **all graph nodes** for an analysis (contracts, wallets, source files, type definitions, events, addresses)
- Provides structured inventory to the AI so it "knows" the entire graph
- Categorizes nodes by type: smart contracts, proxies, implementations, factories, libraries, abstract contracts, interfaces, wallets (EOA/smart wallet), and other nodes

### 2. Enhanced Question Processing
- Builds enhanced questions with analysis context for better vector search
- Includes contract addresses, labels, and node type information
- Uses dynamic limit based on analysis size: `(numberOfContracts + numberOfNodes) * 2` (min 5, max 20)

### 3. Layered Context Strategy
The system builds context in layers, preferring higher-level information:
1. **Complete Analysis Inventory** - Full node list with metadata
2. **Global Analysis Summary** - High-level explanation and security notes
3. **Contract Explanations** - AI-generated per-contract explanations (preferred over raw code)
4. **Raw Documents** - Source code, ABI, decompiled code (fallback when explanations don't exist)

### 4. EVM-Specific System Prompt
- Tailored for EVM smart contracts on Base network
- Includes rules for handling contract addresses, proxies, upgradeability, factories, and security
- Emphasizes using ONLY provided context (no hallucination)

### 5. Source Tracking
- Returns `sourcesUsed` array with:
  - Document kind (contract, global, type, etc.)
  - Contract address (when applicable)
  - Node ID (for graph reference)
  - Similarity score
  - Content preview

## Implementation Details

### Files Modified

1. **`apps/server/src/ai/rag.ts`**
   - Added `buildAnalysisInventory()` - Builds complete node inventory
   - Added `formatAnalysisInventory()` - Formats inventory for LLM
   - Added `buildEnhancedQuestion()` - Enhances user question with context
   - Added `buildLayeredContext()` - Builds layered context with source tracking
   - Updated `processRagChat()` - Main function with all enhancements
   - Updated system prompt to `RAG_SYSTEM_PROMPT_EVM`

2. **`apps/server/src/routes/rag.ts`**
   - Updated POST `/api/rag/chat` endpoint to return `sourcesUsed`

3. **`packages/core/src/index.ts`**
   - Added `RagSourceUsed` interface
   - Updated `RagChatResponse` to include `sourcesUsed`

### Key Functions

#### `buildAnalysisInventory(analysisId: string)`
- Fetches analysis and graph data
- Categorizes all nodes into contracts, wallets, and other nodes
- Determines contract types (proxy, implementation, factory, library, etc.)
- Identifies wallet roles (deployer, user, etc.)

#### `buildEnhancedQuestion(analysisId, question, graphContext?)`
- Builds question with analysis context
- Includes contract list and node type information
- Calculates dynamic limit for vector search
- Returns enhanced query and limit

#### `buildLayeredContext(analysisId, inventory, vectorResults, summary)`
- Builds context in layers (inventory → explanations → raw docs)
- Prefers AI explanations over raw source code
- Tracks sources used with metadata
- Returns context string and sources array

## API Usage

### Endpoint: `POST /api/rag/chat`

#### Request

```json
{
  "analysisId": "550e8400-e29b-41d4-a716-446655440000",
  "chatId": "optional-existing-chat-id",
  "question": "What does this contract do?",
  "graphContext": {
    "visibleNodes": [
      {
        "id": "contract:0x1234...",
        "kind": "contract",
        "name": "MyContract",
        "address": "0x1234..."
      }
    ],
    "edges": [
      {
        "kind": "CREATED",
        "from": "address:0xabcd...",
        "to": "contract:0x1234..."
      }
    ]
  }
}
```

#### Response

```json
{
  "chatId": "660e8400-e29b-41d4-a716-446655440001",
  "answer": "This contract is a token factory that creates ERC20 tokens...",
  "sourcesUsed": [
    {
      "kind": "global",
      "refId": "summary",
      "similarity": 1.0,
      "contentPreview": "This analysis contains a token factory contract..."
    },
    {
      "kind": "contract",
      "refId": "0x1234567890123456789012345678901234567890",
      "contractAddress": "0x1234567890123456789012345678901234567890",
      "nodeId": "contract:0x1234567890123456789012345678901234567890",
      "similarity": 0.95,
      "contentPreview": "This contract implements a factory pattern..."
    },
    {
      "kind": "contract",
      "refId": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      "contractAddress": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      "nodeId": "contract:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      "similarity": 0.87,
      "contentPreview": "pragma solidity ^0.8.0; contract TokenFactory..."
    }
  ]
}
```

### Example: Question with only `analysisId`

#### Request

```json
{
  "analysisId": "550e8400-e29b-41d4-a716-446655440000",
  "question": "List all proxy contracts in this analysis"
}
```

#### Response

```json
{
  "chatId": "660e8400-e29b-41d4-a716-446655440001",
  "answer": "Based on the analysis inventory, there are 2 proxy contracts:\n\n1. **0x1234...5678** (TransparentUpgradeableProxy)\n   - Implementation: 0xabcd...ef01\n   - Verified: Yes\n\n2. **0x9876...5432** (UUPS Proxy)\n   - Implementation: 0xfedc...ba09\n   - Verified: No (decompiled)",
  "sourcesUsed": [
    {
      "kind": "global",
      "refId": "summary",
      "similarity": 1.0,
      "contentPreview": "This analysis contains proxy contracts..."
    },
    {
      "kind": "contract",
      "refId": "0x1234567890123456789012345678901234567890",
      "contractAddress": "0x1234567890123456789012345678901234567890",
      "nodeId": "contract:0x1234567890123456789012345678901234567890",
      "similarity": 0.92,
      "contentPreview": "This is a TransparentUpgradeableProxy contract..."
    },
    {
      "kind": "contract",
      "refId": "0x9876543210987654321098765432109876543210",
      "contractAddress": "0x9876543210987654321098765432109876543210",
      "nodeId": "contract:0x9876543210987654321098765432109876543210",
      "similarity": 0.89,
      "contentPreview": "This contract uses the UUPS upgrade pattern..."
    }
  ]
}
```

## Frontend Integration

The frontend `RagChatWidget` component already sends `analysisId` with questions. The component will automatically receive `sourcesUsed` in the response, which can be displayed to show which contracts/nodes were used to generate the answer.

### Example Frontend Usage

```typescript
const response = await sendRagMessage({
  analysisId: "550e8400-e29b-41d4-a716-446655440000",
  question: "What are the security risks?",
  graphContext: buildGraphContext(), // Optional
});

// Access sources used
console.log(response.sourcesUsed);
// [
//   { kind: "global", refId: "summary", ... },
//   { kind: "contract", contractAddress: "0x1234...", nodeId: "contract:0x1234...", ... }
// ]
```

## How It Works

1. **User sends question** with `analysisId`
2. **System builds complete inventory** of all graph nodes
3. **Question is enhanced** with analysis context (contracts, node types)
4. **Vector search** is performed with enhanced question and dynamic limit
5. **Layered context is built**:
   - Inventory (always included)
   - Global summary (if available)
   - Contract explanations (preferred)
   - Raw documents (fallback)
6. **LLM generates answer** using EVM-specific system prompt
7. **Response includes** answer and `sourcesUsed` array

## Notes

- The system **never duplicates** content: if an explanation exists, it's used instead of raw source code
- Contract addresses are treated as **case-insensitive** (0xABC = 0xabc)
- The **dynamic limit** scales with analysis size but is capped at 20 for performance
- **EOA wallets** are included in the inventory but not in contract explanations
- The system **prioritizes explanations** over raw code for better AI understanding

## Future Enhancements

- Support for `selectedNodeIds` or `contractAddress` scoping in requests
- Caching of inventory for faster subsequent queries
- Source highlighting in frontend based on `sourcesUsed`
- Support for multi-analysis queries
