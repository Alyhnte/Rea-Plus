// rea-domains/javascript: sürümler arası fonksiyon eşleme iskeleti (offline)
// İsim + imza benzerliği ile fonksiyonları eşler, harici diff lib yok.
export type ReaDiffResult =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string };

// Fonksiyon kaydı: ad + imza + gövde özeti (yer tutucu hash).
export interface FnRecord { name: string; sig: string; body: string }

// Kapı: iki sürüm listesi de boşsa eşleme yapılamaz.
function needLists(a: FnRecord[], b: FnRecord[]): ReaDiffResult | null {
  // Her iki tarafta da kayıt yoksa diff anlamsızdır.
  if ((!a || !a.length) && (!b || !b.length)) {
    return { ok: false, code: "capability_unsupported", reason: "fonksiyon listesi yok" };
  }
  return null;
}

// Jaccard benzerliği: token kümeleri üzerinden 0..1 skor.
function jaccard(x: string, y: string): number {
  // Gövdeyi boşluklara bölüp küme karşılaştırması yapar.
  const sx = new Set(x.split(/\s+/).filter(Boolean));
  const sy = new Set(y.split(/\s+/).filter(Boolean));
  if (!sx.size && !sy.size) return 1;
  let inter = 0;
  for (const t of sx) if (sy.has(t)) inter++;
  return inter / (sx.size + sy.size - inter || 1);
}

// Eşleme: ad+imza tam eşleşme, yoksa gövde benzerliği eşiği.
export function rea_diff_match(a: FnRecord[], b: FnRecord[], threshold = 0.6): ReaDiffResult {
  const gate = needLists(a, b);
  if (gate) return gate;
  // Eşik 0..1 dışında ise sonuçlar güvenilmez olur.
  if (threshold <= 0 || threshold > 1) return { ok: false, code: "capability_unsupported", reason: "eşik aralık dışı" };
  const matched: Array<{ from: string; to: string; score: number }> = [];
  for (const fa of a) {
    // Önce ad+imza tam eşleşme aranır (ucuz yol).
    const exact = b.find((fb) => fb.name === fa.name && fb.sig === fa.sig);
    if (exact) { matched.push({ from: fa.name, to: exact.name, score: 1 }); continue; }
    // Yoksa en yüksek Jaccard skorlu aday seçilir.
    let best: FnRecord | null = null; let bestS = 0;
    for (const fb of b) { const s = jaccard(fa.body, fb.body); if (s > bestS) { bestS = s; best = fb; } }
    if (best && bestS >= threshold) matched.push({ from: fa.name, to: best.name, score: bestS });
  }
  if (!matched.length) return { ok: false, code: "capability_unsupported", reason: "eşleşme yok" };
  return { ok: true, tool: "rea_diff_match", summary: `${matched.length} eşleşme`, details: { matched } };
}

// Özet: eklenen/silinen/değişen sayımı (ad bazında küme farkı).
export function rea_diff_summary(a: FnRecord[], b: FnRecord[]): ReaDiffResult {
  const gate = needLists(a, b);
  if (gate) return gate;
  // Ad kümeleri üzerinden eklenen/silinen hesaplanır.
  const sa = new Set(a.map((f) => f.name));
  const sb = new Set(b.map((f) => f.name));
  const added = [...sb].filter((n) => !sa.has(n)).length;
  const removed = [...sa].filter((n) => !sb.has(n)).length;
  return { ok: true, tool: "rea_diff_summary", summary: `+${added} -${removed}`, details: { added, removed } };
}
