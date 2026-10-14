// WasmInfo: saf TS WASM section parser (offline, yürütme yok).
export type WasmSonuc =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string }
  | { ok: false; code: "invalid_wasm"; reason: string };
// Section id -> ad (çekirdek spec).
const AD: Record<number, string> = { 0: "custom", 1: "type", 2: "import", 3: "function", 4: "table", 5: "memory", 6: "global", 7: "export", 8: "start", 9: "element", 10: "code", 11: "data", 12: "datacount" };
// Kind baytı -> tür adı (import/export ortak).
const TUR: string[] = ["func", "table", "mem", "global"];
// LEB128 u32 okur (boyut/uzunluk alanları için). Çok-bayt değerler toplama ile
// birikir (işaretli kaydırma YOK); u32 taşması/kesiklikte null döner.
// Negatif değer ASLA üretilmez.
function leb(b: Buffer, o: number): { v: number; n: number } | null {
  let r = 0; let p = o;
  for (let i = 0; i < 5; i++) {
    if (p >= b.length) return null;
    const c = b[p++] as number;
    const alt = c & 0x7f;
    if (i === 4 && alt > 0x0f) return null; // u32'ye sığmaz (taşma)
    r += alt * 2 ** (7 * i);
    if (r > 0xffffffff) return null;
    if ((c & 0x80) === 0) return { v: r, n: p };
  }
  return null; // 5 baytta bitmedi (taşma)
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
type SokVeri = { sections: { id: number; ad: string; boyut: number }[]; imports: { modul: string; ad: string; tur: string }[]; exports: { ad: string; tur: string }[] };
// limits bayrak+min[+max] okur (table/mem importları için).
function limitOku(buf: Buffer, p: number, son: number): { n: number } | null {
  const bayrak = leb(buf, p); if (!bayrak || bayrak.n > son) return null; p = bayrak.n;
  const enAz = leb(buf, p); if (!enAz || enAz.n > son) return null; p = enAz.n;
  if (bayrak.v & 1) { const enCok = leb(buf, p); if (!enCok || enCok.n > son) return null; p = enCok.n; }
  return { n: p };
}
// Tek geçişte section başlıkları + import/export gövdelerini söker.
// Bozuk girişte { hata } döner (çağıran açık invalid_wasm üretir).
function sok(buf: Buffer): SokVeri | { hata: string } {
  // 8 bayt başlıktan sonra section kayıtları gelir.
  let o = 8; const sections: SokVeri["sections"] = []; const imports: SokVeri["imports"] = []; const exports: SokVeri["exports"] = [];
  while (o < buf.length) {
    const id = buf[o++] as number; const boy = leb(buf, o); if (!boy) return { hata: "section boyutu LEB taşması/kesik" }; o = boy.n;
    if (boy.v < 0) return { hata: "section boyutu negatif (LEB taşması)" };
    const son = o + boy.v; if (son < o || son > buf.length) return { hata: "section boyutu taşması" };
    sections.push({ id, ad: AD[id] ?? `bilinmeyen${id}`, boyut: boy.v });
    if (id === 2) { // import: her kind kendi gövde düzenini okur.
      let p = o; const say = leb(buf, p); if (!say || say.n > son) return { hata: "import sayacı LEB taşması/kesik" }; p = say.n;
      for (let i = 0; i < say.v; i++) {
        if (p >= son) return { hata: "import gövdesi section dışında" };
        const m = dizgi(buf, p); if (!m || m.n > son) return { hata: "import modül adı kesik" }; p = m.n;
        const a = dizgi(buf, p); if (!a || a.n > son) return { hata: "import adı kesik" }; p = a.n;
        if (p >= son) return { hata: "import kind baytı yok" };
        const k = buf[p++] as number;
        if (k === 0) { // func: tip numarası (tek ULEB).
          const t = leb(buf, p); if (!t || t.n > son) return { hata: "func import tipi LEB taşması/kesik" }; p = t.n;
        } else if (k === 1) { // table: elem türü + limits.
          if (p >= son) return { hata: "table import elem türü yok" }; p += 1;
          const lim = limitOku(buf, p, son); if (!lim) return { hata: "table import limits LEB taşması/kesik" }; p = lim.n;
        } else if (k === 2) { // mem: limits.
          const lim = limitOku(buf, p, son); if (!lim) return { hata: "mem import limits LEB taşması/kesik" }; p = lim.n;
        } else if (k === 3) { // global: değer türü + değişirlik (2 bayt).
          if (p + 2 > son) return { hata: "global import türü kesik" }; p += 2;
        } else return { hata: `bilinmeyen import kind: ${k}` };
        if (p > son) return { hata: "import gövdesi taştı" };
        imports.push({ modul: m.s, ad: a.s, tur: TUR[k] ?? `kind${k}` });
      }
    }
    if (id === 7) { // export: ad+kind+index oku.
      let p = o; const say = leb(buf, p); if (!say || say.n > son) return { hata: "export sayacı LEB taşması/kesik" }; p = say.n;
      for (let i = 0; i < say.v; i++) {
        if (p >= son) return { hata: "export gövdesi section dışında" };
        const a = dizgi(buf, p); if (!a || a.n > son) return { hata: "export adı kesik" }; p = a.n;
        if (p >= son) return { hata: "export kind baytı yok" };
        const k = buf[p++] as number;
        const t = leb(buf, p); if (!t || t.n > son) return { hata: "export index LEB taşması/kesik" }; p = t.n;
        if (p > son) return { hata: "export gövdesi taştı" };
        exports.push({ ad: a.s, tur: TUR[k] ?? `kind${k}` });
      }
    }
    o = son;
  }
  return { sections, imports, exports };
}
// Section listesi + export ad/kind (sihir+versiyon doğrulamalı).
export function rea_wasm_sections(b64dosya: string): WasmSonuc {
  if (!b64dosya) return { ok: false, code: "capability_unsupported", reason: "boş girdi" };
  const c = cozumle(b64dosya); if (!c) return { ok: false, code: "capability_unsupported", reason: "geçersiz wasm (sihir/versiyon)" };
  const s = sok(c.buf); if ("hata" in s) return { ok: false, code: "invalid_wasm", reason: s.hata };
  return { ok: true, tool: "rea_wasm_sections", summary: `v1 ${s.sections.length} section, ${s.exports.length} export`, details: { sihir: "0061736d", versiyon: 1, sections: s.sections, exports: s.exports } };
}
// Import listesi: modül+ad (+tür).
export function rea_wasm_imports(b64dosya: string): WasmSonuc {
  if (!b64dosya) return { ok: false, code: "capability_unsupported", reason: "boş girdi" };
  const c = cozumle(b64dosya); if (!c) return { ok: false, code: "capability_unsupported", reason: "geçersiz wasm (sihir/versiyon)" };
  const s = sok(c.buf); if ("hata" in s) return { ok: false, code: "invalid_wasm", reason: s.hata };
  if (!s.imports.length) return { ok: false, code: "capability_unsupported", reason: "import yok" };
  return { ok: true, tool: "rea_wasm_imports", summary: `${s.imports.length} import`, details: { imports: s.imports } };
}
