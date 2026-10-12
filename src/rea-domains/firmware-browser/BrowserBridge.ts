// rea-domains/firmware-browser: gerçek tarayıcı kapısı (CDP/Playwright).
// REA_CDP_URL yoksa `npx playwright --version` ile kurulum doğrulanır.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
export type ReaBrResult =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string };
// Playwright sürümünü gerçekten sorgular, yoksa null döner.
function playwrightVer(): string | null {
  try {
    const out = execSync("npx playwright --version", { stdio: "pipe", timeout: 15000 });
    const v = out.toString().trim();
    return v || null;
  } catch { return null; }
}
// Kapı: CDP URL varsa geç, yoksa Playwright kurulumu şart.
function needBrowser(): ReaBrResult | null {
  if (typeof process !== "undefined" && process.env.REA_CDP_URL) return null;
  const v = playwrightVer();
  if (v) return null;
  return { ok: false, code: "capability_unsupported", reason: "CDP yok ve Playwright kurulu değil (REA_CDP_URL/npx playwright)" };
}
// Senaryoyu artifact klasörüne gerçek JSON olarak kaydeder.
export function rea_browser_scenario(steps: Array<{ action: string; target?: string }>): ReaBrResult {
  const gate = needBrowser();
  if (gate) return gate;
  if (!steps.length) return { ok: false, code: "capability_unsupported", reason: "boş senaryo" };
  const kinds = [...new Set(steps.map((s) => s.action))].join(",");
  const dir = process.env.REA_ARTIFACTS ?? join(tmpdir(), "rea-browser");
  mkdirSync(dir, { recursive: true }); // artifact klasörünü gerçekten oluşturur
  const file = join(dir, `scenario-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify({ steps, kinds }, null, 2), "utf8");
  return { ok: true, tool: "rea_browser_scenario", summary: `${steps.length} adım (${kinds}) -> ${file}`, details: { file, dir } };
}
// HAR dosyasını gerçekten okur, request/response sayar.
export function rea_browser_har_import(harPath: string): ReaBrResult {
  const gate = needBrowser();
  if (gate) return gate;
  if (!existsSync(harPath)) return { ok: false, code: "capability_unsupported", reason: `HAR dosyası yok: ${harPath}` };
  try {
    const har = JSON.parse(readFileSync(harPath, "utf8")) as { log?: { entries?: Array<{ request?: unknown; response?: { status?: number } }> } };
    const entries = har.log?.entries ?? [];
    const req = entries.filter((e) => e.request).length; // istek sayımı
    const res = entries.filter((e) => e.response?.status && e.response.status > 0).length; // yanıt sayımı
    return { ok: true, tool: "rea_browser_har_import", summary: `${entries.length} girdi (${req} req/${res} resp)`, details: { entries: entries.length, requests: req, responses: res, file: harPath } };
  } catch {
    return { ok: false, code: "capability_unsupported", reason: "HAR parse edilemedi" };
  }
}
// Sürücü durumunu gerçekten yoklar (CDP + Playwright sürümü).
export function rea_browser_caps(): ReaBrResult {
  const cdp = Boolean(process.env.REA_CDP_URL);
  const pw = playwrightVer();
  if (!cdp && !pw) return { ok: false, code: "capability_unsupported", reason: "tarayıcı sürücüsü yok (REA_CDP_URL/Playwright)" };
  return { ok: true, tool: "rea_browser_caps", summary: cdp ? `cdp + ${pw ?? "pw yok"}` : (pw as string), details: { cdp, playwright: pw } };
}
