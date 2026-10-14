// DwarfReader: ELF .debug_info/.debug_abbrev/.debug_str minimal özet (salt-okunur, LE).
// Destek: DWARF v2/v3/v4/v5 (32-bit). v5 başlığı (unit_type) + CU'ya özel
// abbrev_offset + ad için çoklu FORM (string/strp/line_strp) çözülür.
// Desteklenmeyen sürümde dürüst "desteklenmiyor" döner (sahte boş özet YOK).
import { existsSync, readFileSync } from "node:fs";
export const TYPEDEF_DWARF_TOOLS = ["rea_dwarf_ozet"] as const;
type Engel = { ok: false; code: "bulunamadi" | "desteklenmiyor"; neden: string };
const engel = (n: string): Engel => ({ ok: false, code: "bulunamadi", neden: n });
const destekDisi = (n: string): Engel => ({ ok: false, code: "desteklenmiyor", neden: n });
// ULEB128 oku (ofseti ilerletir). 10 bayta kadar; taşmada null.
function uleb(b: Buffer, o: { p: number }): number | null {
  let r = 0;
  for (let i = 0; i < 10; i++) {
    if (o.p >= b.length) return null;
    const v = b[o.p++]!;
    r += (v & 0x7f) * 2 ** (7 * i);
    if (r > Number.MAX_SAFE_INTEGER) return null;
    if (!(v & 0x80)) return r;
  }
  return null;
}
// SLEB128 oku (ofseti ilerletir).
function sleb(b: Buffer, o: { p: number }): number | null {
  let r = 0, s = 0, v = 0;
  for (let i = 0; i < 10; i++) {
    if (o.p >= b.length) return null;
    v = b[o.p++]!; r += (v & 0x7f) * 2 ** s; s += 7;
    if (!(v & 0x80)) break;
    if (i === 9) return null;
  }
  if (v & 0x40) r -= 2 ** s;
  return r;
}
// ELF bölüm tablosundan DWARF dilimlerini bul (yalnız LE).
function elfBolum(b: Buffer, dv: DataView): { info: Buffer; abb: Buffer; str: Buffer | null; lineStr: Buffer | null } | null {
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
  let info: Buffer | null = null, abb: Buffer | null = null, str: Buffer | null = null, lineStr: Buffer | null = null;
  for (let i = 1; i < shnum; i++) {
    const e = ent(i), n = ad(i);
    if (e.off + e.boy > b.length) continue;
    if (n === ".debug_info") info = b.subarray(e.off, e.off + e.boy);
    else if (n === ".debug_abbrev") abb = b.subarray(e.off, e.off + e.boy);
    else if (n === ".debug_str") str = b.subarray(e.off, e.off + e.boy);
    else if (n === ".debug_line_str") lineStr = b.subarray(e.off, e.off + e.boy);
  }
  return info && abb ? { info, abb, str, lineStr } : null;
}
type Nitelik = { attr: number; form: number; deger: number | null };
// Abbrev tablosu: verilen ofsetten itibaren kod->{tag,cocuk,nitelikler}.
// DW_FORM_implicit_const değerini abbrev içinden okur.
function abbrevOku(abb: Buffer, basla: number): Map<number, { tag: number; cocuk: number; nitelikler: Nitelik[] }> {
  const m = new Map<number, { tag: number; cocuk: number; nitelikler: Nitelik[] }>(), o = { p: basla };
  while (o.p < abb.length) {
    const kod = uleb(abb, o);
    if (kod === null || !kod) break;
    const tag = uleb(abb, o); if (tag === null) break;
    if (o.p >= abb.length) break;
    const cocuk = abb[o.p++] ?? 0, nitelikler: Nitelik[] = [];
    for (;;) {
      const a = uleb(abb, o), f = uleb(abb, o);
      if (a === null || f === null) break;
      if (!a && !f) break;
      let deger: number | null = null;
      if (f === 0x21) { deger = sleb(abb, o); if (deger === null) break; }
      nitelikler.push({ attr: a, form: f, deger });
      if (nitelikler.length > 64) break;
    }
    m.set(kod, { tag, cocuk, nitelikler });
  }
  return m;
}
// NUL-sonlu dizgiyi okur + yazı makuliyeti süzgeci.
function cstr(b: Buffer, p: number): string {
  let e = p;
  while (e < b.length && b[e] !== 0) e++;
  const s = b.subarray(p, e).toString("latin1");
  return /^[\x20-\x7e]{2,128}$/.test(s) ? s : "";
}
// DWARF32 ofsetinden dize çözer (strp/line_strp).
function strCoz(tablo: Buffer | null, info: Buffer, o: { p: number }): string {
  if (o.p + 4 > info.length) return "";
  const off = dv32(info, o.p); o.p += 4;
  if (!tablo || off >= tablo.length) return "";
  return cstr(tablo, off);
}
// Formlara göre DIE niteliklerini atla; DW_AT_name/linkage_name ise adı yakala.
// Bilinmeyen formda { tamam:false } döner (güvenli atlama mümkün değil).
function nitelikAtla(info: Buffer, o: { p: number }, nitelikler: Nitelik[], addrBoy: number, str: Buffer | null, lineStr: Buffer | null): { ad: string; tamam: boolean } {
  let ad = "";
  for (const n of nitelikler) {
    if (o.p > info.length) return { ad, tamam: false };
    const f = n.form;
    const adAdayi = (s: string) => { if (!ad && (n.attr === 0x03 || n.attr === 0x6e) && s) ad = s; };
    if (f === 0x08) { let e = o.p; while (e < info.length && info[e] !== 0) e++; adAdayi(cstr(info, o.p)); o.p = e + 1; }
    else if (f === 0x0e) adAdayi(strCoz(str, info, o));
    else if (f === 0x1f) adAdayi(strCoz(lineStr, info, o));
    else if (f === 0x0b || f === 0x0c || f === 0x11 || f === 0x25) o.p += 1;
    else if (f === 0x05 || f === 0x12 || f === 0x26) o.p += 2;
    else if (f === 0x27) o.p += 3;
    else if (f === 0x06 || f === 0x13 || f === 0x17 || f === 0x10 || f === 0x1c || f === 0x1d || f === 0x28) o.p += 4;
    else if (f === 0x07 || f === 0x14 || f === 0x20 || f === 0x24) o.p += 8;
    else if (f === 0x1e) o.p += 16;
    else if (f === 0x01) o.p += addrBoy;
    else if (f === 0x0d) sleb(info, o);
    else if (f === 0x0f || f === 0x15 || f === 0x1a || f === 0x1b || f === 0x22 || f === 0x23) uleb(info, o);
    else if (f === 0x0a) { if (o.p >= info.length) return { ad, tamam: false }; const n2 = info[o.p++]!; o.p += n2; }
    else if (f === 0x18) { const n2 = uleb(info, o); if (n2 === null) return { ad, tamam: false }; o.p += n2; }
    else if (f === 0x03) { if (o.p + 2 > info.length) return { ad, tamam: false }; const n2 = info[o.p]! | (info[o.p + 1]! << 8); o.p += 2 + n2; }
    else if (f === 0x04) { if (o.p + 4 > info.length) return { ad, tamam: false }; const n2 = dv32(info, o.p); o.p += 4 + n2; }
    else if (f === 0x09) { if (o.p >= info.length) return { ad, tamam: false }; const n2 = info[o.p]!; o.p += 1 + n2; }
    else if (f === 0x19 || f === 0x21) { /* 0 bayt (implicit_const değeri abbrev'de) */ }
    else if (f === 0x16) {
      const ic = uleb(info, o); if (ic === null) return { ad, tamam: false };
      const tek = nitelikAtla(info, o, [{ attr: n.attr, form: ic, deger: null }], addrBoy, str, lineStr);
      if (!tek.tamam) return { ad, tamam: false };
      if (!ad && tek.ad) ad = tek.ad;
    }
    else return { ad, tamam: false };
    if (o.p > info.length) return { ad, tamam: false };
  }
  return { ad, tamam: true };
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
  const o = { p: 0 }, adlar: string[] = [];
  let unitSayisi = 0, subprogramSayisi = 0;
  while (o.p + 4 <= dil.info.length) {
    const len = dv32(dil.info, o.p); o.p += 4;
    if (len === 0xffffffff) return destekDisi("DWARF64 desteklenmiyor (yalnız 32-bit; desteklenen: v2/v3/v4/v5) — kısmi özet yok");
    if (!len || o.p + len > dil.info.length) break;
    const son = o.p + len;
    if (o.p + 2 > son) break;
    const surum = dil.info[o.p]! | (dil.info[o.p + 1]! << 8); o.p += 2;
    if (surum !== 2 && surum !== 3 && surum !== 4 && surum !== 5)
      return destekDisi(`DWARF v${surum} desteklenmiyor (desteklenen: v2/v3/v4/v5) — kısmi özet yok`);
    let addrBoy: number, abbOff: number;
    if (surum === 5) {
      if (o.p + 2 > son) break;
      o.p += 1; // unit_type (derleme/tip; yürüyüş aynı)
      addrBoy = dil.info[o.p++] ?? 0;
      if (o.p + 4 > son) break;
      abbOff = dv32(dil.info, o.p); o.p += 4;
    } else {
      if (o.p + 4 > son) break;
      abbOff = dv32(dil.info, o.p); o.p += 4;
      if (o.p + 1 > son) break;
      addrBoy = dil.info[o.p++] ?? 0;
    }
    if ((addrBoy !== 4 && addrBoy !== 8) || abbOff >= dil.abb.length) { o.p = son; continue; }
    const tab = abbrevOku(dil.abb, abbOff);
    unitSayisi++;
    const yigin: number[] = [];
    while (o.p < son) {
      const kod = uleb(dil.info, o);
      if (kod === null) break;
      if (!kod) { if (!yigin.length) break; yigin.pop(); continue; }
      const ab = tab.get(kod); if (!ab) break;
      const at = nitelikAtla(dil.info, o, ab.nitelikler, addrBoy, dil.str, dil.lineStr);
      if (!at.tamam) break;
      if (ab.tag === 0x2e) { subprogramSayisi++; if (at.ad && adlar.length < 50) adlar.push(at.ad); }
      if (ab.cocuk) yigin.push(1);
    }
    o.p = son;
  }
  if (!unitSayisi) return engel("DWARF CU kaydı yok (.debug_info boş/bozuk)");
  return { ok: true as const, arac: "rea_dwarf_ozet", dosya: elfYolu, unitSayisi, subprogramSayisi, fonksiyonAdlari: adlar };
}
