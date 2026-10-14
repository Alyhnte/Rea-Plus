// PdbReader: PE debug dizininden CodeView RSDS ile PDB yolu çıkarır (salt-okunur, LE)
// + Microsoft symbol server'dan PDB indirme + bütünlük + önbellek (Dalga B/4).
// PE çekirdeği (başlık/RVA/CSTR/GUID) PeReader'dan gelir; burada kopya YOK.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { peBaslikOku, peCstr, peGuidBicim, peHamOku, peRvaCev } from "../winpe/PeReader.js";
// Facade uyumu: rea_ prefix zorunlu.
export const TYPEDEF_PDB_TOOLS = ["rea_pdb_yolu"] as const;
type Engel = { ok: false; code: "bulunamadi"; neden: string };
const engel = (neden: string): Engel => ({ ok: false, code: "bulunamadi", neden });
// PE debug dizininde Type==2 (CodeView) girdiyi bul, RSDS->guid+yas+pdb adı çöz.
export function rea_pdb_yolu(peYolu: string) {
  if (!peYolu) return engel("yol boş");
  const ham = peHamOku(peYolu);
  if ("hata" in ham) return engel(ham.hata);
  const { b, dv } = ham;
  const h = peBaslikOku(b, dv);
  if (!h) return engel("PE değil (PE sig/COFF çözülemedi)");
  if (!h.dbgRVA || !h.dbgBoy) return engel("PDB debug kaydı yok (debug dizini boş)");
  const adet = Math.floor(h.dbgBoy / 28);
  for (let k = 0; k < adet; k++) {
    const ro = peRvaCev(b, dv, h, h.dbgRVA + k * 28);
    if (ro < 0 || ro + 28 > b.length) continue;
    if (dv.getUint32(ro + 12, true) !== 2) continue; // yalnız CodeView
    const hamPtr = dv.getUint32(ro + 24, true), rva = dv.getUint32(ro + 20, true);
    const p = hamPtr > 0 && hamPtr + 24 < b.length ? hamPtr : peRvaCev(b, dv, h, rva);
    if (p < 0 || p + 24 > b.length) continue;
    if (b[p] !== 0x52 || b[p + 1] !== 0x53 || b[p + 2] !== 0x44 || b[p + 3] !== 0x53) continue; // RSDS
    const guid = peGuidBicim(dv, p + 4), yas = dv.getUint32(p + 20, true);
    const pdb = peCstr(b, p + 24);
    if (!pdb) continue;
    return { ok: true as const, arac: "rea_pdb_yolu", dosya: peYolu, pdb, guid, yas };
  }
  return engel("PDB debug kaydı yok (CodeView RSDS bulunamadı)");
}

