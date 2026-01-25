#!/bin/bash

# Run E2E Tests - Helper Script
# This script sets up the environment and runs E2E tests

set -e

echo "🚀 Setting up E2E test environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker Desktop."
    exit 1
fi

# Start PostgreSQL if not running
echo "📦 Starting PostgreSQL..."
docker compose up -d postgres
sleep 3

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
    echo "   Still waiting..."
    sleep 2
done
echo "✅ PostgreSQL is ready"

# Check if backend is running
if ! curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "⚠️  Backend is not running on port 3000"
    echo ""
    echo "Please start the backend in a separate terminal:"
    echo "  npm run dev:backend"
    echo ""
    echo "Or press Ctrl+C to cancel and start it manually, then run this script again."
    echo "Waiting 10 seconds for you to start the backend..."
    sleep 10

    # Check again
    if ! curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        echo "❌ Backend still not running. Exiting."
        echo ""
        echo "To run E2E tests, you need:"
        echo "  1. Terminal 1: npm run dev:backend"
        echo "  2. Terminal 2: npm run test:e2e -w @the-box/frontend"
        exit 1
    fi
fi

echo "✅ Backend is running"
echo ""
echo "🧪 Running E2E tests..."
echo ""

# Run E2E tests
cd packages/frontend

if [ "$1" == "--ui" ]; then
    echo "Opening Playwright UI..."
    npm run test:e2e:ui
elif [ "$1" == "--headed" ]; then
    echo "Running tests in headed mode..."
    npm run test:e2e:headed
elif [ "$1" == "--debug" ]; then
    echo "Running tests in debug mode..."
    npm run test:e2e:debug
elif [ -n "$1" ]; then
    # Run specific test file
    echo "Running tests from: $1"
    npx playwright test "$1"
else
    # Run all tests
    npm run test:e2e
fi

# Show report
echo ""
echo "📊 Opening test report..."
npx playwright show-report
