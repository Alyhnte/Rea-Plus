#!/usr/bin/env node
// rea-plus çalışır MCP sunucusu: conduit 30 + 141 rea tool = 171 (stdio/HTTP).
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { parseServeOptions, PROTOCOL_VERSION } from "./conduit-core/server.js";
import { registerTools } from "./conduit-core/tools.js";
import {
  auditLoggerFromEnv,
  createAuditLogger,
  createConcurrencyGate,
  createRateLimiter,
  HTTP_READ_ONLY_TOOLS,
  httpReadOnlyAllowed,
  parseHttpLimits,
  registerWithAudit,
  type AuditLogger,
  type AuditTransport,
} from "./server/httpPolicy.js";
import { registerWithConduitSurface } from "./server/conduitMetadata.js";
import { registerReaTools } from "./server/registerReaTools.js";
import { registerResourcesPrompts } from "./server/registerResourcesPrompts.js";
import { attachLegacyRoots, resolveRootsEnabled } from "./server/roots.js";
import { registerWithSessionQueue } from "./server/sessionQueue.js";
import { parseToolsets, registerWithToolsetFilter } from "./server/toolsets.js";

export const REA_PLUS_NAME = "rea-plus";
export const REA_PLUS_VERSION = "0.10.2";

export interface CreateReaPlusServerOptions {
  /**
   * Tokensiz HTTP modu: yalniz httpPolicy.ts allowlist'i (toolset ile kesiserek)
   * kaydolur. Varsayilan false = mevcut tam yuzey; startHttp bunu token yoklugunda
   * acikca true gecirir, stdio ve token'li HTTP hicbir zaman acmaz.
   */
  readOnlyOnly?: boolean;
  /** Audit kaydina islenecek transport etiketi (varsayilan "stdio"). */
  transport?: AuditTransport;
  /** Hazir audit logger'i (startHttp/startStdio surec basina bir tane paylasir). */
  auditLogger?: AuditLogger;
  /** REA_AUDIT_LOG yerine acik yol (test/yerlestirme kolayligi). */
  auditLogPath?: string;
  /**
   * Roots pilotu fabrika opt-in'i: yalniz REA_ROOTS=1 ile birlikte etkinlesir
   * (resolveRootsEnabled). startStdio gecirir; HTTP stateless fabrikasi asla
   * gecirmez — surec geneli istemci koku sizintisi olmaz. Varsayilan kapali.
   */
  roots?: boolean;
}

