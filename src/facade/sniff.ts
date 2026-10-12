// facade/sniff.ts: sihirli bayt -> hedef tip + önerilen motor.
// İlk 4KB okunur; saf karar sniffBytes içindedir.
import { readFileSync } from "node:fs";
import type { ReaPlusEngine } from "./sessionRouter.js";

// sniffBytes ile aynı küme: dosya türü belirteci.
export type SniffTip = "elf" | "apk" | "dex" | "wasm" | "pe" | "macho" | "bilinmiyor";

// Tanı sonucu: tür + bu türe en uygun motor önerisi.
export interface SniffSonuc { tip: SniffTip; motor: ReaPlusEngine; }

// Tür bilinmeyince güvenli varsayılan: statik analiz motoru.
const VARSAYILAN: SniffSonuc = { tip: "bilinmiyor", motor: "radare2" };

// Saf imza eşleştirme: ELF, DEX, WASM, ZIP/APK, MZ/PE, Mach-O.
export function sniffBytes(buf: Uint8Array): SniffSonuc {
  const imza = [...buf.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (imza.startsWith("7f454c46")) return { tip: "elf", motor: "radare2" }; // ELF
  if (imza.startsWith("6465780a")) return { tip: "dex", motor: "jadx" }; // DEX ("dex\n")
  if (imza.startsWith("0061736d")) return { tip: "wasm", motor: "wasm" }; // WASM
  if (imza.startsWith("504b0304")) return { tip: "apk", motor: "jadx" }; // ZIP/APK/JAR
  if (imza.startsWith("4d5a")) return { tip: "pe", motor: "x64dbg" }; // MZ/PE
  if (imza === "feedfacf" || imza === "cefaedfe" || imza === "cafebabe") return { tip: "macho", motor: "hopper" };
  return { ...VARSAYILAN }; // tanınmayan imza
}

// Dosyadan ilk 4KB okur; yoksa/okunamazsa bilinmiyor döner (kapı kodu yok).
export function sniffFile(yol: string): SniffSonuc {
  try {
    return sniffBytes(readFileSync(yol).subarray(0, 4096));
  } catch {
    return { ...VARSAYILAN };
  }
}
