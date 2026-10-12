// Cutter köprüsü: Cutter = Rizin GUI, otomasyon rizin CLI üstünden yapılır.
// Hedef çalıştırılmaz; salt-okunur analiz komutları gömülü çalışır.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
// Katalog/facade uyumu: rea_ prefix zorunlu, 6 araç.
export const CUTTER_TOOLS = ["rea_cutter_funcs", "rea_cutter_disasm", "rea_cutter_xrefs", "rea_cutter_strings", "rea_cutter_decompile", "rea_cutter_caps"] as const;
// Üst sınırlar: aaa takılmasın (30sn), çıktı sığsın (16MB).
const ZAMAN_ASIMI = 30_000;
const MAKS_TAMPON = 16 * 1024 * 1024;
// rizin veya riz-bin PATH'te mi? (-v çalışırsa tamam)
export function cutterTamam(): boolean { return rizinBin() !== null; }
// Binary seçimi: rizin öncelikli, yedek riz-bin.
function rizinBin(): string | null {
  for (const bin of ["rizin", "riz-bin"]) {
    try { execFileSync(bin, ["-v"], { stdio: "ignore", timeout: ZAMAN_ASIMI }); return bin; }
    catch { /* sonraki adaya geç */ }
  }
  return null;
}
type Engel = { ok: false; code: "capability_unsupported"; neden: string };
// Ortak giriş: kapı (binary) + hedef kontrolü; geçerse binary döner.
function giris(hedef: string): { bin: string } | Engel {
  const bin = rizinBin();
  if (!bin) return { ok: false, code: "capability_unsupported", neden: "rizin/riz-bin PATH'te yok (https://rizin.re)" };
  if (!existsSync(hedef)) return { ok: false, code: "capability_unsupported", neden: `hedef yok: ${hedef}` };
  return { bin };
}
// Tek komut: rizin -q -c "<komut>;exit" hedef, çıktı metin döner.
function calistir(bin: string, hedef: string, komut: string): string {
  return execFileSync(bin, ["-q", "-c", `${komut};exit`, hedef], { encoding: "utf8", timeout: ZAMAN_ASIMI, maxBuffer: MAKS_TAMPON, stdio: ["ignore", "pipe", "pipe"] });
}
// aaa günlüğünü atlayıp ilk JSON değerini parse eder (dizi/obje).
function jsonAl<T>(ham: string): T {
  const d = ham.indexOf("["); const o = ham.indexOf("{");
  const bas = d === -1 ? o : o === -1 ? d : Math.min(d, o);
  return JSON.parse(ham.slice(bas)) as T;
}
// Adres rizin komut dizisine gömülür: yalnız hex/sayı/sembol biçimi geçer (ayırıcı = enjeksiyon).
const ADRES_RE = /^(0x[0-9a-fA-F]+|[0-9]+|[A-Za-z_][A-Za-z0-9_.:]*)$/;
function adresKontrol(addr: string): Engel | null {
  return ADRES_RE.test(addr) ? null : { ok: false, code: "capability_unsupported", neden: `geçersiz adres: ${addr}` };
}
// Hata zarfı: rizin/parse hatası capability_unsupported olur.
function hata(neden: string, e: unknown): Engel {
  return { ok: false, code: "capability_unsupported", neden: `${neden}: ${e instanceof Error ? e.message : String(e)}` };
}
// Fonksiyon listesi: aaa + aflj (ad/offset/boyut).
export function rea_cutter_funcs(hedef: string) {
  const g = giris(hedef); if ("neden" in g) return g;
  try {
    const dizi = jsonAl<{ name?: string; offset?: number; size?: number }[]>(calistir(g.bin, hedef, "aaa;aflj"));
    return { ok: true as const, arac: "rea_cutter_funcs", hedef, fonksiyonlar: dizi.map((f) => ({ ad: f.name, offset: f.offset, boyut: f.size })) };
  } catch (e) { return hata("aflj hatası", e); }
}
// Disas: pdfj @ addr, ilk len op (varsayılan 50).
export function rea_cutter_disasm(hedef: string, addr: string, len = 50) {
  const ak = adresKontrol(addr); if (ak) return ak;
  const g = giris(hedef); if ("neden" in g) return g;
  try {
    const obje = jsonAl<{ ops?: unknown[] }>(calistir(g.bin, hedef, `aaa;pdfj @ ${addr}`));
    return { ok: true as const, arac: "rea_cutter_disasm", hedef, addr, ops: (Array.isArray(obje.ops) ? obje.ops : []).slice(0, len) };
  } catch (e) { return hata("pdfj hatası", e); }
}
// Xref listesi: axtj @ addr.
export function rea_cutter_xrefs(hedef: string, addr: string) {
  const ak = adresKontrol(addr); if (ak) return ak;
  const g = giris(hedef); if ("neden" in g) return g;
  try {
    const dizi = jsonAl<unknown[]>(calistir(g.bin, hedef, `aaa;axtj @ ${addr}`));
    return { ok: true as const, arac: "rea_cutter_xrefs", hedef, addr, xrefs: Array.isArray(dizi) ? dizi : [] };
  } catch (e) { return hata("axtj hatası", e); }
}
// String listesi: izj, ilk len kayıt (varsayılan 200).
export function rea_cutter_strings(hedef: string, len = 200) {
  const g = giris(hedef); if ("neden" in g) return g;
  try {
    const obje = jsonAl<{ strings?: unknown[] }>(calistir(g.bin, hedef, "izj"));
    return { ok: true as const, arac: "rea_cutter_strings", hedef, strings: (Array.isArray(obje.strings) ? obje.strings : []).slice(0, len) };
  } catch (e) { return hata("izj hatası", e); }
}
// Decompile: pdc @ addr (r2dec varsa), yoksa pdf metni + not.
export function rea_cutter_decompile(hedef: string, addr: string) {
  const ak = adresKontrol(addr); if (ak) return ak;
  const g = giris(hedef); if ("neden" in g) return g;
  try { const ham = calistir(g.bin, hedef, `aaa;pdc @ ${addr}`).trim(); if (ham && !ham.includes("Invalid command")) return { ok: true as const, arac: "rea_cutter_decompile", hedef, addr, kaynak: "pdc", kod: ham }; }
  catch { /* pdf yedeğine düş */ }
  try { const yedek = calistir(g.bin, hedef, `aaa;pdf @ ${addr}`).trim(); if (!yedek) return { ok: false as const, code: "capability_unsupported" as const, neden: "pdc ve pdf boş çıktı (adres bir fonksiyona çözülememiş olabilir)" }; return { ok: true as const, arac: "rea_cutter_decompile", hedef, addr, kaynak: "pdf", not: "r2dec yok (pdc boş), pdf metni dönüldü", kod: yedek }; }
  catch (e) { return hata("decompile hatası", e); }
}
// Yetenek: rizin sürümü + pdc var/yok (malloc hedefiyle yoklanır).
export function rea_cutter_caps() {
  const bin = rizinBin();
  if (!bin) return { ok: false as const, code: "capability_unsupported", neden: "rizin/riz-bin PATH'te yok (https://rizin.re)" };
  const surum = execFileSync(bin, ["-v"], { encoding: "utf8", timeout: ZAMAN_ASIMI }).split("\n")[0]?.trim() ?? "";
  let pdc = false;
  try { pdc = !calistir(bin, "malloc://32", "pdc").toLowerCase().includes("invalid"); } catch { pdc = false; }
  return { ok: true as const, arac: "rea_cutter_caps", surum, pdc };
}
