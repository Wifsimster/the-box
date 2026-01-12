# Stage 1: Install dependencies
FROM node:24-alpine AS deps
WORKDIR /app

# Copy workspace configuration
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

# Install all dependencies
RUN npm ci

# Stage 2: Build everything
FROM deps AS builder
WORKDIR /app

# Copy source files
COPY packages/types ./packages/types
COPY packages/backend ./packages/backend
COPY packages/frontend ./packages/frontend
COPY tsconfig.json ./

# Build types first (shared dependency)
RUN npm run build:types

# Build backend
RUN npm run build:backend

# Build frontend (API calls go to same origin /api)
ENV VITE_API_URL=""
RUN npm run build:frontend

# Stage 3: Production runtime
FROM node:24-alpine AS runner
WORKDIR /app

# Install nginx
RUN apk add --no-cache nginx

# Create non-root user for node app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 thebox

# Copy package files for production install
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/backend/package.json ./packages/backend/

# Install production dependencies only + tsx for migrations + better-auth CLI
RUN npm ci --omit=dev && npm install -w @the-box/backend tsx @better-auth/cli

# Copy built backend artifacts
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist

# Copy migrations, seeds, and knexfile
COPY packages/backend/migrations ./packages/backend/migrations
COPY packages/backend/seeds ./packages/backend/seeds
COPY packages/backend/knexfile.ts ./packages/backend/knexfile.ts

# Copy built frontend to nginx serve directory
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/http.d/default.conf

# Create uploads directory
RUN mkdir -p /app/uploads && chown -R thebox:nodejs /app/uploads

# Create nginx directories with proper permissions
RUN mkdir -p /var/run/nginx /var/log/nginx && \
    chown -R thebox:nodejs /var/run/nginx /var/log/nginx /var/lib/nginx

# Set ownership of app directory
RUN chown -R thebox:nodejs /app

# Expose port (nginx serves on 80)
EXPOSE 80

# Copy startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

# Start services
CMD ["/docker-entrypoint.sh"]
