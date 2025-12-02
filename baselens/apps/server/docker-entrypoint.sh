#!/bin/sh
set -e

echo "=========================================="
echo "🚀 BaseLens Server Starting"
echo "=========================================="

echo "🔄 Step 1: Waiting for PostgreSQL..."
until nc -z postgres 5432; do
  echo "⏳ PostgreSQL is unavailable - sleeping 2s"
  sleep 2
done
echo "✅ PostgreSQL is ready!"

echo "🔄 Step 2: Waiting for Redis..."
until nc -z redis 6379; do
  echo "⏳ Redis is unavailable - sleeping 2s"
  sleep 2
done
echo "✅ Redis is ready!"

echo "🔄 Step 3: Running Prisma migrations..."
cd /app/apps/server

# Push the schema to the database (creates tables if they don't exist)
if npx prisma db push --accept-data-loss; then
  echo "✅ Database schema pushed successfully!"
else
  echo "❌ Prisma db push failed, but continuing anyway..."
fi

echo "=========================================="
echo "🚀 Starting server..."
echo "=========================================="
exec pnpm dev
