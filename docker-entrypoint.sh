#!/bin/sh
set -e

echo "Starting The Box..."

# Run migrations
echo "Running database migrations..."
cd /app/packages/backend
npm run migrate:latest

# Start nginx in the background
echo "Starting nginx..."
nginx

# Start the backend server
echo "Starting backend server..."
cd /app/packages/backend
exec node dist/index.js
