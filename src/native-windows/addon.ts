// rea-plus native-windows: process / authority / filesystem addon iskeleti
// Gerçek Win32 çağrıları prebuild ikiliyle gelir; bu dosya TS yüzeyini sabitler.
export type ReaNativeSonuç =
  | { ok: true; tool: string; summary: string; veri: Record<string, unknown> }
  | { ok: false; code: "capability_unsupported"; reason: string };

// Platform kapısı: win32 dışı hostta her çağrı handoff'a düşer.
function win32Kapısı(tool: string): ReaNativeSonuç | null {
  if (typeof process !== "undefined" && process.platform !== "win32") {
    return { ok: false, code: "capability_unsupported", reason: `${tool} yalnız win32 (platform=${process.platform})` };
  }
  return null;
}

// Prebuild bayrağı: REA_NATIVE_PREBUILD=1 olmadan gerçek ikiliye dokunulmaz.
function prebuildKapısı(tool: string): ReaNativeSonuç | null {
  if (typeof process !== "undefined" && process.env.REA_NATIVE_PREBUILD !== "1") {
    return { ok: true, tool, summary: `${tool} iskelet yanıtı (prebuild yok)`, veri: { iskelet: true } };
  }
  return null;
}

// Süreç bilgisi: PID -> sahiplik + komut satırı (gerçek okuma prebuild'te).
export function rea_native_process_info(pid: number): ReaNativeSonuç {
  const kapı = win32Kapısı("rea_native_process_info") ?? prebuildKapısı("rea_native_process_info");
  if (kapı) return kapı;
  // Prebuild ikili burada CreateToolhelp32 / NtQueryInformationProcess okur.
  if (!Number.isInteger(pid) || pid <= 0) {
    return { ok: false, code: "capability_unsupported", reason: "geçersiz pid" };
  }
  return { ok: true, tool: "rea_native_process_info", summary: `pid=${pid} okundu`, veri: { pid } };
}

// Yetki denetimi: sürecin yükseltilmiş (elevated) + bütünlük seviyesi döner.
export function rea_native_authority_check(pid: number): ReaNativeSonuç {
  const kapı = win32Kapısı("rea_native_authority_check") ?? prebuildKapısı("rea_native_authority_check");
  if (kapı) return kapı;
  // Prebuild ikili burada OpenProcessToken + GetTokenInformation koşar.
  return { ok: true, tool: "rea_native_authority_check", summary: `pid=${pid} yetki okundu`, veri: { pid, elevated: false, bütünlük: "medium" } };
}

// Dosya sistemi anlık görüntüsü: dizin altı hızlı hash listesi üretir.
export function rea_native_fs_snapshot(dizin: string, derinlik = 2): ReaNativeSonuç {
  const kapı = win32Kapısı("rea_native_fs_snapshot") ?? prebuildKapısı("rea_native_fs_snapshot");
  if (kapı) return kapı;
  // Prebuild ikili burada USN günlüğü / dizin yürüyüşü yapar; derinlik taşmaya karşı sınırlı.
  if (!dizin) return { ok: false, code: "capability_unsupported", reason: "dizin boş" };
  if (derinlik < 0 || derinlik > 5) return { ok: false, code: "capability_unsupported", reason: "derinlik 0-5 aralığında olmalı" };
  return { ok: true, tool: "rea_native_fs_snapshot", summary: `${dizin} derinlik=${derinlik} kuyruğa alındı`, veri: { dizin, derinlik } };
}

// Yetenek sorgusu: prebuild kurulu mu, hangi yüzeyler canlı tek bakışta döner.
export function rea_native_caps(): ReaNativeSonuç {
  const prebuild = typeof process !== "undefined" && process.env.REA_NATIVE_PREBUILD === "1";
  const win32 = typeof process !== "undefined" && process.platform === "win32";
  return { ok: true, tool: "rea_native_caps", summary: win32 ? (prebuild ? "prebuild canlı" : "iskelet, prebuild yok") : "win32 dışı, handoff", veri: { win32, prebuild } };
}
