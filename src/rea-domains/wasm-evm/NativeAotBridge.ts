// rea-domains/wasm-evm: NativeAOT PE + Swift/ObjC dispatch iskeleti (offline)
// CLR başlığı ve ObjC/Swift selector metni saf TS ile taranır.
export type ReaAotResult =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string };

// Ortam kapısı: PE baytı + metin segmenti gerekir.
function needPe(buf: Uint8Array): ReaAotResult | null {
  // Çok kısa girdi PE taraması için yetersizdir.
  if (!buf || buf.length < 128) {
    return { ok: false, code: "capability_unsupported", reason: "PE baytı yok/çok kısa" };
  }
  // MZ imzası yoksa yönetilen/native ayrımı yapılamaz.
  if (buf[0] !== 0x4d || buf[1] !== 0x5a) {
    return { ok: false, code: "capability_unsupported", reason: "MZ imzası yok" };
  }
  return null;
}

// NativeAOT tespiti: "RTR_" / "S_P_CoreLib" yer tutucu dizgileri arar.
export function rea_aot_detect(buf: Uint8Array, text: string): ReaAotResult {
  const gate = needPe(buf);
  if (gate) return gate;
  // Gerçek CLR header parse WP4d'de; iskelet dizi sinyali kullanır.
  const marks = ["RTR_", "S_P_CoreLib", "NativeAOT", "__managed"];
  const hit = marks.filter((m) => text.includes(m));
  if (!hit.length) return { ok: false, code: "capability_unsupported", reason: "AOT sinyali yok" };
  return { ok: true, tool: "rea_aot_detect", summary: `AOT adayı: ${hit.join(",")}`, details: { hit } };
}

// ObjC selector taraması: "+ [...]"/"- [...]" kalıplarını sayar.
export function rea_aot_objc(text: string): ReaAotResult {
  // Boş metinde dispatch tablosu aranamaz.
  if (!text) return { ok: false, code: "capability_unsupported", reason: "metin boş" };
  // Köşeli parantezli çağrılar ObjC msgSend sinyalidir.
  const re = /[+-]\s*\[[^\]]+\]/g;
  const found = text.match(re) ?? [];
  if (!found.length) return { ok: false, code: "capability_unsupported", reason: "ObjC selector yok" };
  return { ok: true, tool: "rea_aot_objc", summary: `${found.length} ObjC selector`, details: { sample: found.slice(0, 5) } };
}

// Swift dispatch taraması: "$s" mangled prefix + "dispatch" anahtarı.
export function rea_aot_swift(text: string): ReaAotResult {
  // Boş metinde Swift sembolü aranamaz.
  if (!text) return { ok: false, code: "capability_unsupported", reason: "metin boş" };
  // $s prefix Swift mangling sinyalidir (iskelet sayımı).
  const mangled = (text.match(/\$s[A-Za-z0-9_]+/g) ?? []).length;
  if (!mangled) return { ok: false, code: "capability_unsupported", reason: "Swift sembolü yok" };
  return { ok: true, tool: "rea_aot_swift", summary: `${mangled} Swift sembolü`, details: { mangled } };
}

// Tek giriş: PE + metin ile AOT/ObjC/Swift özetini birleştirir.
export function rea_aot_profile(buf: Uint8Array, text: string): ReaAotResult {
  const aot = rea_aot_detect(buf, text);
  const objc = rea_aot_objc(text);
  const swift = rea_aot_swift(text);
  // Üçü de kapalıysa profil çıkarılamaz.
  if (!aot.ok && !objc.ok && !swift.ok) return { ok: false, code: "capability_unsupported", reason: "AOT/ObjC/Swift sinyali yok" };
  return { ok: true, tool: "rea_aot_profile", summary: "AOT dispatch profil iskeleti", details: { aot, objc, swift } };
}
