@echo off
REM Run E2E Tests - Helper Script for Windows
REM This script sets up the environment and runs E2E tests

echo.
echo ================================
echo E2E Test Environment Setup
echo ================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Error: Docker is not running. Please start Docker Desktop.
    exit /b 1
)

REM Start PostgreSQL
echo 📦 Starting PostgreSQL...
docker compose up -d postgres
timeout /t 3 /nobreak >nul

echo ⏳ Waiting for PostgreSQL to be ready...
:wait_postgres
docker compose exec -T postgres pg_isready -U postgres >nul 2>&1
if errorlevel 1 (
    echo    Still waiting...
    timeout /t 2 /nobreak >nul
    goto wait_postgres
)
echo ✅ PostgreSQL is ready
echo.

REM Check if backend is running
curl -s http://localhost:3000/api/health >nul 2>&1
if errorlevel 1 (
    echo ⚠️  Backend is not running on port 3000
    echo.
    echo Please start the backend in a separate terminal:
    echo   npm run dev:backend
    echo.
    echo Then press any key to continue, or Ctrl+C to cancel...
    pause >nul

    REM Check again
    curl -s http://localhost:3000/api/health >nul 2>&1
    if errorlevel 1 (
        echo ❌ Backend still not running. Exiting.
        echo.
        echo To run E2E tests, you need:
        echo   1. Terminal 1: npm run dev:backend
        echo   2. Terminal 2: npm run test:e2e -w @the-box/frontend
        exit /b 1
    )
)

echo ✅ Backend is running
echo.
echo 🧪 Running E2E tests...
echo.

REM Run E2E tests
cd packages\frontend

if "%1"=="--ui" (
    echo Opening Playwright UI...
    call npm run test:e2e:ui
) else if "%1"=="--headed" (
    echo Running tests in headed mode...
    call npm run test:e2e:headed
) else if "%1"=="--debug" (
    echo Running tests in debug mode...
    call npm run test:e2e:debug
) else if not "%1"=="" (
    echo Running tests from: %1
    call npx playwright test %1
) else (
    call npm run test:e2e
)

echo.
echo 📊 Opening test report...
call npx playwright show-report