// --- PDB indirme (Microsoft symbol server) + bütünlük + önbellek ---
// URL düzeni (SymSrv PDB70): <server>/<Ad>/<GUID-tiresiz><YAS-ondalık>/<Ad>.
// Önbellek anahtarı = GUID+yaş: <cache>/<Ad>/<SIG>/<Ad>.
// Geçersizlik: önbellekteki dosya bütünlüğü tutmuyorsa yeniden indirilir;
// bozuk indirilen asla yazılmaz. Ağ yoksa dürüst hata (sahte PDB YOK).
export const PDB_SYMBOL_SERVER = "https://msdl.microsoft.com/download/symbols";
export type PdbFetchYanit = { ok: boolean; status: number; arrayBuffer: () => Promise<ArrayBuffer> };
export type PdbIndirSecenek = {
  cacheDir?: string;
  serverUrl?: string;
  fetchFn?: (url: string) => Promise<PdbFetchYanit>;
};
type PdbIndirHata = { ok: false; code: "bulunamadi" | "ag_hatasi" | "butunluk_hatasi"; neden: string };
const indirEngel = (code: PdbIndirHata["code"], neden: string): PdbIndirHata => ({ ok: false, code, neden });
function varsayilanCache(): string {
  if (process.env.REAPLUS_SYMBOL_CACHE) return process.env.REAPLUS_SYMBOL_CACHE;
  if (process.platform === "win32" && process.env.LOCALAPPDATA) return join(process.env.LOCALAPPDATA, "rea-plus", "symbols");
  return join(homedir(), ".cache", "rea-plus", "symbols");
}
// GUID+yaş LE deseni (20 bayt): PDB akışındaki kimlikle ham bayt eşleşmesi için.
function guidYasDesen(guid: string, yas: number): Buffer | null {
  const s = guid.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(s)) return null;
  const d = Buffer.alloc(20);
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  dv.setUint32(0, parseInt(s.slice(0, 8), 16), true);
  dv.setUint16(4, parseInt(s.slice(8, 12), 16), true);
  dv.setUint16(6, parseInt(s.slice(12, 16), 16), true);
  for (let i = 0; i < 8; i++) dv.setUint8(8 + i, parseInt(s.slice(16 + i * 2, 18 + i * 2), 16));
  dv.setUint32(16, yas >>> 0, true);
  return d;
}
const MSF_IMZA = "Microsoft C/C++ MSF 7.00\r\n\x1aDS\0\0\0";
// Bütünlük: MSF imzası + GUID+yaş deseninin ham baytlarda bulunması.
export function pdbButunlukKontrol(ham: Uint8Array, guid: string, yas: number): boolean {
  if (ham.length < 64) return false;
  const b = Buffer.from(ham.buffer, ham.byteOffset, ham.byteLength);
  if (b.subarray(0, 32).toString("latin1") !== MSF_IMZA) return false;
  const desen = guidYasDesen(guid, yas);
  if (!desen) return false;
  return b.indexOf(desen) >= 0;
}
// CodeView yolu tam yol olabilir ("C:\...\x.pdb"); platform bağımsız taban ad.
function pdbTabanAd(pdb: string): string {
  const parca = pdb.split(/[\\/]/).pop() ?? "";
  if (!/\.pdb$/i.test(parca) || parca.includes("..") || /[<>:"|?*]/.test(parca)) return "";
  return parca;
}
export async function rea_pdb_indir(peYolu: string, sec: PdbIndirSecenek = {}) {
  const bilgi = rea_pdb_yolu(peYolu);
  if (!bilgi.ok) return indirEngel("bulunamadi", bilgi.neden);
  const ad = pdbTabanAd(bilgi.pdb);
  if (!ad) return indirEngel("bulunamadi", `desteklenmeyen PDB adı: ${bilgi.pdb}`);
  const sig = bilgi.guid.replace(/-/g, "").toUpperCase() + String(bilgi.yas);
  const taban = (sec.serverUrl ?? PDB_SYMBOL_SERVER).replace(/\/+$/, "");
  const url = `${taban}/${ad}/${sig}/${ad}`;
  const kok = sec.cacheDir ?? varsayilanCache();
  const hedef = join(kok, ad, sig, ad);
  try {
    if (existsSync(hedef) && pdbButunlukKontrol(readFileSync(hedef), bilgi.guid, bilgi.yas))
      return { ok: true as const, arac: "rea_pdb_indir" as const, dosya: peYolu, pdb: bilgi.pdb, guid: bilgi.guid, yas: bilgi.yas, yol: hedef, url, cache: true as const };
  } catch { /* önbellek okunamazsa yeniden indir */ }
  const al = sec.fetchFn ?? fetch;
  let agHatasi: string | null = null;
  for (let deneme = 1; deneme <= 2; deneme++) {
    let yanit: PdbFetchYanit;
    try {
      yanit = await al(url);
    } catch (e) {
      agHatasi = e instanceof Error ? e.message : String(e);
      break; // ağ yoksa aynı URL'yi tekrar denemek anlamsız
    }
    if (!yanit || !yanit.ok || yanit.status !== 200)
      return indirEngel("ag_hatasi", `PDB indirilemedi (HTTP ${yanit ? yanit.status : "yanıt yok"}): ${url} — sahte dosya yazılmadı`);
    const buf = Buffer.from(await yanit.arrayBuffer());
    if (!pdbButunlukKontrol(buf, bilgi.guid, bilgi.yas)) continue; // bir kez daha dene
    mkdirSync(join(kok, ad, sig), { recursive: true });
    writeFileSync(hedef, buf);
    return { ok: true as const, arac: "rea_pdb_indir" as const, dosya: peYolu, pdb: bilgi.pdb, guid: bilgi.guid, yas: bilgi.yas, yol: hedef, url, cache: false as const };
  }
  if (agHatasi) return indirEngel("ag_hatasi", `PDB indirilemedi (ağ: ${agHatasi}): ${url} — sahte dosya yazılmadı`);
  return indirEngel("butunluk_hatasi", `PDB bütünlüğü tutmadı (2 deneme): MSF imzası veya GUID+yaş deseni yok — önbelleğe yazılmadı`);
}
