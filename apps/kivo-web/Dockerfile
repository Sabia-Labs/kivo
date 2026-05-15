# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time args:
# API_INTERNAL_URL: destination for Next.js rewrites() — baked at build time.
#   In k8s:  http://kivo-api:4000 (ClusterIP, pod-to-pod)
#   In bare-metal dev: http://localhost:4000 (default fallback)
# NEXT_PUBLIC_API_URL: URL the browser will call — also baked into the client bundle.
#   In k8s:  /api  (relative path, goes through Next.js rewrite proxy)
#   In bare-metal dev: http://localhost:4000 (direct)
ARG API_INTERNAL_URL=http://kivo-api:4000
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3001
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
# Expose build args as env vars for next.config.mjs and client bundle
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

RUN npm run build

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user
RUN addgroup -S kivo && adduser -S kivo -G kivo

# Next.js standalone output bundles everything needed
COPY --from=builder --chown=kivo:kivo /app/.next/standalone ./
COPY --from=builder --chown=kivo:kivo /app/.next/static ./.next/static
COPY --from=builder --chown=kivo:kivo /app/public ./public

USER kivo

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
