// rea-domains/flutter: Flutter/Dart ELF iz taraması (offline)
// ELF baytları node:fs ile okunur, Dart snapshot ve engine rev metin taramasıyla bulunur.
import { existsSync, readFileSync, mkdtempSync, readdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
export type ReaFlutterResult =
  | { ok: true; tool: string; summary: string; dartMi: boolean; tur: string; buildId: string | null; motor: string | null }
  | { ok: false; code: "capability_unsupported"; reason: string };
export type ReaFlutterPayload =
  | { ok: true; tool: string; summary: string; izler: string[] }
  | { ok: false; code: "capability_unsupported"; reason: string };
export type ReaFlutterSnapshot =
  | { ok: true; tool: string; summary: string; dartMi: boolean; tur: string; magic: string[]; izolasyon: { vm: boolean; isolate: boolean; talimat: boolean }; dartSurumu: string | null }
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

// --- Dart AOT derinliği: snapshot magic + izolasyon bilgisi (saf TS, yürütme yok) ---
// Magic: kDartVm/IsolateSnapshot(Data|Instructions) sembol dörtlüsü.
const DART_MAGIC = ["kDartVmSnapshotData", "kDartVmSnapshotInstructions", "kDartIsolateSnapshotData", "kDartIsolateSnapshotInstructions"];
// Dış araç kapısı: önce env yolu, yoksa PATH (where/which). Çalıştırma yok, yalnız konum.
function flutterAracBul(envAd: string, adaylar: string[]): string | null {
  const ozel = process.env[envAd];
  if (ozel) return existsSync(ozel) ? ozel : null;
  const prob = process.platform === "win32" ? "where" : "which";
  for (const bin of adaylar) {
    try {
      const r = spawnSync(prob, [bin], { stdio: "ignore", timeout: 5000 });
      if (r.status === 0) return bin;
    } catch { /* sonraki aday */ }
  }
  return null;
}
// Snapshot profili: magic alt kümesi + vm/isolate ayrımı + Dart sürüm dizesi.
export function rea_flutter_snapshot(yol: string): ReaFlutterSnapshot {
  const buf = hamOku(yol);
  if (!buf) return { ok: false, code: "capability_unsupported", reason: `dosya yok/okunamadı: ${yol}` };
  if (buf.length < 64 || buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46)
    return { ok: false, code: "capability_unsupported", reason: "ELF imzası yok/çok kısa" };
  const txt = metin(buf);
  const magic = DART_MAGIC.filter((m) => txt.includes(m));
  const vm = txt.includes("kDartVmSnapshotData") || txt.includes("kDartVmSnapshotInstructions");
  const isolate = txt.includes("kDartIsolateSnapshotData") || txt.includes("kDartIsolateSnapshotInstructions");
  // Snapshot sembolü yoksa Dart AOT profili çıkarılamaz.
  if (!vm && !isolate) return { ok: false, code: "capability_unsupported", reason: "Dart snapshot izi yok" };
  const tur = vm && isolate ? "vm+isolate" : vm ? "vm" : "isolate";
  const dartSurumu = txt.match(/Dart (?:VM )?version[: ]+([0-9][\w.+-]*)/)?.[1] ?? null;
  const izolasyon = { vm, isolate, talimat: txt.includes("Instructions") };
  return { ok: true, tool: "rea_flutter_snapshot", summary: `dart snapshot tur=${tur} magic=${magic.length}`, dartMi: true, tur, magic, izolasyon, dartSurumu };
}
// blutter: araç yoksa dürüst kapı + kurulum ipucu; varsa timeout'lu gerçek çağrı.
export function rea_flutter_blutter(yol: string): ReaFlutterPayload {
  const buf = hamOku(yol);
  if (!buf) return { ok: false, code: "capability_unsupported", reason: `dosya yok/okunamadı: ${yol}` };
  const txt = metin(buf);
  const dartMi = DART_MAGIC.some((m) => txt.includes(m)) || txt.includes("Dart_") || txt.includes("libflutter");
  if (!dartMi) return { ok: false, code: "capability_unsupported", reason: "Flutter izi yok" };
  const arac = flutterAracBul("REA_BLUTTER_BIN", ["blutter"]);
  if (!arac) return { ok: false, code: "capability_unsupported", reason: "blutter yok (kurulum: https://github.com/worawit/blutter ; bulunan exe yolunu REA_BLUTTER_BIN ile ver)" };
  const cikti = mkdtempSync(join(tmpdir(), "blutter-"));
  try {
    const log = execFileSync(arac, [yol, cikti], { encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    const dosyalar = readdirSync(cikti);
    return { ok: true, tool: "rea_flutter_blutter", summary: `${dosyalar.length} blutter çıktısı`, izler: dosyalar.slice(0, 50).concat([String(log).slice(-500)]) };
  } catch (e) {
    return { ok: false, code: "capability_unsupported", reason: `blutter çalışmadı: ${(e as Error)?.message ?? e}` };
  }
}
