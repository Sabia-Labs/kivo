# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy manifests first for layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json* ./
RUN pnpm install

# Copy source and compile
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
RUN pnpm build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy manifests and install production dependencies only
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json* ./
RUN pnpm install --prod

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy migrations so the app can run them on startup
COPY migrations ./migrations

# Install curl — required for exec-based k8s liveness/readiness probes
# (probe: curl -sf http://127.0.0.1:4000/health)
RUN apk add --no-cache curl

# Run as non-root user
RUN addgroup -S kivo && adduser -S kivo -G kivo
USER kivo


EXPOSE 4000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
