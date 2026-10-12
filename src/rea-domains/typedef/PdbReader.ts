// PdbReader: PE debug dizininden CodeView RSDS ile PDB yolu çıkarır (salt-okunur, LE).
import { existsSync, readFileSync } from "node:fs";
// Facade uyumu: rea_ prefix zorunlu.
export const TYPEDEF_PDB_TOOLS = ["rea_pdb_yolu"] as const;
type Engel = { ok: false; code: "bulunamadi"; neden: string };
const engel = (neden: string): Engel => ({ ok: false, code: "bulunamadi", neden });
// MZ->e_lfanew->PE sig->COFF->optional magic; debug RVA/boy + bölüm tablosu konumu.
function baslik(b: Buffer, dv: DataView) {
  if (b.length < 64 || b[0] !== 0x4d || b[1] !== 0x5a) return null;
  const e = dv.getUint32(0x3c, true);
  if (e + 6 > b.length || dv.getUint32(e, true) !== 0x00004550) return null;
  const coff = e + 4, opt = coff + 20;
  if (opt + 2 > b.length) return null;
  const magic = dv.getUint16(opt, true), is64 = magic === 0x20b;
  if (magic !== 0x10b && !is64) return null;
  const nsec = dv.getUint16(coff + 2, true);
  const dbgRVA = dv.getUint32(opt + (is64 ? 160 : 144), true);
  const dbgBoy = dv.getUint32(opt + (is64 ? 164 : 148), true);
  const secOff = opt + (is64 ? 240 : 224);
  if (secOff + nsec * 40 > b.length) return null;
  return { nsec, secOff, dbgRVA, dbgBoy };
}
// RVA->dosya ofseti: bölüm aralığından çevir (bulunamazsa -1).
function rvaCev(b: Buffer, dv: DataView, h: NonNullable<ReturnType<typeof baslik>>, rva: number): number {
  for (let i = 0; i < h.nsec; i++) {
    const o = h.secOff + i * 40;
    const va = dv.getUint32(o + 12, true), boy = Math.max(dv.getUint32(o + 8, true), dv.getUint32(o + 16, true));
    if (rva >= va && rva < va + boy) return dv.getUint32(o + 20, true) + (rva - va);
  }
  return -1;
}
// NUL-sonlu ASCII zincir (bozuk ofsette boş döner).
function cstr(b: Buffer, off: number): string {
  let s = "";
  for (let i = off; i < b.length && b[i] !== 0; i++) s += String.fromCharCode(b[i]!);
  return s;
}
// GUID: ilk 3 alan LE, son 8 bayt BE (CodeView düzeni).
function guidBicim(dv: DataView, off: number): string {
  const h = (v: number, n: number) => v.toString(16).padStart(n, "0");
  const d1 = h(dv.getUint32(off, true), 8), d2 = h(dv.getUint16(off + 4, true), 4), d3 = h(dv.getUint16(off + 6, true), 4);
  let d4 = "";
  for (let i = 8; i < 16; i++) d4 += h(dv.getUint8(off + i), 2);
  return `${d1}-${d2}-${d3}-${d4.slice(0, 4)}-${d4.slice(4)}`.toUpperCase();
}
// PE debug dizininde Type==2 (CodeView) girdiyi bul, RSDS->guid+yas+pdb adı çöz.
export function rea_pdb_yolu(peYolu: string) {
  if (!peYolu) return engel("yol boş");
  if (!existsSync(peYolu)) return engel(`dosya yok: ${peYolu}`);
  const b = readFileSync(peYolu);
  if (b.length < 2 || b[0] !== 0x4d || b[1] !== 0x5a) return engel("PE değil (MZ imzası yok)");
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const h = baslik(b, dv);
  if (!h) return engel("PE değil (PE sig/COFF çözülemedi)");
  if (!h.dbgRVA || !h.dbgBoy) return engel("PDB debug kaydı yok (debug dizini boş)");
  const adet = Math.floor(h.dbgBoy / 28);
  for (let k = 0; k < adet; k++) {
    const ro = rvaCev(b, dv, h, h.dbgRVA + k * 28);
    if (ro < 0 || ro + 28 > b.length) continue;
    if (dv.getUint32(ro + 12, true) !== 2) continue; // yalnız CodeView
    const ham = dv.getUint32(ro + 24, true), rva = dv.getUint32(ro + 20, true);
    let p = ham > 0 && ham + 24 < b.length ? ham : rvaCev(b, dv, h, rva);
    if (p < 0 || p + 24 > b.length) continue;
    if (b[p] !== 0x52 || b[p + 1] !== 0x53 || b[p + 2] !== 0x44 || b[p + 3] !== 0x53) continue; // RSDS
    const guid = guidBicim(dv, p + 4), yas = dv.getUint32(p + 20, true);
    const pdb = cstr(b, p + 24);
    if (!pdb) continue;
    return { ok: true as const, arac: "rea_pdb_yolu", dosya: peYolu, pdb, guid, yas };
  }
  return engel("PDB debug kaydı yok (CodeView RSDS bulunamadı)");
}
