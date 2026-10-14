// WinPE saf okuyucu: DataView little-endian (MZ->e_lfanew->PE, COFF, import thunk).
import { existsSync, readFileSync } from "node:fs";
// Facade uyumu: rea_ prefix zorunlu.
export const WINPE_TOOLS = ["rea_pe_info", "rea_pe_imports", "rea_pe_sections"] as const;
type Engel = { ok: false; code: "capability_unsupported"; neden: string };
const engel = (neden: string): Engel => ({ ok: false, code: "capability_unsupported", neden });
// PE başlığı: MZ + e_lfanew + PE sig + COFF + optional magic (DataView LE).
// KRİTİK: bölüm tablosu konumu için sabit 224/240 YOK; gerçek SizeOfOptionalHeader
// (COFF+16) okunur. PdbReader da bu çekirdeği kullanır (tekilleştirme, Dalga B/4).
export type PeBaslik = {
  machine: number; nsec: number; magic: number; is64: boolean; entry: number;
  impRVA: number; impBoy: number; dbgRVA: number; dbgBoy: number; secOff: number;
};
export type PeHam = { b: Buffer; dv: DataView };
// Ham dosya oku: hata dizesi döndürür (çağıran kendi code'uyla sarar).
export function peHamOku(yol: string): PeHam | { hata: string } {
  if (!yol) return { hata: "yol boş" };
  if (!existsSync(yol)) return { hata: `dosya yok: ${yol}` };
  const b = readFileSync(yol);
  if (b.length < 2 || b[0] !== 0x4d || b[1] !== 0x5a) return { hata: "PE değil (MZ imzası yok)" };
  return { b, dv: new DataView(b.buffer, b.byteOffset, b.byteLength) };
}
export function peBaslikOku(b: Buffer, dv: DataView): PeBaslik | null {
  if (b.length < 64 || b[0] !== 0x4d || b[1] !== 0x5a) return null;
  const e = dv.getUint32(0x3c, true);
  if (e + 6 > b.length || dv.getUint32(e, true) !== 0x00004550) return null;
  const coff = e + 4, opt = coff + 20;
  if (opt + 2 > b.length) return null;
  const magic = dv.getUint16(opt, true);
  const is64 = magic === 0x20b;
  if (magic !== 0x10b && !is64) return null;
  if (coff + 18 > b.length) return null;
  const sizeOpt = dv.getUint16(coff + 16, true); // SizeOfOptionalHeader (gerçek)
  if (sizeOpt === 0 || opt + sizeOpt > b.length) return null;
  const nsec = dv.getUint16(coff + 2, true);
  const entry = sizeOpt >= 20 ? dv.getUint32(opt + 16, true) : 0;
  const impO = is64 ? 120 : 104, dbgO = is64 ? 160 : 144;
  const impRVA = sizeOpt >= impO + 8 ? dv.getUint32(opt + impO, true) : 0;
  const impBoy = sizeOpt >= impO + 8 ? dv.getUint32(opt + impO + 4, true) : 0;
  const dbgRVA = sizeOpt >= dbgO + 8 ? dv.getUint32(opt + dbgO, true) : 0;
  const dbgBoy = sizeOpt >= dbgO + 8 ? dv.getUint32(opt + dbgO + 4, true) : 0;
  const secOff = opt + sizeOpt;
  if (secOff + nsec * 40 > b.length) return null;
  return { machine: dv.getUint16(coff, true), nsec, magic, is64, entry, impRVA, impBoy, dbgRVA, dbgBoy, secOff };
}
// RVA->dosya ofseti: ilgili bölümün [vaddr, vaddr+max(vsize,rawsize)) aralığı.
export function peRvaCev(b: Buffer, dv: DataView, h: PeBaslik, rva: number): number {
  for (let i = 0; i < h.nsec; i++) {
    const o = h.secOff + i * 40;
    const va = dv.getUint32(o + 12, true), boy = Math.max(dv.getUint32(o + 8, true), dv.getUint32(o + 16, true));
    if (rva >= va && rva < va + boy) return dv.getUint32(o + 20, true) + (rva - va);
  }
  return -1;
}
// NUL-sonlu ASCII: DLL/fonksiyon adları (bozukta boş döner).
export function peCstr(b: Buffer, off: number): string {
  let s = "";
  for (let i = off; i < b.length && b[i] !== 0; i++) s += String.fromCharCode(b[i]!);
  return s;
}
// GUID: ilk 3 alan LE, son 8 bayt BE (CodeView düzeni).
export function peGuidBicim(dv: DataView, off: number): string {
  const h = (v: number, n: number) => v.toString(16).padStart(n, "0");
  const d1 = h(dv.getUint32(off, true), 8), d2 = h(dv.getUint16(off + 4, true), 4), d3 = h(dv.getUint16(off + 6, true), 4);
  let d4 = "";
  for (let i = 8; i < 16; i++) d4 += h(dv.getUint8(off + i), 2);
  return `${d1}-${d2}-${d3}-${d4.slice(0, 4)}-${d4.slice(4)}`.toUpperCase();
}
// PE oku: yokluk + MZ kapısı (PE değilse unsupported).
function peOku(yol: string): PeHam | Engel {
  const r = peHamOku(yol);
  if ("hata" in r) return engel(r.hata);
  return r;
}
// PE bilgi: machine, bölüm sayısı, 32/64, entry (yürütme yok).
export function rea_pe_info(yol: string) {
  const r = peOku(yol); if (!("b" in r)) return r;
  const h = peBaslikOku(r.b, r.dv);
  if (!h) return engel("PE değil (PE sig/COFF çözülemedi)");
  return { ok: true as const, arac: "rea_pe_info", dosya: yol, machine: h.machine, machine_hex: `0x${h.machine.toString(16)}`, bit: h.is64 ? "64" as const : "32" as const, section_sayisi: h.nsec, entry: h.entry, entry_hex: `0x${h.entry.toString(16)}` };
}
// PE import: RVA->bölümden thunk adları (dll+fonksiyon, ilk 200).
export function rea_pe_imports(yol: string) {
  const r = peOku(yol); if (!("b" in r)) return r;
  const { b, dv } = r, h = peBaslikOku(b, dv);
  if (!h) return engel("PE değil (PE sig/COFF çözülemedi)");
  if (!h.impRVA || !h.impBoy) return { ok: true as const, arac: "rea_pe_imports", dosya: yol, dlls: [] as string[], fonksiyonlar: [] as string[], sayi: 0, not: "import dizini yok" };
  const dlls: string[] = [], fns: string[] = [], adim = h.is64 ? 8 : 4;
  for (let k = 0; k < 64 && fns.length < 200; k++) {
    const ro = peRvaCev(b, dv, h, h.impRVA + k * 20); if (ro < 0 || ro + 20 > b.length) break;
    const ilt = dv.getUint32(ro, true), adRVA = dv.getUint32(ro + 12, true), ft = dv.getUint32(ro + 16, true);
    if (!ilt && !adRVA && !ft) break;
    if (!adRVA) continue;
    const ao = peRvaCev(b, dv, h, adRVA); if (ao < 0) continue;
    const dll = peCstr(b, ao); if (dll) dlls.push(dll);
    const thunk = ilt || ft;
    for (let j = 0; j < 512 && fns.length < 200; j++) {
      const to = peRvaCev(b, dv, h, thunk + j * adim); if (to < 0 || to + adim > b.length) break;
      const v: bigint = adim === 8 ? dv.getBigUint64(to, true) : BigInt(dv.getUint32(to, true));
      if (v === 0n) break;
      if (v >> (adim === 8 ? 63n : 31n)) { fns.push(`${dll}#ordinal_${Number(v & 0xffffn)}`); continue; }
      const ho = peRvaCev(b, dv, h, Number(v & 0xffffffffn)); if (ho < 0) continue;
      const fn = peCstr(b, ho + 2); if (fn) fns.push(`${dll}!${fn}`);
    }
  }
  return { ok: true as const, arac: "rea_pe_imports", dosya: yol, dlls: [...new Set(dlls)], fonksiyonlar: fns.slice(0, 200), sayi: Math.min(fns.length, 200) };
}
// PE bölümleri: ad, vsize, vaddr (salt-okunur tablo).
export function rea_pe_sections(yol: string) {
  const r = peOku(yol); if (!("b" in r)) return r;
  const { b, dv } = r, h = peBaslikOku(b, dv);
  if (!h) return engel("PE değil (PE sig/COFF çözülemedi)");
  const out: { ad: string; vsize: number; vaddr: number }[] = [];
  for (let i = 0; i < h.nsec; i++) {
    const o = h.secOff + i * 40;
    out.push({ ad: String(b.subarray(o, o + 8)).replace(/\0.*$/, ""), vsize: dv.getUint32(o + 8, true), vaddr: dv.getUint32(o + 12, true) });
  }
  return { ok: true as const, arac: "rea_pe_sections", dosya: yol, sayi: out.length, bolumler: out };
}
