# 🟦 BaseLens

### AI-powered smart-contract analysis & autonomous on-chain agent for **Base L2**

**BaseLens** is a full-stack platform for exploring, understanding, and interacting with smart contracts deployed on **Base Mainnet & Base Sepolia**.  

The system automatically analyzes contracts, reconstructs graphs of interactions, explains code using AI, and allows users to ask contract-aware questions through an intelligent **RAG Chat system**.  

A built-in **On-Chain Agent** can receive natural-language instructions (for example: “swap 0.1 ETH to USDC then stake it”) and **execute actions autonomously** on Base using AgentKit.

---

## 🚀 What the platform does

| Feature | Description |
| --- | --- |
| 🔎 Contract Analysis | Fetch verified ABI & source via BaseScan → fallback decompilation via Panoramix → recursive dependency & proxy discovery |
| 🧠 AI Code Understanding | Every contract is summarized, embedded, indexed → searchable via RAG Q/A chat |
| 🕸 Contract Graph Visualization | A live React Flow graph shows proxies, factories, inheritance & cross-calls |
| 🤖 On-Chain Agent Execution | AgentKit can take funds, run swaps/staking steps, and return unused tokens |
| 🧩 Smart Wallet Support | ERC-4337 smart wallets via ZeroDev + paymaster gas sponsorship |
| 💳 Monetization-Ready | x402 on-chain payments (USDC) → gated AI chat access |

---

## 🏗 Architecture Overview

![BaseLens Architecture](./docs/arch.png)

**High-Level Flow**

1. User connects wallet and submits an analysis request  
2. Backend runs a queued job → fetches / decompiles the contract → stores metadata + embeddings  
3. User can visualize the system & ask questions through the **RAG Chat AI**  
4. Optional: user triggers an agent execution (swap / stake / send back funds) which runs on-chain via AgentKit and the Base network

---

## 🔥 Full Tech Stack

**Core:** TypeScript, Node.js, pnpm  

**Frontend:** React, Vite, React Flow, TailwindCSS, Radix UI, React Query  

**Web3 & Onchain UX:** OnchainKit, AgentKit, smart wallet support, ZeroDev, paymaster, ERC-4337 account abstraction  

**Blockchain / Data Sources:** Base SDK, BaseScan API, Panoramix decompiler  

**AI & Data Layer:** OpenAI (chat + embeddings), PostgreSQL, pgvector, Redis, RAG system  

**Payments & Monetization:** x402 protocol (USDC on Base), solidity smart contract

**Infra & Runtime:** Docker, Docker Compose, Express, Prisma, BullMQ 

**→ Bonus Integrations Implemented (all requested in the track):**  
✔ Base SDK • ✔ OnchainKit • ✔ Smart Wallets • ✔ Paymaster • ✔ ERC-4337 • ✔ AgentKit • ✔ x402 • ✔ BaseScan API


---

## 🛠 Local Setup

```bash
cd baselens
pnpm install

# Start4
docker-compose up -d --build
```


## 🧠 Problem & Solution

**Problem:**  
On Base, reading and understanding complex smart-contract systems (proxies, factories, upgradeable contracts, etc.) is hard. Developers and users must jump between explorers, ABIs, and bytecode, and there is no simple way to ask high-level questions or automate multi-step DeFi workflows safely.

**BaseLens Solution:**

- Automatically analyzes and reconstructs a **graph view** of contract systems (proxies, factories, inheritance, runtime calls) on **Base Mainnet & Base Sepolia**
- Uses **AI + RAG over pgvector** to explain contracts and answer questions grounded in actual code and metadata
- Exposes an **on-chain agent** (AgentKit on Base) able to:
  - receive funds from the user,
  - perform swaps / staking steps,
  - and send remaining tokens back
- Integrates **x402** for USDC-based pay-per-use access to RAG chat → showcasing a production-ready, monetizable API on Base
- Optional **smart wallet** UX via **ZeroDev + paymaster (ERC-4337)** to support gasless interactions

---

## 📦 Repo & Submission Checklist

- **Project Name:** BaseLens  
- **Track:** Base Main Track  
- **Network:** Base Mainnet & Base Sepolia  
- **Repository:** https://github.dev/JeanBaptisteDurand/MBC_2025  
- **Demo Video (3–5 min):** *<insert YouTube / Google Drive link>*  

### 🔗 Deployed Contracts
| Address | Description |
|--------|-------------|
| `0x3A7F370D0C105Afc23800253504656ae99857bde` | Payment contract used for analysis / x402 access |
| `0x1705ea88ef9f10165d5268b315f23823ee0a20f3` | Agent execution simulation contract (Base Sepolia) |
