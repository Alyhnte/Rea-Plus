// ADB köprüsü: cihaz/paket listeleme iskeleti (uygulama çalıştırmaz).
import { execFileSync } from "node:child_process";

// Facade prefix kuralı: rea_ öneki zorunlu.
export const ADB_TOOLS = ["rea_adb_devices", "rea_adb_packages"] as const;

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
