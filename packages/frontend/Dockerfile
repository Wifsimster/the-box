# Stage 1: Install dependencies
FROM node:24-alpine AS deps
WORKDIR /app

# Copy workspace configuration
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/frontend/package.json ./packages/frontend/

# Install all dependencies
RUN npm ci

# Stage 2: Build application
FROM deps AS builder
WORKDIR /app

# Copy source files
COPY packages/types ./packages/types
COPY packages/frontend ./packages/frontend
COPY tsconfig.json ./

# Build types first (dependency)
RUN npm run build:types

# Set build-time environment variable (empty for same-origin API calls)
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

# Build frontend
RUN npm run build:frontend

# Stage 3: Production nginx
FROM nginx:alpine AS runner

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
