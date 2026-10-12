# rea-plus MCP sunucusu: varsayilan stdio, HTTP icin argumanla acilir.
#   stdio : docker run -i --rm ghcr.io/alyhnte/reaplus
#   http  : docker run -p 3848:3848 ghcr.io/alyhnte/reaplus --transport http --port 3848 --host 0.0.0.0
# Not: x64dbg/cdb gibi Windows debugger motorlari container'da capability_unsupported doner;
# statik analiz + CLI + HTTP yuzeyi calisir. Token icin: -e DBG_BRIDGE_TOKEN=...
FROM node:22-bookworm-slim

WORKDIR /app

# Bagimliliklar (frida prebuild ile gelir; kurulum scriptleri paketin kendi akisina birakilir).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Kaynak + build (tsc + runtime asset kopyalama).
COPY tsconfig.json ./
COPY src ./src
COPY scripts/copy-assets.mjs ./scripts/copy-assets.mjs
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

COPY server.json ./server.json
COPY configs ./configs

ENV NODE_ENV=production
EXPOSE 3848
ENTRYPOINT ["node", "dist/server.js"]
