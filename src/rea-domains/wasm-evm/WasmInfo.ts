// WasmInfo: saf TS WASM section parser (offline, yürütme yok).
export type WasmSonuc =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string };
// Section id -> ad (çekirdek spec).
const AD: Record<number, string> = { 0: "custom", 1: "type", 2: "import", 3: "function", 4: "table", 5: "memory", 6: "global", 7: "export", 8: "start", 9: "element", 10: "code", 11: "data", 12: "datacount" };
// Kind baytı -> tür adı (import/export ortak).
const TUR: string[] = ["func", "table", "mem", "global"];
// LEB128 u32 okur (boyut/uzunluk alanları için).
function leb(b: Buffer, o: number): { v: number; n: number } | null {
  let r = 0; let s = 0; let p = o;
  for (let i = 0; i < 5; i++) { if (p >= b.length) return null; const c = b[p++] as number; r |= (c & 0x7f) << s; if ((c & 0x80) === 0) return { v: r, n: p }; s += 7; }
  return null;
}
// Uzunluk-önekli UTF-8 dizgi okur.
function dizgi(b: Buffer, o: number): { s: string; n: number } | null {
  const l = leb(b, o); if (!l) return null; if (l.n + l.v > b.length) return null;
  return { s: b.subarray(l.n, l.n + l.v).toString("utf8"), n: l.n + l.v };
}
// Base64 girdiyi çözüp sihir+versiyon doğrular (00 61 73 6d, v1).
function cozumle(b64: string): { buf: Buffer } | null {
  try { const buf = Buffer.from(b64, "base64"); if (buf.length < 8) return null; if (buf[0] !== 0 || buf[1] !== 0x61 || buf[2] !== 0x73 || buf[3] !== 0x6d) return null; if (buf[4] !== 1 || buf[5] !== 0 || buf[6] !== 0 || buf[7] !== 0) return null; return { buf }; } catch { return null; }
}
// Tek geçişte section başlıkları + import/export gövdelerini söker.
function sok(buf: Buffer): { sections: { id: number; ad: string; boyut: number }[]; imports: { modul: string; ad: string; tur: string }[]; exports: { ad: string; tur: string }[] } | null {
  // 8 bayt başlıktan sonra section kayıtları gelir.
  let o = 8; const sections: { id: number; ad: string; boyut: number }[] = []; const imports: { modul: string; ad: string; tur: string }[] = []; const exports: { ad: string; tur: string }[] = [];
  while (o < buf.length) {
    const id = buf[o++] as number; const boy = leb(buf, o); if (!boy) return null; o = boy.n;
    const son = o + boy.v; if (son > buf.length) return null;
    sections.push({ id, ad: AD[id] ?? `bilinmeyen${id}`, boyut: boy.v });
    if (id === 2) { // import: modül+ad+kind oku.
      let p = o; const say = leb(buf, p); if (!say) return null; p = say.n;
      for (let i = 0; i < say.v; i++) { const m = dizgi(buf, p); if (!m) return null; p = m.n; const a = dizgi(buf, p); if (!a) return null; p = a.n; if (p >= son) return null; const k = buf[p++] as number; const t = leb(buf, p); if (!t) return null; p = t.n; imports.push({ modul: m.s, ad: a.s, tur: TUR[k] ?? `kind${k}` }); }
    }
    if (id === 7) { // export: ad+kind oku.
      let p = o; const say = leb(buf, p); if (!say) return null; p = say.n;
      for (let i = 0; i < say.v; i++) { const a = dizgi(buf, p); if (!a) return null; p = a.n; if (p >= son) return null; const k = buf[p++] as number; const t = leb(buf, p); if (!t) return null; p = t.n; exports.push({ ad: a.s, tur: TUR[k] ?? `kind${k}` }); }
    }
    o = son;
  }
  return { sections, imports, exports };
}
// Section listesi + export ad/kind (sihir+versiyon doğrulamalı).
export function rea_wasm_sections(b64dosya: string): WasmSonuc {
  if (!b64dosya) return { ok: false, code: "capability_unsupported", reason: "boş girdi" };
  const c = cozumle(b64dosya); if (!c) return { ok: false, code: "capability_unsupported", reason: "geçersiz wasm (sihir/versiyon)" };
  const s = sok(c.buf); if (!s) return { ok: false, code: "capability_unsupported", reason: "section parse edilemedi" };
  return { ok: true, tool: "rea_wasm_sections", summary: `v1 ${s.sections.length} section, ${s.exports.length} export`, details: { sihir: "0061736d", versiyon: 1, sections: s.sections, exports: s.exports } };
}
// Import listesi: modül+ad (+tür).
export function rea_wasm_imports(b64dosya: string): WasmSonuc {
  if (!b64dosya) return { ok: false, code: "capability_unsupported", reason: "boş girdi" };
  const c = cozumle(b64dosya); if (!c) return { ok: false, code: "capability_unsupported", reason: "geçersiz wasm (sihir/versiyon)" };
  const s = sok(c.buf); if (!s) return { ok: false, code: "capability_unsupported", reason: "section parse edilemedi" };
  if (!s.imports.length) return { ok: false, code: "capability_unsupported", reason: "import yok" };
  return { ok: true, tool: "rea_wasm_imports", summary: `${s.imports.length} import`, details: { imports: s.imports } };
}
