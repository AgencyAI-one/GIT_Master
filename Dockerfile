FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP_PASSWORD=build-only-password
ENV APP_SECRET=build-only-session-secret-that-is-never-used-at-runtime
ENV ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs gitmaster
COPY --from=builder --chown=gitmaster:nodejs /app/public ./public
COPY --from=builder --chown=gitmaster:nodejs /app/.next/standalone ./
COPY --from=builder --chown=gitmaster:nodejs /app/.next/static ./.next/static
RUN mkdir -p /app/data && chown gitmaster:nodejs /app/data
USER gitmaster
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
