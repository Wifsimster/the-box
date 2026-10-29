#!/bin/sh
set -e

echo "Starting The Box..."

echo "Running better-auth migrations..."
cd /app/packages/backend
npx @better-auth/cli migrate

echo "Running database migrations..."
npm run db:migrate

echo "Starting backend server..."
cd /app/packages/backend
exec node dist/index.js
