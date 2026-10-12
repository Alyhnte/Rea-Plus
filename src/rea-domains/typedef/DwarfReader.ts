// DwarfReader: ELF .debug_info/.debug_abbrev minimal özet (salt-okunur, LE).
import { existsSync, readFileSync } from "node:fs";
export const TYPEDEF_DWARF_TOOLS = ["rea_dwarf_ozet"] as const;
type Engel = { ok: false; code: "bulunamadi"; neden: string };
const engel = (n: string): Engel => ({ ok: false, code: "bulunamadi", neden: n });
// ULEB128 oku (ofseti ilerletir).
function uleb(b: Buffer, o: { p: number }): number {
  let s = 0, k = 0;
  for (; o.p < b.length && k < 5; k++) { const v = b[o.p++]!; s |= (v & 0x7f) << (7 * k); if (!(v & 0x80)) break; }
  return s >>> 0;
}
// ELF bölüm tablosundan .debug_info/.debug_abbrev dilimlerini bul (yalnız LE).
function elfBolum(b: Buffer, dv: DataView): { info: Buffer; abb: Buffer } | null {
  if (b.length < 64 || b[0] !== 0x7f || b[1] !== 0x45 || b[2] !== 0x4c || b[3] !== 0x46 || b[5] !== 1) return null;
  const is64 = b[4] === 2, shoff = is64 ? Number(dv.getBigUint64(0x28, true)) : dv.getUint32(0x20, true);
  const shent = is64 ? dv.getUint16(0x3a, true) : dv.getUint16(0x2e, true), shnum = is64 ? dv.getUint16(0x3c, true) : dv.getUint16(0x30, true), shstr = is64 ? dv.getUint16(0x3e, true) : dv.getUint16(0x32, true);
  if (!shoff || !shent || !shnum || shstr >= shnum || shoff + shnum * shent > b.length) return null;
  const shO = (i: number) => shoff + i * shent;
  const ent = (i: number) => is64 ? { ad: dv.getUint32(shO(i), true), off: Number(dv.getBigUint64(shO(i) + 24, true)), boy: Number(dv.getBigUint64(shO(i) + 32, true)) }
    : { ad: dv.getUint32(shO(i), true), off: dv.getUint32(shO(i) + 16, true), boy: dv.getUint32(shO(i) + 20, true) };
  const st = ent(shstr);
  if (st.off + st.boy > b.length) return null;
  const ad = (i: number) => { let s = ""; for (let p = st.off + ent(i).ad; p < st.off + st.boy && b[p] !== 0; p++) s += String.fromCharCode(b[p]!); return s; };
  let info: Buffer | null = null, abb: Buffer | null = null;
  for (let i = 1; i < shnum; i++) {
    const e = ent(i), n = ad(i);
    if (e.off + e.boy > b.length) continue;
    if (n === ".debug_info") info = b.subarray(e.off, e.off + e.boy); else if (n === ".debug_abbrev") abb = b.subarray(e.off, e.off + e.boy);
  }
  return info && abb ? { info, abb } : null;
}
// Abbrev tablosu: kod->{tag,cocuk,formlar}.
function abbrevOku(abb: Buffer): Map<number, { tag: number; cocuk: number; formlar: number[] }> {
  const m = new Map<number, { tag: number; cocuk: number; formlar: number[] }>(), o = { p: 0 };
  while (o.p < abb.length) {
    const kod = uleb(abb, o);
    if (!kod) break;
    const tag = uleb(abb, o), cocuk = abb[o.p++] ?? 0, formlar: number[] = [];
    for (;;) { const a = uleb(abb, o), f = uleb(abb, o); if (!a && !f) break; formlar.push(f); if (formlar.length > 32) break; }
    m.set(kod, { tag, cocuk, formlar });
  }
  return m;
}
// Formlara göre DIE niteliklerini atla; DW_FORM_string ise adı yakala.
function nitelikAtla(info: Buffer, o: { p: number }, formlar: number[], addrBoy: number): string {
  let ad = "";
  for (const f of formlar) {
    if (o.p >= info.length) break;
    if (f === 0x08) { let e = o.p; while (e < info.length && info[e] !== 0) e++; const s = info.subarray(o.p, e).toString("latin1"); o.p = e + 1; if (!ad && /^[\x20-\x7e]{2,128}$/.test(s)) ad = s; }
    else if (f === 0x0b || f === 0x0c || f === 0x10) o.p += 1; else if (f === 0x05 || f === 0x11) o.p += 2;
    else if (f === 0x06 || f === 0x12 || f === 0x0e || f === 0x17 || f === 0x13) o.p += 4; else if (f === 0x07 || f === 0x14) o.p += 8;
    else if (f === 0x01) o.p += addrBoy; else if (f === 0x0d || f === 0x0f || f === 0x15) uleb(info, o);
    else if (f === 0x0a || f === 0x18) { const n = uleb(info, o); o.p += n; } else if (f === 0x03) { const n = info[o.p]! | (info[o.p + 1]! << 8); o.p += 2 + n; }
    else if (f === 0x04) { const n = dv32(info, o.p); o.p += 4 + n; } else if (f === 0x09) { const n = info[o.p]!; o.p += 1 + n; } else if (f !== 0x19) uleb(info, o);
  }
  return ad;
}
function dv32(info: Buffer, p: number): number { return (info[p]! | (info[p + 1]! << 8) | (info[p + 2]! << 16) | (info[p + 3]! << 24)) >>> 0; }
// CU başlığı + abbrev güdümlü DIE yürüyüşü; subprogram say + adları topla (ilk 50).
export function rea_dwarf_ozet(elfYolu: string) {
  if (!elfYolu) return engel("yol boş");
  if (!existsSync(elfYolu)) return engel(`dosya yok: ${elfYolu}`);
  const b = readFileSync(elfYolu);
  if (b.length < 4 || b[0] !== 0x7f || b[1] !== 0x45 || b[2] !== 0x4c || b[3] !== 0x46) return engel("ELF değil (ELF sihiri yok)");
  const dil = elfBolum(b, new DataView(b.buffer, b.byteOffset, b.byteLength));
  if (!dil) return engel("DWARF bölümü yok (.debug_info/.debug_abbrev bulunamadı)");
  const tab = abbrevOku(dil.abb), o = { p: 0 }, adlar: string[] = [];
  let unitSayisi = 0, subprogramSayisi = 0;
  while (o.p + 4 <= dil.info.length) {
    const len = dv32(dil.info, o.p); o.p += 4;
    if (!len || o.p + len > dil.info.length || o.p + 7 > dil.info.length) break;
    const son = o.p + len; o.p += 2; o.p += 4; const addrBoy = dil.info[o.p++] ?? 4; // sürüm+abbOff+addr
    unitSayisi++;
    const yigin: number[] = [];
    while (o.p < son) {
      const kod = uleb(dil.info, o);
      if (!kod) { if (!yigin.length) break; yigin.pop(); continue; }
      const ab = tab.get(kod); if (!ab) break;
      const ad = nitelikAtla(dil.info, o, ab.formlar, addrBoy);
      if (ab.tag === 0x2e) { subprogramSayisi++; if (ad && adlar.length < 50) adlar.push(ad); }
      if (ab.cocuk) yigin.push(1);
    }
    o.p = son;
  }
  if (!unitSayisi) return engel("DWARF CU kaydı yok (.debug_info boş/bozuk)");
  return { ok: true as const, arac: "rea_dwarf_ozet", dosya: elfYolu, unitSayisi, subprogramSayisi, fonksiyonAdlari: adlar };
}
