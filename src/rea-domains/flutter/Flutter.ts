// rea-domains/flutter: Flutter/Dart ELF iz taraması (offline)
// ELF baytları node:fs ile okunur, Dart snapshot ve engine rev metin taramasıyla bulunur.
import { existsSync, readFileSync } from "node:fs";
export type ReaFlutterResult =
  | { ok: true; tool: string; summary: string; dartMi: boolean; tur: string; buildId: string | null; motor: string | null }
  | { ok: false; code: "capability_unsupported"; reason: string };
export type ReaFlutterPayload =
  | { ok: true; tool: string; summary: string; izler: string[] }
  | { ok: false; code: "capability_unsupported"; reason: string };
// Ortam kapısı: dosya yoksa ya da okunamazsa analiz yapılamaz.
function hamOku(yol: string): Buffer | null {
  // node:fs yokluğunda ya da silinmiş hedefte null döner.
  try { if (!existsSync(yol)) return null; return readFileSync(yol); }
  catch { return null; }
}
// Ham metin: baytları latin1'e çevirip string araması yapılır.
function metin(buf: Buffer): string { return buf.toString("latin1"); }
// Build-id: .note.gnu.build-id çevresindeki GNU notundan hex çıkarır.
function buildIdBul(buf: Buffer, txt: string): string | null {
  // Önce metinsel "GNU" işaretini ara, ardından gelen baytları hexle.
  const i = txt.indexOf("GNU");
  if (i < 0 || i + 8 >= buf.length) return null;
  // Not verisi genelde 16-20 bayt; 16 bayt hex yeterlidir.
  return buf.subarray(i + 4, i + 20).toString("hex");
}
// Motor rev: "flutter/" yolundan sonraki rev/hash parçasını alır.
function motorBul(txt: string): string | null {
  // Örn: flutter/abc123def... ya da .../flutter/engine_rev
  const m = txt.match(/flutter\/[A-Za-z0-9_.\-]{4,64}/);
  return m ? m[0] : null;
}
// ELF + Dart taraması: snapshot türü, libapp/libflutter ayrımı, build-id, motor.
export function rea_flutter_scan(yol: string): ReaFlutterResult {
  const buf = hamOku(yol);
  // Dosya yoksa ya da okunamazsa kapıdan geçemez.
  if (!buf) return { ok: false, code: "capability_unsupported", reason: `dosya yok/okunamadı: ${yol}` };
  // ELF sihri (7F 45 4C 46) yoksa Flutter ELF analizi yapılamaz.
  if (buf.length < 64 || buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46)
    return { ok: false, code: "capability_unsupported", reason: "ELF imzası yok/çok kısa" };
  const txt = metin(buf);
  // Snapshot sinyalleri: VM ve isolate veri sembolleri Dart kanıtıdır.
  const vm = txt.includes("kDartVmSnapshotData");
  const iso = txt.includes("kDartIsolateSnapshotData");
  const dartMi = vm || iso || txt.includes("Dart_") || txt.includes("libflutter");
  // Dart izi yoksa Flutter olarak raporlanamaz.
  if (!dartMi) return { ok: false, code: "capability_unsupported", reason: "Dart izi yok" };
  // Tür: yol adı + içerik birlikte libapp/libflutter ayrımı yapar.
  const tur = yol.includes("libapp.so") || txt.includes("libapp.so") ? "libapp.so"
    : yol.includes("libflutter") || txt.includes("libflutter.so") ? "libflutter.so"
    : vm && iso ? "vm+isolate" : vm ? "vm" : iso ? "isolate" : "dart-iz";
  const buildId = txt.includes("build-id") || txt.includes("GNU") ? buildIdBul(buf, txt) : null;
  const motor = motorBul(txt);
  return { ok: true, tool: "rea_flutter_scan", summary: `dart tur=${tur}`, dartMi: true, tur, buildId, motor };
}
// Yük izleri: bilinen Dart/Flutter stringlerinin bulunan alt kümesi.
export function rea_flutter_payload(yol: string): ReaFlutterPayload {
  const buf = hamOku(yol);
  // Dosya yoksa iz listesi çıkarılamaz.
  if (!buf) return { ok: false, code: "capability_unsupported", reason: `dosya yok/okunamadı: ${yol}` };
  if (buf.length < 16) return { ok: false, code: "capability_unsupported", reason: "dosya çok kısa" };
  const txt = metin(buf);
  // Aday izler: snapshot sembolleri, engine yolu, so adları, build-id.
  const aday = ["kDartVmSnapshotData", "kDartIsolateSnapshotData", "Dart_", "flutter/", "libflutter.so", "libapp.so", "build-id", ".note.gnu.build-id"];
  const izler = aday.filter((a) => txt.includes(a));
  // flutter/<rev> gibi dinamik yolu da ekle.
  const motor = motorBul(txt);
  if (motor && !izler.includes(motor)) izler.push(motor);
  // Hiç iz yoksa kapı dışıdır.
  if (izler.length === 0) return { ok: false, code: "capability_unsupported", reason: "Flutter izi yok" };
  return { ok: true, tool: "rea_flutter_payload", summary: `${izler.length} iz`, izler };
}
