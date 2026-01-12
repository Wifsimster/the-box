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

# Start nginx in the background
echo "Starting nginx..."
nginx

# Start the backend server
echo "Starting backend server..."
cd /app/packages/backend
exec node dist/index.js
