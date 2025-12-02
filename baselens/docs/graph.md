# BaseLens Graph Architecture

## Overview

BaseLens analyzes smart contracts on the Base blockchain and builds a comprehensive **knowledge graph** of their relationships. This document explains what information we collect, how we collect it, and how we transform it into a meaningful graph structure.

---

## Table of Contents

1. [Data Sources](#1-data-sources)
2. [Analysis Pipeline](#2-analysis-pipeline)
3. [Node Types](#3-node-types)
4. [Edge Types](#4-edge-types)
5. [Graph Building Process](#5-graph-building-process)
6. [Recursion & Discovery](#6-recursion--discovery)
7. [Database Schema](#7-database-schema)
8. [Visual Representation](#8-visual-representation)

---

## 1. Data Sources

We use three primary data sources, in order of priority:

### 1.1 Base RPC (SDK) - Primary Source
**What:** Direct blockchain queries via viem/ethers
**Why:** Most reliable, real-time, trustless data

| RPC Method | What We Get | Used For |
|------------|-------------|----------|
| `eth_getCode(address)` | Runtime bytecode | Determine if EOA or contract, detect minimal proxies |
| `eth_getStorageAt(address, slot)` | Storage slot values | EIP-1967 proxy detection (implementation, admin, beacon) |
| `eth_getTransactionReceipt(hash)` | Transaction receipt | Contract creation details |
| `eth_getLogs(filter)` | Event logs | Future: event tracking |

**EIP-1967 Storage Slots:**
```
IMPLEMENTATION: 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
ADMIN:          0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103
BEACON:         0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50
```

### 1.2 Basescan API - Secondary Source
**What:** Block explorer API (Etherscan V2 compatible)
**Why:** Verified source code, ABI, metadata, creation info

| API Endpoint | What We Get | Used For |
|--------------|-------------|----------|
| `getsourcecode` | Verified source, ABI, compiler info, proxy flag | Full contract metadata |
| `getabi` | ABI only (when source not verified) | Function signatures |
| `getcontractcreation` | Creator address, creation tx hash | Factory/deployer tracking |
| `txlistinternal` | Internal transactions | Factory forward detection, runtime callees |

**Full metadata from `getsourcecode`:**
- `SourceCode` - Solidity source (single or multi-file JSON)
- `ABI` - Contract ABI
- `ContractName` - Verified contract name
- `CompilerVersion` - e.g., "v0.8.19+commit.7dd6d404"
- `OptimizationUsed` - "0" or "1"
- `Runs` - Optimizer runs count
- `EVMVersion` - e.g., "paris", "london"
- `Library` - Linked libraries
- `LicenseType` - SPDX license
- `Proxy` - "0" or "1" (Basescan's proxy detection)
- `Implementation` - Implementation address if proxy
- `SwarmSource` - IPFS/Swarm hash

### 1.3 Panoramix Decompiler - Fallback Source
**What:** EVM bytecode decompiler
**Why:** Get pseudo-Solidity when no verified source exists

**When used:**
- Contract has bytecode (not EOA)
- No verified source on Basescan
- Even if we have ABI-only

**Output:** Pseudo-Solidity with function signatures and logic

---

## 2. Analysis Pipeline

### 2.1 Queue-Based Exploration

We use a queue-based crawler that explores contracts recursively:

```
┌─────────────────────────────────────────────────────────────────┐
│                     ANALYSIS CONTEXT                            │
├─────────────────────────────────────────────────────────────────┤
│  queue: QueueItem[]     - Addresses waiting to be analyzed      │
│  visited: Set<string>   - Addresses already analyzed            │
│  pending: Set<string>   - Addresses currently in queue          │
│  bytecodeCache: Map     - Cached bytecode for efficiency        │
└─────────────────────────────────────────────────────────────────┘

Queue Reasons (why an address was added):
┌──────────────────────┬──────────────────────────────────────────┐
│ ROOT                 │ User-provided starting address           │
│ PROXY_IMPLEMENTATION │ Found via EIP-1967 slot or Basescan      │
│ SOURCE_DECLARED_IMPL │ Implementation declared in source code   │
│ CREATOR_CONTRACT     │ Contract that deployed this contract     │
│ FACTORY_CREATED      │ Contract created by a factory            │
│ RUNTIME_CALLEE       │ Contract called at runtime               │
│ HARDCODED_ADDRESS    │ Address found hardcoded in source        │
└──────────────────────┴──────────────────────────────────────────┘
```

### 2.2 Per-Contract Analysis Flow

**For EVERY contract in the queue (not just root):**

```
┌─────────────────────────────────────────────────────────────────┐
│                 CONTRACT ANALYSIS PIPELINE                       │
└─────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │  Queue Item     │
                    │  (address)      │
                    └────────┬────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: ON-CHAIN ANALYSIS                                     │
├─────────────────────────────────────────────────────────────────┤
│  Step 1: eth_getCode(address)                                   │
│          → Is it EOA (0x) or Contract (has bytecode)?           │
│                                                                 │
│  Step 2: Proxy Detection (if contract)                          │
│          → EIP-1967: Read IMPLEMENTATION, ADMIN, BEACON slots   │
│          → EIP-1167: Pattern match bytecode for minimal proxy   │
│                                                                 │
│  Step 3: Creator Info (Basescan)                                │
│          → getcontractcreation → creator address, tx hash       │
│          → eth_getCode(creator) → is creator a contract?        │
│                                                                 │
│  Step 4: Factory Forward Detection (Basescan)                   │
│          → txlistinternal → find "create" type transactions     │
│          → Extract addresses of contracts created by this one   │
│                                                                 │
│  Step 5: Runtime Callee Detection (Basescan)                    │
│          → txlistinternal → find CALL/DELEGATECALL/STATICCALL   │
│          → Extract addresses this contract calls                │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: SOURCE CODE ANALYSIS                                  │
├─────────────────────────────────────────────────────────────────┤
│  Step 1: Basescan getsourcecode                                 │
│          → If hasSource: parse verified source + all metadata   │
│          → Check Proxy flag → may discover implementation       │
│                                                                 │
│  Step 1.5: If PROXY without source                              │
│          → Try getsourcecode(implementationAddress)             │
│          → Use implementation's source for proxy                │
│                                                                 │
│  Step 2: ABI-Only Fallback                                      │
│          → If no source: try getabi for function signatures     │
│                                                                 │
│  Step 3: Panoramix Decompilation                                │
│          → If still no source: decompile bytecode               │
│          → Generate pseudo-Solidity                             │
│                                                                 │
│  Step 4: Source Parsing                                         │
│          → Extract type definitions (contract, interface, lib)  │
│          → Extract hardcoded addresses (0x[40 hex chars])       │
│          → Extract declared implementations (proxy patterns)    │
│          → Parse inheritance (is X, Y, Z)                       │
│          → Parse library usage (using X for Y)                  │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: ENQUEUE RELATED ADDRESSES                             │
├─────────────────────────────────────────────────────────────────┤
│  1. Implementation address (from proxy detection)               │
│  2. All discovered implementations (RPC + Basescan + Source)    │
│  3. Creator contract (if creator is a contract, not EOA)        │
│  4. Created contracts (factory forward)                         │
│  5. Runtime callees                                             │
│  6. Hardcoded addresses that are contracts                      │
│                                                                 │
│  Deduplication: Skip if in visited OR pending                   │
│  Capacity check: Stop at MAX_CONTRACTS_PER_ANALYSIS (100)       │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: PERSIST TO DATABASE                                   │
├─────────────────────────────────────────────────────────────────┤
│  → Upsert Contract record with all metadata                     │
│  → Create SourceFile records for each source file               │
│  → Create TypeDef records for each type definition              │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
                    [Next item in queue]
```

### 2.3 Stopping Conditions

The analysis stops when:
1. **Queue empty** - All reachable contracts have been analyzed
2. **Capacity limit** - `visited.size >= 100` contracts

---

## 3. Node Types

### 3.1 ContractNode

**Represents:** A smart contract on the blockchain

**Data collected:**
```typescript
{
  kind: "contract",
  id: "contract:0x...",
  address: string,
  name?: string,                    // From Basescan (verified name)
  isRoot: boolean,                  // Is this the analysis starting point?
  kindOnChain: ContractKindOnChain, // EOA | CONTRACT_SIMPLE | PROXY | IMPLEMENTATION
  isFactory?: boolean,              // Did this contract create other contracts?
  verified: boolean,                // Is source code verified on Basescan?
  sourceType: SourceType,           // verified | decompiled | none
  creatorAddress?: string,          // Who deployed this contract?
  creationTxHash?: string,          // Deployment transaction
  tags: {
    // Proxy info
    hasEip1967ImplSlot?: boolean,
    isMinimalProxy?: boolean,
    proxyAdmin?: string,
    implementationAddress?: string,
    proxyFlag?: "0" | "1",
    // Compiler metadata
    compilerVersion?: string,
    optimizationUsed?: string,
    runs?: string,
    evmVersion?: string,
    swarmSource?: string,
    // Error tracking
    decompileError?: string,
  }
}
```

**Visual styling:**
| Type | Display Name | Color | Border | Glow | Icon |
|------|--------------|-------|--------|------|------|
| Root | Root Contract | Orange (#f97316) | 2px orange | Orange glow | 📄 |
| Proxy | Proxy | Purple (#8b5cf6) | 2px purple | Purple glow | 🔗 |
| Implementation | Implementation | Blue (#3b82f6) | 1px blue | Blue glow | 🛡️ |
| Factory | **Deployer Factory** | Green (#22c55e) | 1px green | Green glow | 🏭 |
| Simple | Contract | Gray (#6b7280) | 1px gray | None | 📄 |
| EOA | **Wallet (EOA)** | Slate (#94a3b8) | **Dashed** | None | 👛 |

**EOA vs Contract:**

When `kindOnChain === "EOA"`, the node is displayed as a **Wallet** instead of a contract:
- **Wallet (EOA)** = Externally Owned Account = A regular wallet address controlled by a private key
- These addresses have **no bytecode** on-chain
- Display: Slate color, dashed border, wallet icon (👛)
- Badge: "👤 Wallet"

This helps users immediately recognize that an address is a wallet, not a smart contract.

### 3.2 SourceFileNode

**Represents:** A source code file associated with a contract

**Data collected:**
```typescript
{
  kind: "sourceFile",
  id: "source:0x...:path/to/File.sol",
  contractAddress: string,
  path: string,                     // File path within the project
  sourceType: "verified" | "decompiled",
}
```

**Source origin:**
- **Verified:** From Basescan `getsourcecode` - can be single file or multi-file JSON
- **Decompiled:** From Panoramix - always `Decompiled.sol`

### 3.3 TypeDefNode

**Represents:** A type definition found in source code

**Data collected:**
```typescript
{
  kind: "typeDef",
  id: "typedef:0x...:TypeName",
  name: string,
  typeKind: TypeDefKind,           // INTERFACE | LIBRARY | ABSTRACT_CONTRACT | CONTRACT_IMPL
  instanciable: boolean,           // Can this type be deployed?
  isRootContractType?: boolean,    // Is this the main contract type?
  sourceFileId: "source:...",      // Which SPECIFIC file declares this type
}
```

**Type Kinds Explained:**

| Kind | Display Name | Color | Icon | Deployable | Description |
|------|--------------|-------|------|------------|-------------|
| **INTERFACE** | Interface | Cyan | 🧩 | No | Defines a contract's external API without implementation. Other contracts can implement this interface. |
| **LIBRARY** | Library | Teal | 📚 | No | Contains reusable code that can be called by other contracts. Libraries cannot store state and cannot receive ETH. |
| **ABSTRACT_CONTRACT** | Abstract Contract | Violet | 📦 | No | Has at least one unimplemented function. Cannot be deployed directly but must be inherited. |
| **CONTRACT_IMPL** | **Deployable Contract** | Pink | 📄 | **Yes** | A fully implemented contract that can be deployed to the blockchain. This is the main type that gets deployed. |

**What is "Deployable"?**

`instanciable: true` (displayed as "Deployable") means the type can be **deployed as a standalone contract** on the blockchain.

- **Deployable = true:** Only `CONTRACT_IMPL` types (displayed as "Deployable Contract"). These have all functions implemented and can exist independently on-chain.
- **Deployable = false:** Interfaces, libraries, and abstract contracts. These exist only as part of the source code or as dependencies.

**Why Pink for Deployable Contracts?**

Pink represents concrete implementations in our color scheme:
- Pink = "This code actually runs on the blockchain"
- It's distinct from interfaces (cyan), libraries (teal), and abstract contracts (violet)
- The root contract type (the main contract being analyzed) is additionally highlighted with an orange "⭐ Main Contract" badge

**Type detection patterns:**
```solidity
interface IMyInterface { ... }        → INTERFACE (instanciable: false)
library MyLibrary { ... }             → LIBRARY (instanciable: false)
abstract contract MyAbstract { ... }  → ABSTRACT_CONTRACT (instanciable: false)
contract MyContract { ... }           → CONTRACT_IMPL (instanciable: true)
```

**Source File Linking:**

Each TypeDefNode has a `sourceFileId` that points to the **specific source file** that declares it:
- `sourceFileId: "source:0xabc123:contracts/MyContract.sol"`
- This creates a DECLARES_TYPE edge from that specific file to the type
- Interfaces, libraries, and abstract contracts link to their declaring file, NOT to all source files

**Inheritance parsing:**
```solidity
contract Foo is Bar, Baz, IMyInterface { ... }
         │      │    │    │
         │      │    │    └─ IMPLEMENTS_INTERFACE edge
         │      │    └────── EXTENDS_CONTRACT edge
         │      └─────────── EXTENDS_CONTRACT edge
         └────────────────── Type definition
```

### 3.4 AddressNode

**Represents:** An external address that's not a contract in our analysis (EOA - Externally Owned Account)

**When created:**
- Creator address that's an EOA (no bytecode) → **Deployer Wallet**
- Hardcoded address that's an EOA → **External Wallet**
- Referenced address not yet analyzed → **External Wallet**

**Data:**
```typescript
{
  kind: "address",
  id: "address:0x...",
  address: string,
  label?: string,  // e.g., "Deployer Wallet (5 contracts)"
}
```

**Visual distinction:**

| Label Contains | Icon | Color | Meaning |
|----------------|------|-------|---------|
| "Deployer Wallet" | 👛 | Green | This EOA deployed contracts in the analysis |
| Other / No label | 👛 | Slate | External wallet or referenced address |

**Deployer Wallet vs Deployer Factory:**

- **Deployer Wallet (AddressNode, Green):** An EOA (no bytecode) that deployed contracts. Controlled by a private key.
- **Deployer Factory (ContractNode, Green):** A smart contract that deployed other contracts. Has bytecode and is analyzed.
- **Wallet (AddressNode, Slate):** Any other external address - could be referenced in source code or called at runtime.

**How we determine if a deployer is EOA or Contract:**
1. When analyzing a contract, we get its `creatorAddress` from Basescan
2. We call `eth_getCode(creatorAddress)` via RPC to check for bytecode
3. If no bytecode → EOA → becomes an AddressNode labeled "Deployer Wallet"
4. If has bytecode → Contract → added to analysis queue → becomes a ContractNode labeled "Deployer Factory"

### 3.5 EventNode (Future)

**Represents:** An event emitted by a contract

**Data:**
```typescript
{
  kind: "event",
  id: "event:...",
  contractAddress: string,
  signature: string,     // e.g., "Transfer(address,address,uint256)"
  txHash: string,
  timestamp: string,
}
```

---

## 4. Edge Types

### 4.1 Contract Relationship Edges

#### IS_PROXY_OF
**Meaning:** This contract is a proxy that delegates to an implementation
**Direction:** Proxy → Implementation
**Color:** Orange (#f97316)

**How detected:**
1. **EIP-1967:** Read storage slot `0x360894...` via `eth_getStorageAt`
2. **EIP-1167:** Pattern match bytecode for `363d3d373d3d3d363d73...5af43d82803e903d91602b57fd5bf3`
3. **Basescan:** `Proxy: "1"` and `Implementation` field in `getsourcecode`

**Evidence stored:**
```json
{
  "implementationSlot": "0x360894...",  // If EIP-1967
  "isMinimalProxy": true                // If EIP-1167
}
```

#### SOURCE_DECLARED_IMPL
**Meaning:** This contract's source code declares an implementation address
**Direction:** Contract → Implementation
**Color:** Orange-400 (#fb923c)

**How detected:**
Pattern matching in source code:
```solidity
address implementation = 0x1234...;
_setImplementation(0x1234...);
upgradeTo(0x1234...);
upgradeToAndCall(0x1234...);
address beacon = 0x1234...;
```

#### CALLS_RUNTIME
**Meaning:** This contract calls another contract at runtime
**Direction:** Caller → Callee
**Color:** Blue (#3b82f6)

**How detected:**
- Basescan `txlistinternal` API
- Filter for transactions FROM this contract that aren't `create` type

#### REFERENCES_ADDRESS
**Meaning:** This contract's source code contains a hardcoded address
**Direction:** Contract → Referenced Address
**Color:** Slate (#64748b)

**How detected:**
Regex pattern matching: `/\b(0x[a-fA-F0-9]{40})\b/g`

**Excluded addresses:**
- Zero address: `0x0000000000000000000000000000000000000000`
- Max address: `0xffffffffffffffffffffffffffffffffffffffff`
- Native token: `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`
- Precompiles: `0x0000000000000000000000000000000000000001-9`

### 4.2 Factory/Deployment Edges

#### CREATED_BY
**Meaning:** This contract was deployed by another address
**Direction:** Contract → Creator
**Color:** Green (#22c55e)

**How detected:**
- Basescan `getcontractcreation` API
- Returns `contractCreator` and `txHash`

**Evidence stored:**
```json
{
  "txHash": "0xabc123..."
}
```

#### CREATED
**Meaning:** This contract deployed another contract (factory pattern)
**Direction:** Factory → Created Contract
**Color:** Green (#22c55e)

**How detected:**
- Basescan `txlistinternal` API
- Filter for `type: "create"` transactions FROM this contract
- Extract `contractAddress` field

**Evidence stored:**
```json
{
  "txHash": "0xabc123..."
}
```

### 4.3 Source Relationship Edges

#### HAS_SOURCE_FILE
**Meaning:** This contract has associated source code
**Direction:** Contract → SourceFile
**Color:** Purple (#8b5cf6)

#### DECLARES_TYPE
**Meaning:** This source file declares a type
**Direction:** SourceFile → TypeDef
**Color:** Pink (#ec4899)

**Note:** Type definitions (contracts, interfaces, libraries, abstract contracts) are only linked to their source files via `DECLARES_TYPE` edges. There is no direct edge between Contract nodes and TypeDef nodes.

### 4.4 Type Inheritance Edges

#### EXTENDS_CONTRACT
**Meaning:** This type extends/inherits from another type
**Direction:** Child → Parent
**Color:** Rose (#f43f5e)

**How detected:**
```solidity
contract Child is Parent { ... }
                    └─ EXTENDS_CONTRACT edge to Parent
```

#### IMPLEMENTS_INTERFACE
**Meaning:** This type implements an interface
**Direction:** Implementation → Interface
**Color:** Yellow (#eab308)

**How detected:**
```solidity
contract MyContract is IMyInterface { ... }
                       └─ IMPLEMENTS_INTERFACE edge (name starts with "I")
```

#### USES_LIBRARY
**Meaning:** This type uses a library
**Direction:** User → Library
**Color:** Teal (#14b8a6)

**How detected:**
```solidity
using SafeMath for uint256;
       └─ USES_LIBRARY edge to SafeMath
```

---

## 5. Graph Building Process

After all contracts are analyzed, we build edges in a single pass:

```
┌─────────────────────────────────────────────────────────────────┐
│                    EDGE BUILDING PROCESS                        │
└─────────────────────────────────────────────────────────────────┘

For each analyzed contract:

1. IS_PROXY_OF edges
   └─ If contract.implementationAddress exists
      └─ Create edge: contract → implementation

2. SOURCE_DECLARED_IMPL edges
   └─ For each sourceInfo.declaredImplementations
      └─ Create edge: contract → declared implementation

3. CREATED_BY / CREATED edges
   └─ If contract.creatorAddress exists
      └─ Create CREATED_BY: contract → creator
      └─ If creator is also a contract in our analysis
         └─ Create CREATED: creator → contract

4. HAS_SOURCE_FILE edges
   └─ For each source file
      └─ Create edge: contract → sourceFile

5. Type edges (per type definition)
   └─ DECLARES_TYPE: sourceFile → typeDef (only from declaring file)
   └─ EXTENDS_CONTRACT: typeDef → parent
   └─ IMPLEMENTS_INTERFACE: typeDef → interface
   └─ USES_LIBRARY: typeDef → library

6. REFERENCES_ADDRESS edges
   └─ For each hardcoded address in source
      └─ Create edge: contract → address

7. CALLS_RUNTIME edges
   └─ For each runtime callee
      └─ Create edge: contract → callee
```

---

## 6. Recursion & Discovery

### 6.1 Discovery Flow

```
                          Root Contract
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
    EIP-1967 Slot        Basescan Proxy         Source Code
    (RPC Storage)        (API Response)         (Pattern Match)
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                               ▼
                    Implementation Contract
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
    Creator Info         Created Contracts      Hardcoded Addrs
    (Basescan)           (Internal Txs)        (Source Parsing)
         │                     │                     │
         ▼                     ▼                     ▼
    Factory Contract     Child Contracts      Referenced Contracts
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                               ▼
                    [Continue recursively...]
```

### 6.2 Deduplication

We maintain two sets:
- **visited:** Addresses that have been fully analyzed
- **pending:** Addresses currently in the queue

When enqueueing:
```typescript
function enqueue(ctx, item) {
  const addr = item.address.toLowerCase();
  
  if (ctx.visited.has(addr)) return false;  // Already done
  if (ctx.pending.has(addr)) return false;  // Already queued
  
  if (ctx.visited.size + ctx.pending.size >= 100) return false;  // Capacity
  
  ctx.queue.push(item);
  ctx.pending.add(addr);
  return true;
}
```

### 6.3 Example Discovery Chain

```
Analysis of: 0xABC123... (TransparentUpgradeableProxy)

Queue: [0xABC123 (ROOT)]

#1: 0xABC123
    → EIP-1967 detected → impl: 0xDEF456
    → Creator: 0x111111 (is contract!)
    → Queue: [0xDEF456 (PROXY_IMPL), 0x111111 (CREATOR_CONTRACT)]

#2: 0xDEF456 (Implementation)
    → Creator: 0x111111
    → Source has: address _newImpl = 0xGHI789
    → Queue: [0x111111 (CREATOR), 0xGHI789 (SOURCE_DECLARED_IMPL)]

#3: 0x111111 (Factory)
    → Created 5 contracts via internal txs
    → isFactory = true
    → Queue: [0xGHI789, 0x222..., 0x333..., 0x444..., 0x555..., 0x666...]

#4-8: Created contracts analyzed...

Analysis complete: 8 contracts, 15 edges
```

---

## 7. Database Schema

### 7.1 Contract Table

```sql
Contract {
  id                    UUID PRIMARY KEY
  analysisId            UUID FK → Analysis
  address               VARCHAR UNIQUE per analysis
  name                  VARCHAR
  kindOnChain           VARCHAR  -- EOA | CONTRACT_SIMPLE | PROXY | IMPLEMENTATION
  network               VARCHAR  -- base-mainnet | base-sepolia
  verified              BOOLEAN
  sourceType            VARCHAR  -- verified | decompiled | none
  tagsJson              JSONB    -- All metadata as JSON
  abiJson               JSONB    -- Parsed ABI
  sourceCode            TEXT     -- First source file content
  creatorAddress        VARCHAR
  creationTxHash        VARCHAR
  compilerVersion       VARCHAR
  optimizationUsed      VARCHAR
  runs                  VARCHAR
  evmVersion            VARCHAR
  library               VARCHAR
  licenseType           VARCHAR
  constructorArguments  TEXT
  proxyFlag             VARCHAR
  implementationAddress VARCHAR
  swarmSource           VARCHAR
  decompileError        VARCHAR
}
```

### 7.2 Edge Table

```sql
Edge {
  id           UUID PRIMARY KEY
  analysisId   UUID FK → Analysis
  fromNodeId   VARCHAR  -- e.g., "contract:0x..."
  toNodeId     VARCHAR  -- e.g., "address:0x..."
  kind         VARCHAR  -- EdgeKind enum
  evidenceJson JSONB    -- Supporting evidence
}
```

### 7.3 Node ID Format

```
contract:0xabcd1234...     → ContractNode
source:0xabcd:MyFile.sol   → SourceFileNode  
typedef:0xabcd:MyContract  → TypeDefNode
address:0xabcd1234...      → AddressNode
event:abc123               → EventNode
```

---

## 8. Visual Representation

### 8.1 Layout Algorithm

Contracts are positioned using a smart hierarchical layout:

```
                    ┌──────────────┐
                    │     ROOT     │ ← Center (0, 0)
                    │   Contract   │
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
   ┌──────────┐     ┌──────────┐     ┌──────────┐
   │  Source  │     │  Proxy   │     │ Creator  │
   │  Files   │     │  Target  │     │ Address  │
   └──────────┘     └────┬─────┘     └──────────┘
                         │
                         ▼
                   ┌──────────┐
                   │ Type     │
                   │ Defs     │
                   └──────────┘
```

### 8.2 Edge Styling

| Importance | Stroke Width | Animation | Label |
|------------|--------------|-----------|-------|
| IS_PROXY_OF | 3px | Animated dash | "→ impl" |
| CREATED_BY/CREATED | 2.5px | None | "deployed by"/"deployed" |
| CALLS_RUNTIME | 2px | Animated dash | "calls" |
| HAS_SOURCE_FILE | 1.5px | None | "source" |
| Other | 1px | None | Varies |

### 8.3 Filter Presets

| Preset | Nodes | Edges |
|--------|-------|-------|
| **Full Graph** | All | All |
| **Contracts Only** | contract, address | IS_PROXY_OF, CALLS_RUNTIME, CREATED_BY, CREATED, REFERENCES_ADDRESS |
| **Source Code** | contract, sourceFile | IS_PROXY_OF, HAS_SOURCE_FILE |
| **Type Hierarchy** | contract, sourceFile, typeDef | HAS_SOURCE_FILE, DECLARES_TYPE, EXTENDS_CONTRACT, IMPLEMENTS_INTERFACE, USES_LIBRARY |
| **Factory Relations** | contract, address | CREATED_BY, CREATED |
| **Proxy Architecture** | contract | IS_PROXY_OF, CALLS_RUNTIME, SOURCE_DECLARED_IMPL |

---

## 9. Side Panel Information

When you click on a node in the graph, the right drawer shows detailed information.

### 9.1 Contract/Wallet Details

| Field | Description |
|-------|-------------|
| **Address** | Full address with copy and Basescan link |
| **Name** | Verified contract name (if available) |
| **Type & Status** | Badges: Root, Wallet (EOA), Proxy, Implementation, Factory, Verified, Decompiled |
| **Creator** | Address that deployed this contract with Basescan link |
| **Creation Tx** | Link to the deployment transaction |
| **ABI Summary** | Count of functions and events |
| **Functions** | List of functions with their signatures and mutability |
| **Actions** | View Source Code, See AI Explanation |

### 9.2 Address/Wallet Details

| Field | Description |
|-------|-------------|
| **Icon & Type** | 🏭 Deployer/Factory (green) or 👛 Wallet (slate) |
| **Address** | Full address with copy and Basescan link |
| **Role** | Label like "Factory/Deployer (N contracts)" |
| **Explanation** | Contextual description of what this address represents |

### 9.3 Type Definition Details

| Field | Description |
|-------|-------------|
| **Icon & Name** | Type-specific icon with name and kind |
| **Defined In** | The specific source file that declares this type |
| **Type Category** | INTERFACE (cyan), LIBRARY (teal), ABSTRACT_CONTRACT (violet), CONTRACT_IMPL (pink) |
| **Properties** | Deployable badge, Main Contract badge |
| **Explanation** | Description of what this type kind means |
| **CONTRACT_IMPL Info** | Special explanation for pink "instanciable" types |

### 9.4 Source File Details

| Field | Description |
|-------|-------------|
| **File Path** | Full path of the source file |
| **Source Type** | Verified (green) or Decompiled (amber) |
| **Action** | Open Full Source button |

---

## Summary

BaseLens builds a comprehensive knowledge graph by:

1. **Starting** from a user-provided contract address
2. **Querying** RPC for on-chain data (bytecode, storage slots)
3. **Enriching** with Basescan data (verified source, metadata, creation info)
4. **Falling back** to Panoramix when no verified source exists
5. **Parsing** source code for types, relationships, and hardcoded addresses
6. **Recursively** discovering related contracts through multiple pathways
7. **Building** a rich graph with typed nodes and semantic edges
8. **Visualizing** the relationships in an interactive UI

The result is a complete map of a smart contract's ecosystem: its proxies, implementations, factories, dependencies, and code structure.
