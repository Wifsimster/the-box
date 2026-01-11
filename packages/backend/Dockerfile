# Stage 1: Install dependencies
FROM node:24-alpine AS deps
WORKDIR /app

# Copy workspace configuration
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/backend/package.json ./packages/backend/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Stage 2: Build TypeScript
FROM deps AS builder
WORKDIR /app

# Copy source files
COPY packages/types ./packages/types
COPY packages/backend ./packages/backend
COPY tsconfig.json ./

# Build types first (dependency), then backend
RUN npm run build:types && npm run build:backend

# Stage 3: Production runtime
FROM node:24-alpine AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 thebox

# Copy package files for production install
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/backend/package.json ./packages/backend/

# Install production dependencies only
# Note: We keep tsx for running TypeScript migrations
RUN npm ci --omit=dev && npm install -w @the-box/backend tsx

# Copy built artifacts
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist

# Copy migrations, seeds, and knexfile for runtime migrations
COPY packages/backend/migrations ./packages/backend/migrations
COPY packages/backend/seeds ./packages/backend/seeds
COPY packages/backend/knexfile.ts ./packages/backend/knexfile.ts

# Create uploads directory
RUN mkdir -p /app/uploads && chown -R thebox:nodejs /app/uploads

# Set ownership of app directory
RUN chown -R thebox:nodejs /app

# Switch to non-root user
USER thebox

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Set working directory for the backend
WORKDIR /app/packages/backend

# Start command with migration
CMD ["sh", "-c", "npx knex migrate:latest --knexfile knexfile.ts && node dist/index.js"]
