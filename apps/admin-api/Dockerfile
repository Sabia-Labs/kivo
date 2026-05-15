# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first for layer caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and compile
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && cp -r src/seed/definitions dist/seed/

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# Copy manifests and install production dependencies only
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist
COPY migrations ./migrations
COPY seed ./seed

# Install curl — required for k8s liveness/readiness probes
RUN apk add --no-cache curl

# Run as non-root user
RUN addgroup -S kivo && adduser -S kivo -G kivo
USER kivo

EXPOSE 4001

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
