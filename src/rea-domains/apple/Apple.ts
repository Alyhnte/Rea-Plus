// rea-domains/apple: Mach-O + bundle + plist taraması (offline)
// Mach-O sihirleri ve Info.plist anahtarları saf TS ile okunur, xar açıcı yok.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
export type ReaAppleResult =
  | { ok: true; tool: string; summary: string; details: Record<string, unknown> }
  | { ok: false; code: "capability_unsupported"; reason: string };
// Ortam kapısı: dosya yoksa ya da okunamazsa analiz yapılamaz.
function hamOku(yol: string): Buffer | null {
  // existsSync + try/catch ile silinmiş/bozuk hedef elenir.
  try { if (!existsSync(yol)) return null; return readFileSync(yol); }
  catch { return null; }
}
// Sihir oku: ilk 4 baytı LE hex olarak "cffaedfe" biçiminde verir.
function sihir(buf: Buffer): string { return buf.subarray(0, 4).toString("hex"); }
// dyld yolları: metin içindeki .dylib/.framework yollarını toplar.
function dyldBul(txt: string): string[] {
  // LC_LOAD_DYLIB adları mutlak yol olduğundan metin taraması yeterlidir.
  const m = txt.match(/\/[\w.\-@/]+?\.(dylib|framework\/[\w.\-]+)/g);
  return [...new Set(m ?? [])].slice(0, 50);
}
// Mach-O/fat kontrolü: sihir + dyld yol listesi.
export function rea_apple_macho(yol: string): ReaAppleResult {
  const buf = hamOku(yol);
  // Dosya yoksa Mach-O bakılamaz.
  if (!buf) return { ok: false, code: "capability_unsupported", reason: `dosya yok/okunamadı: ${yol}` };
  if (buf.length < 32) return { ok: false, code: "capability_unsupported", reason: "dosya çok kısa" };
  const s = sihir(buf);
  // 64-bit LE cffaedfe, 64-bit BE feedfacf, 32-bit cefafeed/fe edface, fat cafebabe.
  const bilinen = new Set(["cffaedfe", "feedfacf", "cefaedfe", "feedface", "cafebabe", "bebafeca"]);
  // Sihir tutmazsa Mach-O değildir.
  if (!bilinen.has(s)) return { ok: false, code: "capability_unsupported", reason: `Mach-O/fat sihri yok: ${s}` };
  const txt = buf.toString("latin1");
  const dyld = dyldBul(txt);
  const fatMi = s === "cafebabe" || s === "bebafeca";
  return { ok: true, tool: "rea_apple_macho", summary: `sihir=${s}${fatMi ? " fat" : ""} dyld=${dyld.length}`, details: { sihir: s, fatMi, dyld } };
}
// Basit plist key parse: <key>X</key><string>Y</string> eşleşmesi.
function plistKey(txt: string, anahtar: string): string | null {
  // Boşluk/satır sonu farkını yutmak için \s* kullanılır.
  const m = txt.match(new RegExp(`<key>${anahtar}<\\/key>\\s*<string>([^<]*)<\\/string>`));
  return m?.[1] ?? null;
}
// Info.plist: CFBundleIdentifier + Executable çıkarır.
export function rea_apple_plist(yol: string): ReaAppleResult {
  const buf = hamOku(yol);
  // Plist dosyası yoksa kapı dışıdır.
  if (!buf) return { ok: false, code: "capability_unsupported", reason: `dosya yok/okunamadı: ${yol}` };
  const txt = buf.toString("utf8");
  // <plist> kökü yoksa Apple plist değildir.
  if (!txt.includes("<plist")) return { ok: false, code: "capability_unsupported", reason: "plist kökü yok" };
  const bundleId = plistKey(txt, "CFBundleIdentifier");
  const exec = plistKey(txt, "CFBundleExecutable") ?? plistKey(txt, "CFBundleName");
  // İki kritik anahtar da yoksa bozuk sayılır.
  if (!bundleId && !exec) return { ok: false, code: "capability_unsupported", reason: "CFBundle anahtarı yok" };
  return { ok: true, tool: "rea_apple_plist", summary: `bundle=${bundleId ?? "?"}`, details: { bundleId, executable: exec } };
}
// Bundle anatomisi: Contents/MacOS + Frameworks sayımı + Info.plist.
export function rea_apple_bundle(dizin: string): ReaAppleResult {
  // Dizin yoksa ya da dosya ise bundle bakılamaz.
  try { if (!existsSync(dizin) || !statSync(dizin).isDirectory()) return { ok: false, code: "capability_unsupported", reason: `dizin yok: ${dizin}` }; }
  catch { return { ok: false, code: "capability_unsupported", reason: `dizin okunamadı: ${dizin}` }; }
  // Kök liste + olası Info.plist konumları taranır.
  const kok = readdirSync(dizin);
  const adayPlist = [join(dizin, "Info.plist"), join(dizin, "Contents", "Info.plist")];
  const plist = adayPlist.find((p) => existsSync(p)) ?? null;
  const macos = existsSync(join(dizin, "Contents", "MacOS"));
  const fwDir = join(dizin, "Contents", "Frameworks");
  // Frameworks varsa dylib/framework say, yoksa 0 kabul et.
  let frameworks = 0;
  try { frameworks = existsSync(fwDir) ? readdirSync(fwDir).length : 0; } catch { frameworks = 0; }
  // Hiç bundle belirtisi yoksa kapı dışıdır.
  if (!plist && !macos && !kok.some((k) => k.endsWith(".app") || k === "Contents"))
    return { ok: false, code: "capability_unsupported", reason: "bundle anatomisi yok" };
  return { ok: true, tool: "rea_apple_bundle", summary: `macos=${macos} fw=${frameworks}`, details: { macos, frameworks, plist, kok: kok.length } };
}
