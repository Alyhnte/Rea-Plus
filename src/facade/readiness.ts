// readiness: kanıt hazırlık skoru + kapsama oranı (saf TS, yürütme yok).
// Hazır kuralı: fonksiyon>=1, problem=0, bilinmeyen<=2 ise hazır.
// Skor: 100 - cezalar (fonksiyon yoksa -60, problem başına -30, fazla bilinmeyen başına -10).
// Seviye: kural tutarsa hazir, tutmazsa skor>=50 kismi, altı eksik.
export type HazirlikSeviye = "hazir" | "kismi" | "eksik";
export type HazirlikSonuc =
  | { ok: true; arac: string; skor: number; seviye: HazirlikSeviye; eksik: string[] }
  | { ok: false; code: "capability_unsupported"; neden: string };
export type KapsamaSonuc =
  | { ok: true; arac: string; oran: number; kalan: number }
  | { ok: false; code: "capability_unsupported"; neden: string };
// Kapı sonucu: bozuk/boş girdi için tek tip hata (sahte skor yok).
function kapi(neden: string): HazirlikSonuc {
  return { ok: false, code: "capability_unsupported", neden };
}
// Kanıt sayıları: negatif ya da sayı-dışı değer elenir.
function sayiMi(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && Number.isInteger(v);
}
// Kanıt JSON'undan 0-100 skor + seviye + eksik listesi üretir.
export function rea_readiness(kanitJson: string): HazirlikSonuc {
  let k: unknown;
  try { k = JSON.parse(kanitJson); } catch { return kapi("geçersiz kanıt JSON"); }
  if (k === null || typeof k !== "object") return kapi("geçersiz kanıt JSON");
  const o = k as Record<string, unknown>;
  const f = o["fonksiyonlar"] ?? o["fonksiyon"];
  const p = o["problemler"] ?? o["problem"];
  const b = o["bilinmeyenler"] ?? o["bilinmeyen"];
  if (!sayiMi(f) || !sayiMi(p) || !sayiMi(b)) return kapi("kanıt sayıları gerekli (fonksiyonlar, problemler, bilinmeyenler)");
  let skor = 100;
  const eksik: string[] = [];
  if (f < 1) { skor -= 60; eksik.push("fonksiyon yok"); }
  if (p > 0) { skor -= Math.min(90, p * 30); eksik.push(`${p} problem var`); }
  if (b > 2) { skor -= (b - 2) * 10; eksik.push(`bilinmeyen fazla: ${b}`); }
  skor = Math.max(0, Math.min(100, skor));
  const hazir = f >= 1 && p === 0 && b <= 2;
  const seviye: HazirlikSeviye = hazir ? "hazir" : skor >= 50 ? "kismi" : "eksik";
  return { ok: true, arac: "rea_readiness", skor, seviye, eksik };
}
// Kapsama: incelenen/toplam oranı (0..1, iki ondalık) + kalan iş sayısı.
export function rea_coverage(incelenen: number, toplam: number): KapsamaSonuc {
  if (!Number.isInteger(incelenen) || !Number.isInteger(toplam)) return { ok: false, code: "capability_unsupported", neden: "tamsayı gerekli" };
  if (toplam <= 0 || incelenen < 0 || incelenen > toplam) return { ok: false, code: "capability_unsupported", neden: "aralık dışı (0<=incelenen<=toplam, toplam>0)" };
  const oran = Math.round((incelenen / toplam) * 100) / 100;
  return { ok: true, arac: "rea_coverage", oran, kalan: toplam - incelenen };
}
