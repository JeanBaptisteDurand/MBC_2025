#!/bin/sh
set -e

echo "🔄 Waiting for PostgreSQL to be ready..."

# Wait for postgres to be available
until nc -z postgres 5432; do
  echo "⏳ PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "✅ PostgreSQL is ready!"

echo "🔄 Running Prisma migrations..."
cd /app/apps/server

# Push the schema to the database (creates tables if they don't exist)
npx prisma db push --accept-data-loss

echo "✅ Database initialized!"

echo "🚀 Starting server..."
exec pnpm dev

