// cli/js: bundle + source-map dosya okuma (offline, gerçek)
// JsAnalyzer köprüsü kullanılır, dosya IO burada yapılır.
import { readFileSync } from "node:fs";
import { rea_js_bundle } from "../rea-domains/javascript/JsAnalyzer.js";

// Dosyayı UTF-8 oku, yoksa anlaşılır hata fırlat.
export function dosyaOku(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`dosya okunamadı: ${path}`);
  }
}

// Bundle + opsiyonel map özeti: köprü sonucunu metne çevirir.
export function jsOzet(bundlePath: string, mapPath?: string): string {
  const bundle = dosyaOku(bundlePath);
  const mapText = mapPath ? dosyaOku(mapPath) : undefined;
  const r = rea_js_bundle(bundle, mapText);
  if (r.ok) return r.summary;
  throw new Error(r.reason);
}

// CLI komutu: analyze-js <bundle.js> [bundle.js.map] [--json]
export function runJsCommand(args: string[], json: boolean): void {
  const bundlePath = args[0] ?? "";
  const mapPath = args[1];
  if (!bundlePath) {
    const msg = "kullanım: analyze-js <bundle.js> [bundle.js.map] [--json]";
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(msg);
    process.exitCode = 1;
    return;
  }
  try {
    const summary = jsOzet(bundlePath, mapPath);
    if (json) {
      console.log(JSON.stringify({ ok: true, bundle: bundlePath, map: mapPath ?? null, summary }));
    } else {
      console.log(`bundle: ${bundlePath}`);
      if (mapPath) console.log(`map: ${mapPath}`);
      console.log(`özet: ${summary}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(`hata: ${msg}`);
    process.exitCode = 1;
  }
}
