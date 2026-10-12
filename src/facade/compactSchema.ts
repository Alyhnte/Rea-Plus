// rea-plus facade: kompakt girdi profili (compact schema)
// MCP girdi şemaları 13KB altında tutulur; profil bayrağı tek kaynaktan okunur.
export const REA_MCP_INPUT_SCHEMA_PROFILE = "compact" as const;

// Bütçe: tek tool girdisi (JSON) bu bayt sayısını aşamaz.
export const COMPACT_INPUT_BUDGET_BYTES = 13 * 1024;

// Profil çıktısı: kısaltılan alanlar adlarıyla raporlanır.
export interface CompactProfile {
  profile: typeof REA_MCP_INPUT_SCHEMA_PROFILE;
  bytes: number;
  budget: number;
  kırpılan: string[];
  girdi: Record<string, unknown>;
}

// Bayt ölçümü: Buffer ile UTF-8 uzunluğu alınır, tahminle değil ölçümle gidilir.
export function measureInputBytes(girdi: Record<string, unknown>): number {
  return Buffer.byteLength(JSON.stringify(girdi), "utf8");
}

// Bütçe kapısı: aşım varsa hata verir, çağıran toCompactProfile() ile kırpar.
export function assertCompactInput(girdi: Record<string, unknown>, budget = COMPACT_INPUT_BUDGET_BYTES): void {
  const bytes = measureInputBytes(girdi);
  // Sınır sert: sessiz kırpma yok, karar çağırana aittir.
  if (bytes > budget) throw new Error(`compact profil aşıldı: ${bytes} > ${budget} bayt`);
}

// Kompaktlaştırma: uzun string alanlar kuyruktan kırpılır, kırpılan adları listelenir.
export function toCompactProfile(girdi: Record<string, unknown>, budget = COMPACT_INPUT_BUDGET_BYTES): CompactProfile {
  // Anahtar sırası korunur; yalnız string değerler kısaltılır.
  const out: Record<string, unknown> = { ...girdi };
  const kırpılan: string[] = [];
  let bytes = measureInputBytes(out);
  for (const key of Object.keys(out)) {
    if (bytes <= budget) break;
    const v = out[key];
    if (typeof v === "string" && v.length > 256) {
      // Baştan 256 karakter tutulur, sonuna kırpma işareti eklenir.
      out[key] = v.slice(0, 256) + "…[kırpıldı]";
      kırpılan.push(key);
      bytes = measureInputBytes(out);
    }
  }
  return { profile: REA_MCP_INPUT_SCHEMA_PROFILE, bytes, budget, kırpılan, girdi: out };
}

// Profil özeti: log satırına tek cümlelik bütçe durumu düşer.
export function describeCompactProfile(p: CompactProfile): string {
  if (p.kırpılan.length === 0) return `compact: ${p.bytes}/${p.budget} bayt, kırpma yok`;
  return `compact: ${p.bytes}/${p.budget} bayt, kırpılan: ${p.kırpılan.join(", ")}`;
}

// Ortam bayrağı: REA_MCP_INPUT_SCHEMA_PROFILE yalnız "compact" değerini kabul eder.
export function resolveInputSchemaProfile(env?: string): typeof REA_MCP_INPUT_SCHEMA_PROFILE {
  const v = env ?? (typeof process !== "undefined" ? process.env.REA_MCP_INPUT_SCHEMA_PROFILE : undefined);
  // Yanlış değer erken patlar; sessiz varsayılan şema kaymasına izin yok.
  if (v !== undefined && v !== "compact") throw new Error(`desteklenmeyen profil: ${v}`);
  return REA_MCP_INPUT_SCHEMA_PROFILE;
}
