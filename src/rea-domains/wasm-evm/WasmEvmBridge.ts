// rea-domains/wasm-evm: WASM + EVM (tamamen offline)
// wabt varsa execFileSync ile gerçek decode, yoksa capability_unsupported.
import { keccak256 } from "js-sha3";
import { execFileSync } from "child_process";
export type ReaWeResult =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string };
function candidates(): string[] {
  const e = process.env.REA_WABT_BIN;
  return e ? [e, "wasm2wat", "wat2wasm"] : ["wasm2wat", "wat2wasm"];
}
// WAT decode: wabt adaylarını dene, ilk 200 satırı döndür.
export function rea_wasm_decode(watOrWasmPath: string): ReaWeResult {
  if (!watOrWasmPath) return { ok: false, code: "capability_unsupported", reason: "wasm yolu boş" };
  for (const bin of candidates()) {
    try {
      const out = execFileSync(bin, [watOrWasmPath], { encoding: "utf8", timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
      const lines = String(out).split("\n").slice(0, 200);
      return { ok: true, tool: "rea_wasm_decode", summary: `${bin}: ${lines.length} satır`, details: { bin, text: lines.join("\n") } };
    } catch { /* sonraki adayı dene */ }
  }
  return { ok: false, code: "capability_unsupported", reason: "wabt yok (REA_WABT_BIN/wasm2wat/wat2wasm)" };
}
// WASM export listesi (metin taraması, offline).
export function rea_wasm_exports(watText: string): ReaWeResult {
  const names = [...watText.matchAll(/\(export\s+"([^"]+)"/g)].map((m) => m[1]);
  if (!names.length) return { ok: false, code: "capability_unsupported", reason: "export bulunamadı" };
  return { ok: true, tool: "rea_wasm_exports", summary: `${names.length} export`, details: { names } };
}
// EVM selector: "transfer(address,uint256)" -> 0xa9059cbb (ilk 4 byte keccak).
export function rea_evm_selector(sig: string): ReaWeResult {
  if (!sig.includes("(") || !sig.includes(")")) {
    return { ok: false, code: "capability_unsupported", reason: "geçersiz imza" };
  }
  const hex = keccak256(signatureToClean(sig));
  const sel = hex.slice(0, 8);
  return { ok: true, tool: "rea_evm_selector", summary: `0x${sel}`, details: { sig, selector: `0x${sel}` } };
}
function signatureToClean(sig: string): string {
  // Boşlukları at, EVM kanonik forma yaklaştır.
  return sig.replace(/\s+/g, "");
}
