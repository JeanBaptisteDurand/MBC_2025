# BaseLens

**Smart Contract Analysis for Base L2**

BaseLens is a blockchain analysis tool for the Base L2 network. It allows you to analyze smart contracts, visualize their relationships, and get AI-powered insights about their functionality and security.

## Features

- 🔍 **Contract Analysis**: Analyze any contract on Base mainnet or Sepolia
- 📊 **Interactive Graph**: Visualize proxy patterns, inheritance, and runtime relationships
- 🤖 **AI Insights**: Get AI-generated explanations and security notes
- 💬 **RAG Chat**: Ask questions about analyzed contracts
- 📝 **Source Code Viewer**: View verified or decompiled source code
- 🌙 **Dark/Light Theme**: Beautiful, cyberpunk-inspired UI

## Architecture

```
baselens/
├── apps/
│   ├── web/          # Frontend (Vite + React)
│   └── server/       # Backend (Express + Prisma + BullMQ)
├── packages/
│   └── core/         # Shared TypeScript types
├── docker-compose.yml
└── pnpm-workspace.yaml
```

## Tech Stack

### Frontend
- React + Vite + TypeScript
- TailwindCSS
- React Flow (graph visualization)
- React Query
- Radix UI

### Backend
- Node.js + Express + TypeScript
- Prisma (PostgreSQL + pgvector)
- BullMQ + Redis (job queue)
- OpenAI (AI analysis)
- viem (Base RPC client)

### Infrastructure
- PostgreSQL 16 with pgvector
- Redis 7

## Quick Start

### Prerequisites

- Docker & Docker Compose (required)
- Node.js 20+ and pnpm 9+ (for local development only)

### 🐳 Docker Setup (Recommended - Everything Runs Automatically)

1. **Set up environment variables**:
   ```bash
   cd baselens
   cp env.template .env
   ```

2. **Edit `.env`** and add your API keys:
   ```bash
   # Required
   OPENAI_API_KEY=sk-your-openai-api-key
   
   # Recommended (for verified source code)
   BASESCAN_API_KEY=your-basescan-api-key
   ```

3. **Start everything** (DB is auto-initialized):
   ```bash
   docker-compose up
   ```
   
   First run will:
   - Build the containers
   - Initialize PostgreSQL with pgvector
   - Run Prisma migrations
   - Start the server and frontend

4. **Access the app**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

### Local Development Setup (Alternative)

1. **Install dependencies**:
   ```bash
   cd baselens
   pnpm install
   ```

2. **Set up environment**:
   ```bash
   cp env.template .env
   # Edit .env with your API keys
   ```

3. **Start infrastructure only**:
   ```bash
   docker-compose up -d postgres redis
   ```

4. **Initialize database**:
   ```bash
   pnpm db:push
   ```

5. **Start development servers**:
   ```bash
   pnpm dev
   ```

### Hot Reloading

When using `docker-compose up`, source code is mounted as volumes.
Changes to files in `apps/server/src`, `apps/web/src`, or `packages/core/src` 
will trigger automatic reload.

## Usage

1. Open http://localhost:3000
2. Enter a Base contract address (e.g., `0x...`)
3. Select the network (Base Mainnet or Sepolia)
4. Click "Start Analysis"
5. Wait for the analysis to complete
6. Explore the interactive graph!

## API Endpoints

### Analysis
- `POST /api/analyze` - Start a new analysis
- `GET /api/analyze/:jobId/status` - Get job status
- `GET /api/analysis/:analysisId/graph` - Get graph data
- `GET /api/analysis/:analysisId/summary` - Get AI summary
- `GET /api/analysis/history` - Get all analyses

### Source Code
- `GET /api/source/:analysisId/:address` - Get contract source
- `GET /api/source/:analysisId/:address/abi` - Get contract ABI

### RAG Chat
- `POST /api/rag/chat` - Send a chat message
- `GET /api/rag/chat?analysisId=...` - Get chat history

## Graph Node Types

- **Contract Nodes**: On-chain contracts (root, proxy, implementation, factory)
- **Source File Nodes**: Verified or decompiled source files
- **Type Definition Nodes**: Interfaces, abstract contracts, libraries, implementations

## Edge Types

- `IS_PROXY_OF` - Proxy → Implementation relationship
- `CALLS_RUNTIME` - Runtime call relationships
- `CREATED_BY` / `CREATED` - Factory pattern relationships
- `HAS_SOURCE_FILE` - Contract → Source file
- `DECLARES_TYPE` - Source file → Type definition
- `EXTENDS_CONTRACT` / `IMPLEMENTS_INTERFACE` - Inheritance
- `USES_LIBRARY` - Library usage

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `PORT` | Server port | `3001` |
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `OPENAI_CHAT_MODEL` | Chat model | `gpt-4o-mini` |
| `OPENAI_EMBEDDING_MODEL` | Embedding model | `text-embedding-3-small` |
| `BASE_RPC_URL` | Base mainnet RPC | `https://mainnet.base.org` |
| `BASESCAN_API_KEY` | Basescan API key | Optional |

## Development

### Commands

```bash
# Development
pnpm dev          # Start all dev servers
pnpm dev:server   # Start backend only
pnpm dev:web      # Start frontend only

# Database
pnpm db:push      # Push schema to database
pnpm db:migrate   # Run migrations
pnpm db:studio    # Open Prisma Studio

# Build
pnpm build        # Build all packages

# Docker
pnpm docker:up    # Start all containers
pnpm docker:down  # Stop all containers
```

## License

MIT

