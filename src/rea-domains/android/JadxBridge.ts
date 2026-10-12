// Jadx köprüsü: headless decompile iskeleti (çalıştırmaz, sadece statik okur).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Katalog/facade ile uyumlu araç adları (rea_ prefix zorunlu).
export const JADX_TOOLS = ["rea_jadx_manifest", "rea_jadx_classes", "rea_jadx_decompile", "rea_jadx_full", "rea_jadx_methods", "rea_jadx_xrefs", "rea_jadx_read"] as const;

// JDK var mı? jadx headless mod tam JDK ister (JRE yetmez).
function jdkTamam(): boolean {
  try {
    const out = execFileSync("java", ["-version"], { stdio: ["ignore", "pipe", "pipe"] }).toString();
    return out.length >= 0; // java komutu çalıştıysa JDK/JRE mevcut
  } catch {
    // JAVA_HOME fallback kontrolü
    return !!process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME);
  }
}

// Headless jadx binary PATH'te mi?
function jadxTamam(): boolean {
  try {
    execFileSync("jadx", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Ortak yetenek kapısı: eksikse çalıştırma, capability_unsupported dön.
function kapi() {
  if (!jdkTamam()) return { ok: false as const, code: "capability_unsupported", neden: "Tam JDK bulunamadı (java/JAVA_HOME yok)" };
  if (!jadxTamam()) return { ok: false as const, code: "capability_unsupported", neden: "headless jadx PATH'te yok (https://github.com/skylot/jadx)" };
  return null;
}

// AndroidManifest.xml özeti (apk'yı çalıştırmadan).
export function rea_jadx_manifest(apkYolu: string) {
  const engel = kapi();
  if (engel) return engel;
  if (!existsSync(apkYolu)) return { ok: false as const, code: "capability_unsupported", neden: `APK yok: ${apkYolu}` };
  const out = execFileSync("jadx", ["--show-bad-code", "-e", apkYolu], { stdio: ["ignore", "pipe", "ignore"] });
  return { ok: true as const, arac: "rea_jadx_manifest", apk: apkYolu, bayt: out.length };
}

// Sınıf listesi (paket/sınıf adları, kod çalıştırmadan).
export function rea_jadx_classes(apkYolu: string, limit = 200) {
  const engel = kapi();
  if (engel) return engel;
  if (!existsSync(apkYolu)) return { ok: false as const, code: "capability_unsupported", neden: `APK yok: ${apkYolu}` };
  const out = execFileSync("jadx", ["-l", "info", apkYolu], { stdio: ["ignore", "pipe", "ignore"] }).toString();
  return { ok: true as const, arac: "rea_jadx_classes", siniflar: out.split("\n").slice(0, limit) };
}

// Tek sınıf decompile (headless, salt-okunur çıktı).
export function rea_jadx_decompile(apkYolu: string, sinif: string, ciktiDir: string) {
  const engel = kapi();
  if (engel) return engel;
  if (!existsSync(apkYolu)) return { ok: false as const, code: "capability_unsupported", neden: `APK yok: ${apkYolu}` };
  execFileSync("jadx", ["-d", ciktiDir, "--select-class", sinif, apkYolu], { stdio: "ignore" });
  return { ok: true as const, arac: "rea_jadx_decompile", sinif, ciktiDir };
}

// Yardımcı: çıktı dizinindeki tüm .java dosyalarını recursive topla.
function javaDosyalari(dizin: string): string[] {
  const bulunan: string[] = [];
  for (const girdi of readdirSync(dizin, { withFileTypes: true })) {
    const yol = join(dizin, girdi.name);
    if (girdi.isDirectory()) bulunan.push(...javaDosyalari(yol));
    else if (girdi.name.endsWith(".java")) bulunan.push(yol);
  }
  return bulunan;
}

// Method imza deseni: erişim belirteçli bildirim satırları.
const METHOD_DESENI = /(public|private|protected) .*\(.*\)/;

// Tüm APK decompile: sessiz, sadece -d (res/broken-code bayrağı yok).
export function rea_jadx_full(apkYolu: string, ciktiDir: string) {
  const engel = kapi();
  if (engel) return engel;
  if (!existsSync(apkYolu)) return { ok: false as const, code: "capability_unsupported", neden: `APK yok: ${apkYolu}` };
  execFileSync("jadx", ["-d", ciktiDir, apkYolu], { stdio: "ignore" });
  const javaSayisi = existsSync(ciktiDir) ? javaDosyalari(ciktiDir).length : 0;
  return { ok: true as const, arac: "rea_jadx_full", ciktiDir, java_dosya_sayisi: javaSayisi };
}

// Çıktı dizinindeki method imzaları (jadx gerektirmez, salt dosya tarama).
export function rea_jadx_methods(ciktiDir: string, sinifFiltre?: string, limit = 200) {
  if (!existsSync(ciktiDir)) return { ok: false as const, code: "capability_unsupported", neden: `Çıktı dizini yok: ${ciktiDir}` };
  const methodlar: { sinif: string; method: string }[] = [];
  for (const dosya of javaDosyalari(ciktiDir)) {
    const sinif = dosya.split(/[\\/]/).pop()?.replace(/\.java$/, "") ?? dosya;
    if (sinifFiltre && !sinif.includes(sinifFiltre) && !dosya.includes(sinifFiltre)) continue;
    for (const satir of readFileSync(dosya, "utf8").split("\n")) {
      if (METHOD_DESENI.test(satir)) {
        methodlar.push({ sinif, method: satir.trim() });
        if (methodlar.length >= limit) return { ok: true as const, arac: "rea_jadx_methods", methodlar };
      }
    }
  }
  return { ok: true as const, arac: "rea_jadx_methods", methodlar };
}

// Terim geçen satırlar: ajanın xref takibi için (dosya:satır:metin).
export function rea_jadx_xrefs(ciktiDir: string, terim: string, limit = 100) {
  if (!terim) return { ok: false as const, code: "capability_unsupported", neden: "Arama terimi boş" };
  if (!existsSync(ciktiDir)) return { ok: false as const, code: "capability_unsupported", neden: `Çıktı dizini yok: ${ciktiDir}` };
  const kayitlar: { dosya: string; satir: number; metin: string }[] = [];
  for (const dosya of javaDosyalari(ciktiDir)) {
    const satirlar = readFileSync(dosya, "utf8").split("\n");
    for (let i = 0; i < satirlar.length; i++) {
      const metin = (satirlar[i] ?? "").trim();
      if (metin.includes(terim)) {
        kayitlar.push({ dosya, satir: i + 1, metin });
        if (kayitlar.length >= limit) return { ok: true as const, arac: "rea_jadx_xrefs", kayitlar };
      }
    }
  }
  return { ok: true as const, arac: "rea_jadx_xrefs", kayitlar };
}

// Sınıfın .java dosyasını bul, ilk 400 satırını döndür (ajan okusun diye).
export function rea_jadx_read(ciktiDir: string, sinif: string) {
  if (!existsSync(ciktiDir)) return { ok: false as const, code: "capability_unsupported", neden: `Çıktı dizini yok: ${ciktiDir}` };
  const hedef = javaDosyalari(ciktiDir).find((d) => d.endsWith(`${sinif}.java`) || d.includes(sinif));
  if (!hedef) return { ok: false as const, code: "capability_unsupported", neden: `Sınıf bulunamadı: ${sinif}` };
  const satirlar = readFileSync(hedef, "utf8").split("\n");
  return { ok: true as const, arac: "rea_jadx_read", dosya: hedef, toplam_satir: satirlar.length, satirlar: satirlar.slice(0, 400) };
}
