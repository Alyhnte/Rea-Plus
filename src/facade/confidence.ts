// facade/confidence.ts: hedef tip + motor -> 0-100 güven skoru (saf).
// Skorlar sabit tablodan gelir; bilinmeyen eşleşme düşük güvene düşer.

// Bilinen tip+motor güven tablosu (0-100).
const TABLO: Record<string, number> = {
  "apk+jadx": 95,
  "apk+apktool": 70,
  "elf+radare2": 90,
  "elf+ghidra": 85,
  "evm+keccak": 100,
  "wasm+wabt": 90,
  "firmware+binwalk": 80,
  "browser+playwright": 85,
};

// Tekil skor: bilinmiyor her zaman 10, tabloda yoksa 20.
export function scoreTarget(tip: string, motor: string): number {
  if (tip === "bilinmiyor") return 10;
  return TABLO[`${tip}+${motor}`] ?? 20;
}

// Adayları skora göre sıralayıp en iyisini döndürür (boşsa "").
export function bestMotor(tip: string, adaylar: string[]): string {
  return [...adaylar].sort((a, b) => scoreTarget(tip, b) - scoreTarget(tip, a))[0] ?? "";
}
