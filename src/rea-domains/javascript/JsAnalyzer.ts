// rea-domains/javascript: JS bundle + source-map iskeleti
// Offline çalışır, harici source-map lib yoksa capability döner.
export type ReaJsResult =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string };

function needNode(): ReaJsResult | null {
  // Env kontrolü: Node dışı runtime'da çalışmaz.
  if (typeof process === "undefined" || !process.version) {
    return { ok: false, code: "capability_unsupported", reason: "node runtime yok" };
  }
  return null;
}

// Source-map çözümleme: mappings sayımı + kaynak listesi (iskelet).
export function rea_js_sourcemap(mapText: string): ReaJsResult {
  const env = needNode();
  if (env) return env;
  try {
    const map = JSON.parse(mapText) as { sources?: string[]; mappings?: string };
    const sources = map.sources ?? [];
    // Gerçek VLQ decode WP4d'de eklenecek, şimdilik uzunluk sinyali.
    const size = (map.mappings ?? "").length;
    return { ok: true, tool: "rea_js_sourcemap", summary: `${sources.length} kaynak, ${size} mappings char` };
  } catch {
    return { ok: false, code: "capability_unsupported", reason: "source-map parse edilemedi" };
  }
}

// Bundle diff: iki bundle metni satır bazında karşılaştırır.
export function compare_source_to_bundle(a: string, b: string): ReaJsResult {
  const env = needNode();
  if (env) return env;
  const la = a.split("\n");
  const lb = b.split("\n");
  // Ucuz LCS yerine satır kümesi farkı (iskelet, hızlı).
  const setB = new Set(lb);
  const onlyA = la.filter((l) => !setB.has(l)).length;
  const setA = new Set(la);
  const onlyB = lb.filter((l) => !setA.has(l)).length;
  return { ok: true, tool: "rea_js_bundle_diff", summary: `onlyA=${onlyA} onlyB=${onlyB}`, details: { onlyA, onlyB } };
}

// Tek giriş: bundle + opsiyonel map ile özet çıkarır.
export function rea_js_bundle(bundle: string, mapText?: string): ReaJsResult {
  if (!bundle) return { ok: false, code: "capability_unsupported", reason: "boş bundle" };
  if (mapText) return rea_js_sourcemap(mapText);
  return { ok: true, tool: "rea_js_bundle", summary: `${bundle.length} char bundle (map yok)` };
}
