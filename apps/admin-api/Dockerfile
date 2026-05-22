# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first for layer caching
COPY apps/admin-api/package.json apps/admin-api/package-lock.json* ./
RUN npm install

# Copy source and compile
COPY apps/admin-api/tsconfig.json ./
COPY apps/admin-api/src ./src
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# Copy manifests and install production dependencies only
COPY apps/admin-api/package.json apps/admin-api/package-lock.json* ./
RUN npm install --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist
COPY apps/admin-api/migrations ./migrations
COPY definitions ./definitions

# Install curl — required for k8s liveness/readiness probes
RUN apk add --no-cache curl

# Run as non-root user
RUN addgroup -S kivo && adduser -S kivo -G kivo
USER kivo

EXPOSE 4001

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
