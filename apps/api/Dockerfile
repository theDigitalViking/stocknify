# ============================================================
# Stage 1: Builder
# ============================================================
FROM node:20-alpine AS builder

# Install pnpm + OpenSSL for Prisma
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy workspace config first (better layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install all dependencies (needed for build)
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/
COPY tsconfig.base.json ./

# Build shared package first (produces packages/shared/dist/)
RUN pnpm --filter @stocknify/shared build

# Generate Prisma client
RUN pnpm --filter api db:generate

# Build API TypeScript
RUN pnpm --filter api build

# ============================================================
# Stage 2: Runner (production image)
# ============================================================
FROM node:20-alpine AS runner

# Install OpenSSL for Prisma at runtime
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs apiuser

WORKDIR /app

# Copy workspace manifests for production install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Copy the generated Prisma client from builder
COPY --from=builder /app/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0 \
     ./node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0

# Copy Prisma schema for runtime
COPY apps/api/src/db/schema.prisma ./apps/api/src/db/schema.prisma

USER apiuser

EXPOSE 3001

# Health check — used by Kamal and Docker
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/v1/health || exit 1

CMD ["node", "apps/api/dist/index.js"]
