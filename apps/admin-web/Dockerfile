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

ARG API_INTERNAL_URL=http://kivo-admin-api:4001
ARG NEXT_PUBLIC_API_URL=/admin-api
ARG NEXT_PUBLIC_KIVO_WEB_URL=http://localhost:3000
ARG NEXT_PUBLIC_ADMIN_WEB_URL=http://localhost:3001

ENV NEXT_TELEMETRY_DISABLED=1
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_KIVO_WEB_URL=${NEXT_PUBLIC_KIVO_WEB_URL}
ENV NEXT_PUBLIC_ADMIN_WEB_URL=${NEXT_PUBLIC_ADMIN_WEB_URL}

RUN npm run build

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S kivo && adduser -S kivo -G kivo

COPY --from=builder --chown=kivo:kivo /app/.next/standalone ./
COPY --from=builder --chown=kivo:kivo /app/.next/static ./.next/static
COPY --from=builder --chown=kivo:kivo /app/public ./public

USER kivo

EXPOSE 3001

ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
