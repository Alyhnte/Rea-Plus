#!/usr/bin/env node
// rea-plus çalışır MCP sunucusu: conduit 30 + 98 rea tool (stdio/HTTP).
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { parseServeOptions, PROTOCOL_VERSION } from "./conduit-core/server.js";
import { registerTools } from "./conduit-core/tools.js";
import { registerReaTools } from "./server/registerReaTools.js";

export const REA_PLUS_NAME = "rea-plus";
export const REA_PLUS_VERSION = "0.4.0";

export function createReaPlusMcpServer(): McpServer {
  const server = new McpServer({ name: REA_PLUS_NAME, version: REA_PLUS_VERSION }, { capabilities: { tools: {} } });
  registerTools(server); // conduit 30 araç (isimler dondurulmuş)
  registerReaTools(server); // 98 rea aracı (merkezi gerçek kayıt)
  return server;
}

type Opts = ReturnType<typeof parseServeOptions>;
// Token kapısı: DBG_BRIDGE_TOKEN varsa Bearer zorunlu (conduit ile aynı).
function authed(auth: string | undefined, want: string): boolean {
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) return false;
  const d = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(d(auth.slice(7)), d(want));
}
// HTTP: conduit mantığı (/health + /mcp), fabrika rea-plus.
export function startHttp(o: Opts): void {
  const h = createMcpHandler(() => createReaPlusMcpServer(), { legacy: "stateless", responseMode: "json" });
  const nh = toNodeHandler(h);
  const vh = localhostHostValidation(); const vo = localhostOriginValidation();
  const srv = createServer((req, res) => {
    if (o.token !== undefined && !authed(req.headers.authorization, o.token)) {
      res.writeHead(401, { "content-type": "application/json" }); res.end('{"error":"unauthorized"}'); return; }
    const path = req.url?.split("?")[0] ?? "/";
    if (req.method === "GET" && path === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", name: REA_PLUS_NAME, version: REA_PLUS_VERSION, protocol: PROTOCOL_VERSION, transport: "streamable-http" })); return; }
    if (path !== "/mcp") { res.writeHead(404, { "content-type": "application/json" }); res.end('{"error":"not_found"}'); return; }
    if (!vh(req, res) || !vo(req, res)) return;
    void nh(req, res);
  });
  srv.listen(o.port, o.host, () => console.error(`${REA_PLUS_NAME} streamable-http ${PROTOCOL_VERSION} http://${o.host}:${o.port}/mcp`));
  const stop = () => void h.close().finally(() => srv.close(() => process.exit(0)));
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}

export function startStdio(): void { serveStdio(() => createReaPlusMcpServer(), { legacy: "serve" }); }

function main(): void {
  let o: Opts;
  try { o = parseServeOptions(process.argv.slice(2)); } // --transport/--port/--host + DBG_BRIDGE_* env
  catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); }
  if (o.transport === "http") { startHttp(o); return; }
  startStdio();
}

const _argv1 = process.argv[1]?.replace(/\\/g, "/") ?? "";
const invokedDirectly = (_argv1.endsWith("/src/server.ts") || _argv1.endsWith("/dist/server.js"))
  && !_argv1.includes("conduit-core");
if (invokedDirectly) main();
