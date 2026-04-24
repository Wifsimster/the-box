#!/bin/sh
set -e

echo "Starting The Box..."

# Run better-auth migrations first
echo "Running better-auth migrations..."
cd /app/packages/backend
npx @better-auth/cli migrate

# Run database migrations
echo "Running database migrations..."
npm run db:migrate

# Seed geo mode pilot data (idempotent — no-op once rows exist)
echo "Seeding geo mode data..."
npm run db:seed:geo

# Start the backend server
echo "Starting backend server..."
cd /app/packages/backend
exec node dist/index.js
