// Jadx köprüsü: headless decompile iskeleti (çalıştırmaz, sadece statik okur).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// Katalog/facade ile uyumlu araç adları (rea_ prefix zorunlu).
export const JADX_TOOLS = ["rea_jadx_manifest", "rea_jadx_classes", "rea_jadx_decompile"] as const;

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
