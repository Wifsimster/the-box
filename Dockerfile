ARG VERSION=dev
ARG BUILD_DATE
ARG VCS_REF

FROM node:24-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

RUN npm ci

FROM deps AS builder
WORKDIR /app

COPY packages/types ./packages/types
COPY packages/backend ./packages/backend
COPY packages/frontend ./packages/frontend
COPY tsconfig.json ./

RUN npm run build:types

RUN npm run build:backend

ARG VERSION
ENV VITE_APP_VERSION=${VERSION}
ENV VITE_API_URL=""
ARG VITE_KOE_PROJECT_KEY=the-box
ARG VITE_KOE_API_URL=https://koe.battistella.ovh
ENV VITE_KOE_PROJECT_KEY=${VITE_KOE_PROJECT_KEY}
ENV VITE_KOE_API_URL=${VITE_KOE_API_URL}
RUN npm run build:frontend

FROM node:24-alpine AS runner

RUN apk add --no-cache font-dejavu

ARG VERSION
ARG BUILD_DATE
ARG VCS_REF

LABEL org.opencontainers.image.title="The Box" \
    org.opencontainers.image.description="Screenshot guessing game" \
    org.opencontainers.image.version="${VERSION}" \
    org.opencontainers.image.created="${BUILD_DATE}" \
    org.opencontainers.image.revision="${VCS_REF}" \
    org.opencontainers.image.source="https://github.com/wifsimster/the-box" \
    org.opencontainers.image.vendor="wifsimster" \
    maintainer="wifsimster"

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 thebox

COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/backend/package.json ./packages/backend/

RUN npm ci --omit=dev --ignore-scripts && \
    npm install --ignore-scripts -w @the-box/backend tsx @better-auth/cli@1.4.10

COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist

RUN find ./packages/backend/dist ./packages/types/dist -name '*.js.map' -delete

COPY packages/backend/migrations ./packages/backend/migrations
COPY packages/backend/seeds ./packages/backend/seeds
COPY packages/backend/knexfile.ts ./packages/backend/knexfile.ts

COPY packages/backend/data ./packages/backend/data

COPY --from=builder /app/packages/frontend/dist ./packages/frontend/dist

RUN mkdir -p /app/uploads && chown -R thebox:nodejs /app/uploads

RUN chown -R thebox:nodejs /app

EXPOSE 80

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

COPY scripts/db-backup.sh /scripts/db-backup.sh
COPY scripts/db-backup-cron /etc/crontabs/root
RUN chmod +x /scripts/db-backup.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/healthz || exit 1

CMD ["/docker-entrypoint.sh"]
