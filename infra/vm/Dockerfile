FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --omit=dev

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY dist/server ./dist/server
COPY src/inngest/executor/sandbox-cdp-driver.py ./src/inngest/executor/sandbox-cdp-driver.py
EXPOSE 8081
CMD ["node", "dist/server/connect-worker.js"]