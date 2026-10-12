// rea-domains/javascript: pseudocode->C harness iskeleti (3205 case hedefli)
// Decompiler çıktısını derlenebilir C taslağına çevirir, offline çalışır.
export type ReaReconResult =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string };

// Case hedefi: 3205 numaralı soruşturma vakası varsayılan bağlamdır.
export const RECON_CASE = "3205";

// Kapı: pseudocode metni boşsa harness üretilemez.
function needPseudo(pseudo: string): ReaReconResult | null {
  // En az bir fonksiyon gövdesi sinyali aranır.
  if (!pseudo || pseudo.trim().length < 16) {
    return { ok: false, code: "capability_unsupported", reason: "pseudocode yok/çok kısa" };
  }
  return null;
}

// Fonksiyon iskeleti çıkarma: "sub_XXXX" ve "function name" kalıpları.
export function rea_recon_funcs(pseudo: string): ReaReconResult {
  const gate = needPseudo(pseudo);
  if (gate) return gate;
  // sub_ + function anahtarları decompiler çıktısının tipik sinyalidir.
  const subs = pseudo.match(/sub_[0-9A-Fa-f]+/g) ?? [];
  const fns = pseudo.match(/function\s+([A-Za-z0-9_]+)/g) ?? [];
  const total = subs.length + fns.length;
  if (!total) return { ok: false, code: "capability_unsupported", reason: "fonksiyon sinyali yok" };
  return { ok: true, tool: "rea_recon_funcs", summary: `${total} fonksiyon adayı`, details: { subs: subs.slice(0, 10), fns: fns.slice(0, 10) } };
}

// C harness üretimi: bulunan adları extern prototiplere çevirir.
export function rea_recon_harness(pseudo: string, caseId = RECON_CASE): ReaReconResult {
  const gate = needPseudo(pseudo);
  if (gate) return gate;
  // Case kimliği boş olamaz; vaka takibi için zorunludur.
  if (!caseId) return { ok: false, code: "capability_unsupported", reason: "case kimliği yok" };
  const found = rea_recon_funcs(pseudo);
  if (!found.ok) return found;
  // Üretilen taslak derlenebilirlik iddiası taşımaz (iskelet).
  const names = [...(pseudo.match(/sub_[0-9A-Fa-f]+/g) ?? [])].slice(0, 20);
  const lines = [`/* case ${caseId} harness iskeleti (derlenebilirlik garantisi yok) */`, "#include <stdio.h>", ...names.map((n) => `void ${n}(void);`), "int main(void){puts(\"recon\");return 0;}"];
  return { ok: true, tool: "rea_recon_harness", summary: `${names.length} prototipli harness`, details: { caseId, harness: lines.join("\n") } };
}

// Vaka etiketi: harness çıktısını 3205 şemasına uygun etiketler.
export function rea_recon_tag(caseId = RECON_CASE, note?: string): ReaReconResult {
  // Bilinmeyen case kimliği etiketlenemez.
  if (!caseId) return { ok: false, code: "capability_unsupported", reason: "case kimliği yok" };
  return { ok: true, tool: "rea_recon_tag", summary: `case ${caseId} etiketlendi`, details: { caseId, note: note ?? "" } };
}
