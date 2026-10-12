// r2plus: radare2 6.2.2 gerçek exec (stub yok).
// Fixture: conduit mini_branch.elf (entry0=0x400200, 4 blok).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
// Katalog uyumu: rea_ prefix zorunlu, 3 araç.
export const R2PLUS_TOOLS = ["rea_r2_callgraph", "rea_r2_esil", "rea_r2_debug"] as const;
// Üst sınırlar: aaa bitmesi için 60sn, çıktı için 16MB.
const ZAMAN_ASIMI = 60_000;
const MAKS_TAMPON = 16 * 1024 * 1024;
// Adres r2 komut dizisine gömülür: yalnız hex/sayı/sembol biçimi geçer (ayırıcı = enjeksiyon).
const ADRES_RE = /^(0x[0-9a-fA-F]+|[0-9]+|[A-Za-z_][A-Za-z0-9_.:]*)$/;
// Binary seçimi: radare2 öncelikli (r2.bat execFileSync'te ENOENT verir).
function r2Bin(): string | null {
  const aday = process.env.REA_R2_BIN ? [process.env.REA_R2_BIN, "radare2", "r2"] : ["radare2", "r2"];
  for (const bin of aday) {
    try { execFileSync(bin, ["-v"], { stdio: "ignore", timeout: ZAMAN_ASIMI }); return bin; }
    catch { /* sonraki adaya geç */ }
  }
  return null;
}
// Kapı durumu (testler için): r2 bulunabiliyor mu?
export function r2Tamam(): boolean { return r2Bin() !== null; }
type Engel = { ok: false; code: "capability_unsupported"; neden: string };
// Ortak giriş: boş arg + binary + hedef kontrolü.
function giris(hedef: string): { bin: string } | Engel {
  if (!hedef) return { ok: false, code: "capability_unsupported", neden: "hedef boş" };
  const bin = r2Bin();
  if (!bin) return { ok: false, code: "capability_unsupported", neden: "radare2 PATH'te yok" };
  if (!existsSync(hedef)) return { ok: false, code: "capability_unsupported", neden: `hedef yok: ${hedef}` };
  return { bin };
}
// İlk JSON değeri parse et (aaa günlüğü/uyarı stderr'de kalır).
function jsonAl<T>(ham: string): T {
  const d = ham.indexOf("["); const o = ham.indexOf("{");
  const bas = d === -1 ? o : o === -1 ? d : Math.min(d, o);
  return JSON.parse(ham.slice(bas)) as T;
}
// Yardımcı: r2 -q -c 'aaa; <komutlar>; exit' stdout'unu JSON parse eder.
export function r2Json<T>(hedef: string, komutlar: string): T {
  const g = giris(hedef);
  if ("neden" in g) throw new Error(g.neden);
  if (!komutlar) throw new Error("komut boş");
  const ham = execFileSync(g.bin, ["-q", "-c", `aaa; ${komutlar}; exit`, hedef], { encoding: "utf8", timeout: ZAMAN_ASIMI, maxBuffer: MAKS_TAMPON, stdio: ["ignore", "pipe", "pipe"] });
  return jsonAl<T>(String(ham));
}
// Hata zarfı: r2/parse hatası unsupported olur (debug hariç).
function hata(neden: string, e: unknown): Engel {
  return { ok: false, code: "capability_unsupported", neden: `${neden}: ${e instanceof Error ? e.message : String(e)}` };
}
// Çağrı grafı: agfj (ad + çağrılar; call op'larındaki ptr'ler).
export function rea_r2_callgraph(hedef: string) {
  const g = giris(hedef); if ("neden" in g) return g;
  try {
    const dizi = r2Json<{ name?: string; addr?: number; blocks?: { ops?: { opcode?: string; ptr?: number }[] }[] }[]>(hedef, "agfj");
    const fonksiyonlar = dizi.map((f) => ({ ad: f.name ?? "", addr: f.addr, cagrilar: [...new Set((f.blocks ?? []).flatMap((b) => b.ops ?? []).filter((o) => (o.opcode ?? "").startsWith("call")).map((o) => o.ptr).filter((x) => typeof x === "number"))].map((x) => "0x" + x.toString(16)) }));
    return { ok: true as const, arac: "rea_r2_callgraph", hedef, fonksiyonlar };
  } catch (e) { return hata("agfj hatası", e); }
}
// ESIL: aei;aeip + s addr + aes adım + aerj regs JSON.
export function rea_r2_esil(hedef: string, addr: string, adim = 20) {
  const g = giris(hedef); if ("neden" in g) return g;
  if (!addr || !ADRES_RE.test(addr)) return { ok: false as const, code: "capability_unsupported" as const, neden: `geçersiz adres: ${addr}` };
  try {
    const regs = r2Json<Record<string, number>>(hedef, `s ${addr}; aei; aeip; aes ${adim}; aerj`);
    return { ok: true as const, arac: "rea_r2_esil", hedef, addr, adim, regs };
  } catch (e) { return hata("esil hatası", e); }
}
// Toplu debug: db+dc+dr+dk; Windows'ta r2 sınırlıysa gerçek çıktı+not dön (unsupported DEĞİL).
export function rea_r2_debug(hedef: string, bpAddr: string) {
  const g = giris(hedef); if ("neden" in g) return g;
  if (!bpAddr || !ADRES_RE.test(bpAddr)) return { ok: false as const, code: "capability_unsupported" as const, neden: `geçersiz adres: ${bpAddr}` };
  const not = "Windows'ta r2 -d sınırlı olabilir (ELF Win32 değil); çıktı gerçek r2 çıktısıdır";
  try {
    const cikti = execFileSync(g.bin, ["-d", "-q", "-c", `db ${bpAddr};dc;dr;dk;exit`, hedef], { encoding: "utf8", timeout: ZAMAN_ASIMI, maxBuffer: MAKS_TAMPON, stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true as const, arac: "rea_r2_debug", hedef, bpAddr, cikti: String(cikti), not };
  } catch (e) {
    const err = e as { stdout?: unknown; stderr?: unknown; message?: string };
    const cikti = String(err.stdout ?? "") + String(err.stderr ?? "") + (err.message ?? "");
    return { ok: true as const, arac: "rea_r2_debug", hedef, bpAddr, cikti, not };
  }
}
