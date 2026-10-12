// Apktool köprüsü: resource decode iskeleti (çalıştırmaz, apktool launcher gerekir).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// Facade prefix kuralı: rea_ öneki zorunlu.
export const APKTOOL_TOOLS = ["rea_apktool_decode", "rea_apktool_info"] as const;

// apktool launcher (bat/sh/wrapper) PATH'te mi?
function apktoolTamam(): boolean {
  try {
    execFileSync("apktool", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Java kontrolü: apktool da JVM ister.
function javaTamam(): boolean {
  try {
    execFileSync("java", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return !!process.env.JAVA_HOME;
  }
}

// Ortak kapı: eksik bağımlılıkta capability_unsupported.
function kapi() {
  if (!javaTamam()) return { ok: false as const, code: "capability_unsupported", neden: "Java bulunamadı (apktool JVM ister)" };
  if (!apktoolTamam()) return { ok: false as const, code: "capability_unsupported", neden: "apktool launcher PATH'te yok (https://apktool.org/)" };
  return null;
}

// APK'yı decode et: manifest + res/xml çıkarımı.
export function rea_apktool_decode(apkYolu: string, ciktiDir: string, frameworkDir?: string) {
  const engel = kapi();
  if (engel) return engel;
  if (!existsSync(apkYolu)) return { ok: false as const, code: "capability_unsupported", neden: `APK yok: ${apkYolu}` };
  const args = ["d", "-f", "-o", ciktiDir, apkYolu];
  if (frameworkDir) args.push("-p", frameworkDir);
  execFileSync("apktool", args, { stdio: "ignore" });
  return { ok: true as const, arac: "rea_apktool_decode", apk: apkYolu, ciktiDir };
}

// Ortam bilgisi: sürüm + framework dizini varlığı.
export function rea_apktool_info() {
  const engel = kapi();
  if (engel) return engel;
  const surum = execFileSync("apktool", ["-version"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  return { ok: true as const, arac: "rea_apktool_info", surum };
}
