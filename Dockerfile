# rea-plus MCP sunucusu: varsayilan stdio, HTTP icin argumanla acilir.
#   stdio : docker run -i --rm ghcr.io/alyhnte/reaplus
#   http  : docker run -p 3848:3848 ghcr.io/alyhnte/reaplus --transport http --port 3848 --host 0.0.0.0
# Not: x64dbg/cdb gibi Windows debugger motorlari container'da capability_unsupported doner;
# statik analiz + CLI + HTTP yuzeyi calisir. Token icin: -e DBG_BRIDGE_TOKEN=...

# --- build: bagimliliklar + derleme (prepare, kaynak varken dist uretir) ---
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund && npm prune --omit=dev --no-audit --no-fund

# --- production: yalniz calisma zamani dosyalari, root olmayan kullanici ---
FROM node:22-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json server.json ./
COPY --chown=node:node configs ./configs
USER node
EXPOSE 3848
ENTRYPOINT ["node", "dist/server.js"]
