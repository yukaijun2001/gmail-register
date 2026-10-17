FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api-server/package.json apps/api-server/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm config set store-dir /pnpm/store && pnpm install --filter @gmail-manager/api-server... --frozen-lockfile
COPY packages/contracts packages/contracts
COPY apps/api-server apps/api-server
RUN pnpm --filter @gmail-manager/contracts build && pnpm --filter @gmail-manager/api-server prisma:generate && pnpm --filter @gmail-manager/api-server build

FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/apps/api-server ./apps/api-server
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @gmail-manager/api-server prisma:migrate && node apps/api-server/dist/src/main.js"]
