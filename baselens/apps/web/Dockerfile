# BaseLens Web Dockerfile
FROM node:20-slim AS base

# Install pnpm
RUN npm install -g pnpm@9

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
	python3 \
	make \
	g++ \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY packages/core/package.json ./packages/core/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code
COPY packages/core ./packages/core
COPY apps/web ./apps/web

# Build core package
WORKDIR /app/packages/core
RUN pnpm build

# Build web app for production
WORKDIR /app/apps/web

# Development mode - use Vite dev server
EXPOSE 3000

CMD ["pnpm", "dev", "--host", "0.0.0.0"]
