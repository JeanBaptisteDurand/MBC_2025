# BaseLens Server Dockerfile
FROM node:20-slim AS base

# Install pnpm and utilities
RUN npm install -g pnpm@9

# Install dependencies for Panoramix and utilities
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Install Panoramix decompiler (don't fail build if it fails)
RUN pip3 install --break-system-packages panoramix-decompiler 2>&1 && \
    echo "✅ Panoramix installed successfully" || \
    echo "❌ PANORAMIX INSTALLATION FAILED - decompilation will not work for unverified contracts"

# Test Panoramix (informational only)
RUN panoramix --help > /dev/null 2>&1 && \
    echo "✅ Panoramix CLI test passed" || \
    echo "⚠️ Panoramix CLI test failed (may still work)"

WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY packages/core/package.json ./packages/core/
COPY apps/server/package.json ./apps/server/

# Copy source code first (needed for proper workspace dependency resolution)
COPY packages/core ./packages/core
COPY apps/server ./apps/server

# Install dependencies (with source present for proper workspace linking)
RUN pnpm install --frozen-lockfile || pnpm install

# Build core package
WORKDIR /app/packages/core
RUN pnpm build

# Generate Prisma client
WORKDIR /app/apps/server
RUN pnpm db:generate

# Build server
RUN pnpm build || true

# Copy entrypoint script
COPY apps/server/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port
EXPOSE 3001

# Use entrypoint script to initialize DB before starting
ENTRYPOINT ["/docker-entrypoint.sh"]
