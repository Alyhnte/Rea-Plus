// Harmony HAP: HAP=zip, saf TS (EOCD->central, node:zlib inflate).
import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
// Facade uyumu: rea_ prefix zorunlu.
export const HARMONY_TOOLS = ["rea_hap_liste", "rea_hap_manifest"] as const;
type Engel = { ok: false; code: "capability_unsupported"; neden: string };
const engel = (neden: string): Engel => ({ ok: false, code: "capability_unsupported", neden });
// EOCD konumu: sondan PK\x05\x06 tara (yorumsuz kuyruk).
function eocdBul(b: Buffer): number {
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (b.readUInt32LE(i) === 0x06054b50) return i;
  return -1;
}
// Central girdileri: ad + yöntem + local offset (CRC bakılmaz).
function merkez(b: Buffer): { ad: string; yontem: number; lho: number }[] | null {
  const e = eocdBul(b); if (e < 0) return null;
  const adet = b.readUInt16LE(e + 10), off = b.readUInt32LE(e + 16);
  if (off >= b.length) return null;
  const out: { ad: string; yontem: number; lho: number }[] = [];
  let o = off;
  for (let k = 0; k < adet; k++) {
    if (o + 46 > b.length || b.readUInt32LE(o) !== 0x02014b50) return null;
    const al = b.readUInt16LE(o + 28), el = b.readUInt16LE(o + 30), cl = b.readUInt16LE(o + 32);
    if (o + 46 + al + el + cl > b.length) return null;
    out.push({ ad: String(b.subarray(o + 46, o + 46 + al)), yontem: b.readUInt16LE(o + 10), lho: b.readUInt32LE(o + 42) });
    o += 46 + al + el + cl;
  }
  return out;
}
// Dosya içeriği: local başlıktan veriyi kes, stored/deflate çöz.
function coz(b: Buffer, g: { yontem: number; lho: number }): Buffer | null {
  if (g.lho + 30 > b.length || b.readUInt32LE(g.lho) !== 0x04034b50) return null;
  const nl = b.readUInt16LE(g.lho + 26), el = b.readUInt16LE(g.lho + 28), cs = b.readUInt32LE(g.lho + 18);
  const vo = g.lho + 30 + nl + el, ham = b.subarray(vo, vo + cs);
  if (g.yontem === 0) return Buffer.from(ham);
  if (g.yontem === 8) { try { return inflateRawSync(ham); } catch { return null; } }
  return null;
}
// HAP oku: yokluk + PK imza kapısı (HAP değilse unsupported).
function hapOku(yol: string): Buffer | Engel {
  if (!yol) return engel("yol boş");
  if (!existsSync(yol)) return engel(`dosya yok: ${yol}`);
  const b = readFileSync(yol);
  if (b.length < 22 || b[0] !== 0x50 || b[1] !== 0x4b) return engel("HAP değil (PK zip imzası yok)");
  return b;
}
// HAP liste: central directory dosya adları (offline, yürütme yok).
export function rea_hap_liste(yol: string) {
  const r = hapOku(yol); if (Buffer.isBuffer(r) === false) return r;
  const b = r as Buffer, m = merkez(b);
  if (!m) return engel("HAP değil (EOCD/central çözülemedi)");
  return { ok: true as const, arac: "rea_hap_liste", dosya: yol, dosyalar: m.map((g) => g.ad), sayi: m.length };
}
// HAP manifest: config.json (yedek module.json) parse, bundle+version.
export function rea_hap_manifest(yol: string) {
  const r = hapOku(yol); if (Buffer.isBuffer(r) === false) return r;
  const b = r as Buffer, m = merkez(b);
  if (!m) return engel("HAP değil (EOCD/central çözülemedi)");
  for (const aday of ["config.json", "module.json"]) {
    const g = m.find((x) => x.ad === aday || x.ad.endsWith(`/${aday}`));
    if (!g) continue;
    const ham = coz(b, g); if (!ham) continue;
    try {
      const j = JSON.parse(String(ham));
      const a = j.app ?? {};
      const ad = a.bundleName ?? j.bundleName ?? j.package ?? "?";
      const sur = a.version?.name ?? a.versionName ?? j.version?.name ?? j.versionName ?? j.version ?? "?";
      if (ad === "?" || sur === "?") continue;
      return { ok: true as const, arac: "rea_hap_manifest", dosya: yol, kaynak: g.ad, bundleName: String(ad), version: String(sur) };
    } catch { continue; }
  }
  return engel("manifest yok (config.json/module.json çözülemedi)");
}
