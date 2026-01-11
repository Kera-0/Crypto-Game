# syntax=docker.io/docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1


# Install dependencies only when needed
FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc* ./
RUN corepack enable \
 && corepack prepare pnpm@10.28.0 --activate \
 && pnpm install --frozen-lockfile


FROM base AS dev
ENV NODE_ENV=development

RUN corepack enable \
 && corepack prepare pnpm@10.28.0 --activate

ENV WATCHPACK_POLLING=true
ENV WATCHPACK_POLL_INTERVAL=800

ENV CHOKIDAR_USEPOLLING=true
ENV CHOKIDAR_INTERVAL=300

COPY --from=deps /app/node_modules ./node_modules
EXPOSE 3000
CMD ["pnpm","dev"]


# Rebuild the source code only when needed
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable \
 && corepack prepare pnpm@10.28.0 --activate \
 && pnpm build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
