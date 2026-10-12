// ADB köprüsü: cihaz/paket listeleme + kurulum/logcat/screencap (gerçek exec, uygulama çalıştırmaz).
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

// Facade prefix kuralı: rea_ öneki zorunlu.
export const ADB_TOOLS = [
  "rea_adb_devices",
  "rea_adb_packages",
  "rea_adb_install",
  "rea_adb_logcat",
  "rea_adb_screencap",
] as const;

// adb platform-tools PATH'te mi?
// Yoksa kurulum URL'si catalogMerge.ts'teki prerequisites ile aynıdır.
function adbTamam(): boolean {
  try {
    execFileSync("adb", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Cihaz bağlı mı? (server başlatmadan liste okur).
export function rea_adb_devices() {
  if (!adbTamam()) return { ok: false as const, code: "capability_unsupported", neden: "adb PATH'te yok (platform-tools kurulu değil)" };
  const out = execFileSync("adb", ["devices", "-l"], { stdio: ["ignore", "pipe", "ignore"] }).toString();
  const satirlar = out.split("\n").slice(1).map((s) => s.trim()).filter(Boolean);
  const cihazlar = satirlar.filter((s) => s.includes("device")).map((s) => s.split(/\s+/)[0]);
  return { ok: true as const, arac: "rea_adb_devices", cihazlar };
}

// Yüklü paketleri listele (çalıştırmadan, sadece pm list).
export function rea_adb_packages(seri?: string, filtre?: string) {
  if (!adbTamam()) return { ok: false as const, code: "capability_unsupported", neden: "adb PATH'te yok (platform-tools kurulu değil)" };
  const args = seri ? ["-s", seri, "shell", "pm", "list", "packages"] : ["shell", "pm", "list", "packages"];
  if (filtre) args.push(filtre);
  try {
    const out = execFileSync("adb", args, { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const paketler = out.split("\n").map((s) => s.replace("package:", "").trim()).filter(Boolean).slice(0, 500);
    return { ok: true as const, arac: "rea_adb_packages", paketler };
  } catch {
    // Cihaz yetkisiz/offline ise çalıştırma, hata dön.
    return { ok: false as const, code: "capability_unsupported", neden: "Cihaz erişilemez (yetkisiz/offline olabilir)" };
  }
}

// Bağlı cihaz serileri; null = `adb devices` çalışmadı.
// (devices() listeleme amaçlıdır; bu yardımcı kapı kararı içindir, durumu `device` olanlar alınır.)
function bagliCihazlar(): string[] | null {
  try {
    const out = execFileSync("adb", ["devices"], { stdio: ["ignore", "pipe", "ignore"] }).toString();
    return out
      .split("\n")
      .slice(1)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => s.split(/\s+/)[1] === "device")
      .map((s) => s.split(/\s+/)[0]);
  } catch {
    return null;
  }
}

// Cihaz kapısı: adb yoksa ya da hedef cihaz bağlı değilse capability_unsupported (çalıştırma yok).
function cihazKapi(seri?: string) {
  if (!adbTamam()) return { ok: false as const, code: "capability_unsupported", neden: "adb PATH'te yok (platform-tools kurulu değil)" };
  const cihazlar = bagliCihazlar();
  if (cihazlar === null) return { ok: false as const, code: "capability_unsupported", neden: "adb devices çalışmadı" };
  if (seri && !cihazlar.includes(seri)) return { ok: false as const, code: "capability_unsupported", neden: `Cihaz bağlı değil: ${seri}` };
  if (!seri && cihazlar.length === 0) return { ok: false as const, code: "capability_unsupported", neden: "Bağlı cihaz yok (adb devices boş)" };
  return null;
}

// APK kur: `adb install -r` (cihaz şart, cihaz yoksa unsupported).
export function rea_adb_install(apkYolu: string, seri?: string) {
  if (!apkYolu) return { ok: false as const, code: "capability_unsupported", neden: "APK yolu boş" };
  const engel = cihazKapi(seri);
  if (engel) return engel;
  if (!existsSync(apkYolu)) return { ok: false as const, code: "capability_unsupported", neden: `APK yok: ${apkYolu}` };
  const args = seri ? ["-s", seri, "install", "-r", apkYolu] : ["install", "-r", apkYolu];
  const out = execFileSync("adb", args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
  return { ok: true as const, arac: "rea_adb_install", apk: apkYolu, sonuc: out.trim().slice(-500) };
}

// Logcat dökümü: `adb logcat -d -v brief` (baştan `satir` satır, head).
export function rea_adb_logcat(seri?: string, satir = 200) {
  const engel = cihazKapi(seri);
  if (engel) return engel;
  const args = seri ? ["-s", seri, "logcat", "-d", "-v", "brief"] : ["logcat", "-d", "-v", "brief"];
  const out = execFileSync("adb", args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 }).toString();
  const tum = out.split("\n");
  const satirlar = tum.slice(0, Math.max(1, satir));
  return { ok: true as const, arac: "rea_adb_logcat", satirlar, toplam_satir: tum.length };
}

// Ekran görüntüsü: `adb exec-out screencap -p` çıktısı PNG olarak dosyaya yazılır.
export function rea_adb_screencap(seri?: string, cikti = "") {
  if (!cikti) return { ok: false as const, code: "capability_unsupported", neden: "Çıktı yolu boş" };
  const engel = cihazKapi(seri);
  if (engel) return engel;
  const args = seri ? ["-s", seri, "exec-out", "screencap", "-p"] : ["exec-out", "screencap", "-p"];
  const buf = execFileSync("adb", args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(cikti, buf);
  return { ok: true as const, arac: "rea_adb_screencap", yol: cikti, bayt: buf.length };
}
