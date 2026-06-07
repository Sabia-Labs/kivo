# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy manifests first for layer caching
COPY apps/kivo-api/pnpm-workspace.yaml apps/kivo-api/pnpm-lock.yaml apps/kivo-api/package.json ./
RUN pnpm install

# Copy source and compile
COPY apps/kivo-api/tsconfig.json apps/kivo-api/drizzle.config.ts ./
COPY apps/kivo-api/src ./src
RUN pnpm build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy manifests and install production dependencies only
COPY apps/kivo-api/pnpm-workspace.yaml apps/kivo-api/pnpm-lock.yaml apps/kivo-api/package.json ./
RUN pnpm install --prod

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy migrations so the app can run them on startup
COPY apps/kivo-api/migrations ./migrations

# Copy definitions to the expected path /app/definitions
COPY definitions ./definitions

# Install curl — required for exec-based k8s liveness/readiness probes
RUN apk add --no-cache curl

# Run as non-root user
RUN addgroup -S kivo && adduser -S kivo -G kivo
USER kivo

EXPOSE 4000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
