// rea-domains/behavior: mitmdump ile yerel HAR yakalama (dış ağ yok, gerçek kayıt)
// NOT: -n bayrağı bilerek YOK (--no-server: proxy'yi kapatır, dinleme açmaz).
// NOT: hardump yalnız zarif çıkışta yazar; Windows'ta bu yok → -s eklenti her yanıtta yazar.
import { spawn, spawnSync } from "node:child_process";
import { createServer, request } from "node:http";
import { connect } from "node:net";
import { readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveWorkspaceOutputPath, WorkspaceRootError } from "../../server/workspaceRoot.js";
// Katalog/facade ile uyumlu araç adı (rea_ prefix zorunlu).
export const NET_TOOLS = ["rea_net_capture"] as const;
// Sonuç: ok ise HAR kanıtı, değilse capability_unsupported kapısı.
export type ReaNetSonuç =
  | { ok: true; tool: string; summary: string; kayıt: { url: string; har: string; bayt: number } }
  | { ok: false; code: "capability_unsupported"; reason: string };
// mitmdump PATH'te mi? Yoksa yakalama yapılamaz (stub yok, kapı dön).
// Not: spawnSync bulunamayan komutta throw etmez; r.error/status bakılır.
function mitmTamam(): boolean {
  try { const r = spawnSync("mitmdump", ["--version"], { stdio: "ignore" }); return !r.error && r.status === 0; }
  catch { return false; }
}
// Kısa uyku (ms): proxy açılışı ve dosya yazımı payı.
const uyu = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
// Yerel hedef mi? data: ya da localhost/127.0.0.1 (dış ağa çıkma).
const yerelMi = (u: string): boolean => u.startsWith("data:") || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u);
// Port dinlemede mi? Proxy açılışını kör beklemek yerine yoklar.
function portAçık(port: number): Promise<boolean> {
  return new Promise((ok) => { const s = connect(port, "127.0.0.1"); s.on("connect", () => { s.end(); ok(true); }); s.on("error", () => ok(false)); });
}
// Proxy üzerinden tek GET: mutlak URI path ile mitmdump akışı oluşturur.
function proxyGet(pport: number, hedef: string, ms: number): Promise<number> {
  return new Promise((ok, yok) => {
    const q = request({ host: "127.0.0.1", port: pport, path: hedef, method: "GET", timeout: ms }, (res) => { res.resume(); res.on("end", () => ok(res.statusCode ?? 0)); });
    q.on("timeout", () => { q.destroy(new Error("zaman aşımı")); });
    q.on("error", yok); q.end();
  });
}
// Eklenti: her yanıtta HAR'ı hemen yazar (kapanış beklenmez). Repo dışına, geçici dizine yazılır.
const EKLENTİ = `import os\nfrom mitmproxy.addons.savehar import SaveHar\n_k=SaveHar()\n_a=[]\ndef response(flow):\n    y=os.environ.get("REA_HAR_YOL","")\n    if not y or getattr(flow,"websocket",None) is not None:\n        return\n    _a.append(flow)\n    _k.export_har(_a,y)\n`;
// Yakalama: verilen localhost URL mitmdump üstünden gerçekten çağrılır;
// yem sunucu yalnız data: girdisinde (çağrılabilir URL yokken) kurulur ve özette belirtilir.
export async function rea_net_capture(url: string, sure_sn = 15, ciktiHar = "net.har"): Promise<ReaNetSonuç> {
  if (!url || typeof url !== "string" || !yerelMi(url)) return { ok: false, code: "capability_unsupported", reason: `desteklenmeyen hedef (yalnız data:/localhost): ${url}` };
  // HAR ciktisi: REA_WORKSPACE_ROOT tanimliysa kok icinde uretilir/dondurulur; tanimsizsa
  // eski davranis (cwd'ye goreli "net.har") aynen korunur. Gecici eklenti dosyasi tmp'de kalir.
  let harYol: string;
  try { harYol = resolveWorkspaceOutputPath(ciktiHar); }
  catch (e) { if (e instanceof WorkspaceRootError) return { ok: false, code: "capability_unsupported", reason: e.message }; throw e; }
  if (!mitmTamam()) return { ok: false, code: "capability_unsupported", reason: "mitmdump PATH'te yok (mitmproxy 12.x gerekli)" };
  const yemGerek = url.startsWith("data:");
  const srv = yemGerek ? createServer((_req, res) => { res.writeHead(200, { "content-type": "text/plain" }); res.end("rea-ok"); }) : null;
  if (srv) await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", () => ok()));
  const adres = srv?.address();
  const hedef = yemGerek ? `http://127.0.0.1:${typeof adres === "object" && adres ? adres.port : 80}/` : url;
  const eklenti = join(tmpdir(), `rea-har-${process.pid}.py`);
  writeFileSync(eklenti, EKLENTİ, "utf8");
  const pport = 18080 + Math.floor(Math.random() * 200); // Port çakışmasına karşı rastgele proxy portu.
  const izle = spawn("mitmdump", ["-p", String(pport), "-q", "-s", eklenti], { stdio: "ignore", env: { ...process.env, REA_HAR_YOL: harYol } });
  let açık = false;
  for (let i = 0; i < 15 && !açık; i++) { açık = await portAçık(pport); if (!açık) await uyu(800); } // ~12sn tavan.
  const bütçe = Math.min(Math.max(sure_sn, 3), 15) * 1000;
  let kod = 0, hata = açık ? "" : "proxy açılmadı";
  for (let i = 0; i < 3 && açık && !kod; i++) { try { kod = await proxyGet(pport, hedef, bütçe); } catch (e) { hata = (e as Error).message; } }
  await uyu(1500); izle.kill(); srv?.close(); // HAR zaten yazıldı; süreçleri kapat.
  try { rmSync(eklenti, { force: true }); } catch { /* geçici eklenti temizliği */ }
  if (!kod) return { ok: false, code: "capability_unsupported", reason: `proxy isteği başarısız: ${hata}` };
  try {
    const ham = readFileSync(harYol, "utf8"); // HAR üretildi mi?
    const bayt = statSync(harYol).size;
    if (bayt === 0 || !ham.includes("\"log\"")) return { ok: false, code: "capability_unsupported", reason: "HAR üretilemedi (eklenti yazmadı)" };
    return { ok: true, tool: "rea_net_capture", summary: `${hedef} -> ${harYol} (${bayt} bayt, HTTP ${kod})${yemGerek ? " [data: girdisi; trafik yerel yeme]" : ""}`, kayıt: { url: hedef, har: harYol, bayt } };
  } catch { return { ok: false, code: "capability_unsupported", reason: "HAR dosyası okunamadı" }; }
}
