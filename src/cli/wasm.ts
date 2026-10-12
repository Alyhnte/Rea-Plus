// cli/wasm: WASM export listesi + wabt decode kapısı (offline)
// Dosya okunur, WAT metni regex ile taranır, .wasm decode denenir.
import { readFileSync } from "node:fs";
import { rea_wasm_decode, rea_wasm_exports } from "../rea-domains/wasm-evm/WasmEvmBridge.js";

// WAT metninden export adlarını çıkar (köprü fonksiyonunu kullanır).
export function exportlariListele(watText: string): string[] {
  const r = rea_wasm_exports(watText);
  if (!r.ok) return [];
  const d = r.details as { names?: string[] };
  return d.names ?? [];
}

// Tek dosya analiz: .wasm ise decode kapısı, her zaman export listesi.
export function wasmOzet(path: string): { decode: string; exports: string[] } {
  const decode = rea_wasm_decode(path);
  const decodeOzet = decode.ok ? decode.summary : `decode yok: ${decode.reason}`;
  let exports: string[] = [];
  try {
    const text = readFileSync(path, "utf8");
    exports = exportlariListele(text);
  } catch {
    exports = [];
  }
  return { decode: decodeOzet, exports };
}

// CLI komutu: analyze-wasm <dosya.wasm|dosya.wat> [--json]
export function runWasmCommand(args: string[], json: boolean): void {
  const path = args[0] ?? "";
  if (!path) {
    const msg = "kullanım: analyze-wasm <dosya.wasm|dosya.wat> [--json]";
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(msg);
    process.exitCode = 1;
    return;
  }
  try {
    const { decode, exports } = wasmOzet(path);
    if (json) {
      console.log(JSON.stringify({ ok: true, path, decode, count: exports.length, exports }));
    } else {
      console.log(`dosya: ${path}`);
      console.log(`decode: ${decode}`);
      console.log(`exports (${exports.length}): ${exports.join(", ") || "-"}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(`hata: ${msg}`);
    process.exitCode = 1;
  }
}
