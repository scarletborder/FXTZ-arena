FROM node:20-alpine AS base
RUN npm i -g pnpm@8.15.6

FROM base AS builder
WORKDIR /app
RUN npm i -g turbo@2.9.14
COPY . .
RUN turbo prune dedicated-server --docker

FROM base AS installer
WORKDIR /app
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

ARG APP_VERSION=0.0.0
ARG APP_COMMIT=local
ENV APP_VERSION=$APP_VERSION
ENV APP_COMMIT=$APP_COMMIT

COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
RUN pnpm turbo run build --filter=dedicated-server...

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=22334
COPY --from=installer /app/apps/dedicated-server/dist ./apps/dedicated-server/dist
COPY --from=installer /app/apps/dedicated-server/package.json ./apps/dedicated-server/package.json

EXPOSE 22334
CMD ["node", "apps/dedicated-server/dist/index.js"]