export function createReaPlusMcpServer(options: CreateReaPlusServerOptions = {}): McpServer {
  // REA_TOOLSETS: tanimsiz/bos/all = 171 aracin tamami; bilinmeyen profil burada acik hata verir.
  const toolsets = parseToolsets(process.env.REA_TOOLSETS);
  // Tokensiz HTTP: toolset kumesi allowlist ile kesisir; aksi halde toolset sonucu aynendir.
  const allowedTools = httpReadOnlyAllowed(toolsets.allowedTools, options.readOnlyOnly === true);
  const auditLogger =
    options.auditLogger ??
    createAuditLogger({ path: options.auditLogPath ?? process.env.REA_AUDIT_LOG });
  const transport: AuditTransport = options.transport ?? "stdio";
  // resources: subscribe ilan edilmez (statik salt-okunur icerik); prompts: yan etkisiz metin.
  const server = new McpServer({ name: REA_PLUS_NAME, version: REA_PLUS_VERSION }, { capabilities: { tools: {}, resources: {}, prompts: {} } });
  // Filtre + audit + conduit metadata yalniz bilesim kokundedir: conduit/rea kayit dosyalarina dokunulmaz, SDK this baglami korunur.
  // Oturum kuyrugu en distadir: etkinse (REA_SESSION_QUEUE=1) session_id'li
  // araclari FIFO'ya alir ve status aracini filtrenin disinda her zaman gorunur
  // kilar; devre disiyken kayit ve davranis birebir korunur (171 arac).
  registerWithSessionQueue(server, () => {
  registerWithToolsetFilter(server, allowedTools, () => {
    registerWithAudit(server, auditLogger, transport, () => {
      // Conduit sarmalayici audit'in ICINDE ve yalniz conduit kaydinin cevresindedir:
      // annotations/outputSchema ekler, handler sonucuna structuredContent tasir;
      // audit isError'i sarilmis sonuc uzerinden gorur; rea kaydina hic girmez.
      registerWithConduitSurface(server, () => registerTools(server)); // conduit 30 araç (isimler dondurulmuş)
      registerReaTools(server);
    });
  }); // 141 rea aracı (merkezi gerçek kayıt)
  });
  registerResourcesPrompts(server, { name: REA_PLUS_NAME, version: REA_PLUS_VERSION }); // 2 resource + 3 prompt
  // Roots: cift opt-in yoksa attach hicbir handler'a dokunmaz (varsayilan birebir).
  if (resolveRootsEnabled(options.roots, process.env)) attachLegacyRoots(server, { enabled: true });
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
  // Gecersiz limit env'i sessiz varsayilana dusmez: acik baslangic hatasi (main exit 1 yapar).
  const limits = parseHttpLimits(process.env);
  const rateLimiter = createRateLimiter(limits.rateLimitPerMin, 60_000);
  const concurrencyGate = createConcurrencyGate(limits.maxConcurrent);
  const auditLogger = auditLoggerFromEnv();
  const readOnlyOnly = o.token === undefined;
  if (readOnlyOnly) {
    console.error(
      `[rea-plus] UYARI: DBG_BRIDGE_TOKEN tanımsız; HTTP kimlik doğrulamasız ve SALT-OKUNUR modda çalışıyor: ` +
        `yalnız ${HTTP_READ_ONLY_TOOLS.length} allowlist aracı kayıtlı, yazan/süreç/debug/tarayici/cihaz araçları kayıt dışı. ` +
        `Tam yüzey için DBG_BRIDGE_TOKEN tanımlayın.`,
    );
  }
  const h = createMcpHandler(
    () => createReaPlusMcpServer({ readOnlyOnly, transport: "http", auditLogger }),
    { legacy: "stateless", responseMode: "json" },
  );
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
    // IP basina dakikalik hiz limiti: asimda handler'a hic ulasilmaz.
    const ip = req.socket.remoteAddress ?? "unknown";
    const karar = rateLimiter.check(ip);
    if (!karar.allowed) {
      res.writeHead(429, {
        "content-type": "application/json",
        "retry-after": String(Math.max(1, Math.ceil(karar.retryAfterMs / 1000))),
      });
      res.end(JSON.stringify({ error: "too_many_requests", detail: "rate_limit", retryAfterMs: karar.retryAfterMs }));
      return;
    }
    // Aktif istek tavani: release idempotenttir, finish/close ikisi de guvenle baglanir.
    const release = concurrencyGate.acquire();
    if (release === null) {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "too_many_requests", detail: "concurrency_limit" }));
      return;
    }
    res.once("finish", release);
    res.once("close", release);
    void nh(req, res);
  });
  srv.listen(o.port, o.host, () => console.error(`${REA_PLUS_NAME} streamable-http ${PROTOCOL_VERSION} http://${o.host}:${o.port}/mcp`));
  const stop = () => void h.close().finally(() => srv.close(() => process.exit(0)));
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}

export function startStdio(): void {
  const auditLogger = auditLoggerFromEnv();
  // roots:true yalniz burada: baglanti omru tek istemciye sabitli legacy stdio yolu.
  serveStdio(() => createReaPlusMcpServer({ transport: "stdio", auditLogger, roots: true }), { legacy: "serve" });
}

function main(): void {
  // Hazir fabrikalar tembel cagrildigi icin REA_TOOLSETS acilista dogrulanir; hata sessizce all'a dusmez.
  try { parseToolsets(process.env.REA_TOOLSETS); }
  catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); }
  let o: Opts;
  try { o = parseServeOptions(process.argv.slice(2)); } // --transport/--port/--host + DBG_BRIDGE_* env
  catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); }
  if (o.transport === "http") {
    // Gecersiz REA_HTTP_* limiti de ayni acik baslangic hatasi yolundan durur.
    try { startHttp(o); }
    catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); }
    return;
  }
  startStdio();
}

const _argv1 = process.argv[1]?.replace(/\\/g, "/") ?? "";
const invokedDirectly = (_argv1.endsWith("/src/server.ts") || _argv1.endsWith("/dist/server.js"))
  && !_argv1.includes("conduit-core");
if (invokedDirectly) main();
