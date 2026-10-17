FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm config set store-dir /pnpm/store && pnpm install --filter @gmail-manager/admin-web... --frozen-lockfile
COPY packages/contracts packages/contracts
COPY apps/admin-web apps/admin-web
RUN pnpm --filter @gmail-manager/contracts build && pnpm --filter @gmail-manager/admin-web build

FROM nginx:1.29-alpine
COPY --from=build /app/apps/admin-web/dist /usr/share/nginx/html
COPY infra/nginx/admin.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
