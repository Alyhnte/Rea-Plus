// Apktool köprüsü: decode + build + framework (gerçek exec, apktool launcher gerekir).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

// Facade prefix kuralı: rea_ öneki zorunlu.
export const APKTOOL_TOOLS = [
  "rea_apktool_decode",
  "rea_apktool_info",
  "rea_apktool_build",
  "rea_apktool_framework",
  "rea_apktool_caps",
] as const;

// aapt2 konumu: build-tools 34.0.0 sabiti önce, PATH yedeği sonra
// (apktool build yeniden paketlerken aapt2 çağırır).
const AAPT2_SABIT = "C:\\tools\\android-sdk\\build-tools\\34.0.0\\aapt2.exe";

// apktool launcher koşusu (gerçek exec, stub yok).
// Windows'ta apktool bir .bat'tir: doğrudan spawn edilemez (ENOENT/EINVAL),
// o yüzden cmd.exe üstünden koşar (Ghidra headless deseniyle aynı).
// stdin ignore edilir ki launcher sonundaki `pause` EOF görüp beklemesin.
function apktoolKos(args: string[], sureMs = 180_000): { durum: number; cikti: string } {
  const r =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/c", "apktool", ...args], {
          encoding: "utf8",
          timeout: sureMs,
          maxBuffer: 16 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        })
      : spawnSync("apktool", args, {
          encoding: "utf8",
          timeout: sureMs,
          maxBuffer: 16 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        });
  return { durum: r.status ?? 1, cikti: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

// apktool launcher (bat/sh/wrapper) PATH'te mi?
// Not: doğru altkomut `version`dır (`-version` tanınmaz, usage basar).
function apktoolTamam(): boolean {
  try {
    return apktoolKos(["version"], 60_000).durum === 0;
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
  const { durum, cikti } = apktoolKos(args);
  if (durum !== 0) throw new Error(`apktool decode başarısız (kod=${durum}): ${cikti.trim().slice(-500)}`);
  return { ok: true as const, arac: "rea_apktool_decode", apk: apkYolu, ciktiDir };
}

// Ortam bilgisi: sürüm metni (launcher `pause` satırı ayıklanır, ilk dolu satır alınır).
export function rea_apktool_info() {
  const engel = kapi();
  if (engel) return engel;
  const { cikti } = apktoolKos(["version"], 60_000);
  const surum = cikti.split("\n").map((s) => s.trim()).find((s) => s.length > 0) ?? "";
  return { ok: true as const, arac: "rea_apktool_info", surum };
}

// aapt2 yolu: sabit kurulum önce, PATH yedeği sonra.
function aapt2Yolu(): string | null {
  if (existsSync(AAPT2_SABIT)) return AAPT2_SABIT;
  const r = spawnSync("aapt2", ["version"], {
    encoding: "utf8",
    timeout: 30_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return r.status === 0 ? "aapt2" : null;
}

// aapt2 çalışıyor mu? (build kapısı; yoksa capability_unsupported).
function aapt2Tamam(): boolean {
  return aapt2Yolu() !== null;
}

// aapt2 sürüm metni (sürüm stdout'a değil stderr'e yazılır, ikisi birleştirilir).
function aapt2Surum(): string | null {
  const yol = aapt2Yolu();
  if (!yol) return null;
  try {
    const r = spawnSync(yol, ["version"], {
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if ((r.status ?? 1) !== 0) return null;
    return `${r.stdout ?? ""}\n${r.stderr ?? ""}`.split("\n").map((s) => s.trim()).find((s) => s.length > 0) ?? null;
  } catch {
    return null;
  }
}

// Decode edilmiş projeyi yeniden paketle: `apktool b -o <ciktiApk> <projeDir>`.
// aapt2 yoksa derleme yapılamaz → capability_unsupported.
export function rea_apktool_build(projeDir: string, ciktiApk: string) {
  if (!projeDir || !ciktiApk) return { ok: false as const, code: "capability_unsupported", neden: "Proje dizini ve çıktı APK yolu gerekli" };
  const engel = kapi();
  if (engel) return engel;
  if (!aapt2Tamam()) return { ok: false as const, code: "capability_unsupported", neden: `aapt2 bulunamadı (${AAPT2_SABIT} yok, PATH'te de yok)` };
  if (!existsSync(projeDir)) return { ok: false as const, code: "capability_unsupported", neden: `Proje dizini yok: ${projeDir}` };
  const { durum, cikti } = apktoolKos(["b", "-o", ciktiApk, projeDir]);
  if (durum !== 0) throw new Error(`apktool build başarısız (kod=${durum}): ${cikti.trim().slice(-500)}`);
  return { ok: true as const, arac: "rea_apktool_build", proje: projeDir, ciktiApk };
}

// Framework APK kur: `apktool if <apkYolu>` (cihaz gerekmez, yalnız launcher + APK).
export function rea_apktool_framework(apkYolu: string) {
  if (!apkYolu) return { ok: false as const, code: "capability_unsupported", neden: "APK yolu boş" };
  const engel = kapi();
  if (engel) return engel;
  if (!existsSync(apkYolu)) return { ok: false as const, code: "capability_unsupported", neden: `APK yok: ${apkYolu}` };
  const { durum, cikti } = apktoolKos(["if", apkYolu]);
  if (durum !== 0) throw new Error(`apktool install-framework başarısız (kod=${durum}): ${cikti.trim().slice(-500)}`);
  return { ok: true as const, arac: "rea_apktool_framework", apk: apkYolu };
}

// Yetenek bilgisi: apktool + aapt2 gerçek sürümleri (ikisi de gerçekten çalıştırılır).
export function rea_apktool_caps() {
  const engel = kapi();
  if (engel) return engel;
  const { cikti } = apktoolKos(["version"], 60_000);
  const apktool = cikti.split("\n").map((s) => s.trim()).find((s) => s.length > 0) ?? "";
  const aapt2 = aapt2Surum();
  return { ok: true as const, arac: "rea_apktool_caps", apktool, aapt2, aapt2Tamam: aapt2 !== null };
}
