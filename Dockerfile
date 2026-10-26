# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod --ignore-scripts

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 WIDGET_PORT=3001
COPY --from=build /app/package.json /app/server.js ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/seed ./seed
COPY --from=build /app/widgets ./widgets
# Shared modules the widget sandbox serves as plain JS (types stripped at startup).
COPY --from=build /app/src/lib/core/mathexpr.ts ./src/lib/core/mathexpr.ts
COPY --from=build /app/src/lib/client/plot.ts ./src/lib/client/plot.ts
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME /app/data
EXPOSE 3000 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
