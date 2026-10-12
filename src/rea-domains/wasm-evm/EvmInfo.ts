// EvmInfo: EvmTools disas üstüne istatistik + seçici adayı (offline, yürütme yok).
import { rea_evm_disasm } from "./EvmTools.js";
export type EvmBilgiSonuc =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string };
// Disas kapısını aşıp tip güvenli op listesi döndürür.
function coz(hex: string): { pc: number; opcode: string; ad: string; operand: string | null }[] | null {
  const r = rea_evm_disasm(hex) as unknown as { ok: boolean; detay?: { ops?: { pc: number; opcode: string; ad: string; operand: string | null }[] }; neden?: string };
  if (!r.ok || !r.detay?.ops) return null;
  return r.detay.ops;
}
// Opcode sayaçları + JUMPDEST tabanlı fonksiyon tahmini.
export function rea_evm_stats(hex: string): EvmBilgiSonuc {
  // Boş girdi disas'a gitmeden elenir.
  if (!hex) return { ok: false, code: "capability_unsupported", reason: "boş hex" };
  const ops = coz(hex);
  if (!ops) return { ok: false, code: "capability_unsupported", reason: "geçersiz hex" };
  // PUSH*/JUMP*/JUMPDEST sayaçları tek geçişte toplanır.
  let pushSayisi = 0; let jumpSayisi = 0; let jumpdest = 0;
  for (const o of ops) { if (o.ad.startsWith("PUSH")) pushSayisi++; else if (o.ad === "JUMP" || o.ad === "JUMPI") jumpSayisi++; else if (o.ad === "JUMPDEST") jumpdest++; }
  const opSayisi = ops.length;
  return { ok: true, tool: "rea_evm_stats", summary: `${opSayisi} op, ~${jumpdest} func`, details: { opSayisi, pushSayisi, jumpSayisi, tahminiFonksiyon: jumpdest } };
}
// Seçici adayı: JUMPDEST bloklarına böl, her bloktaki ilk PUSH operandını listele.
export function rea_evm_selectors(hex: string): EvmBilgiSonuc {
  // Boş girdi erken kapıdan döner.
  if (!hex) return { ok: false, code: "capability_unsupported", reason: "boş hex" };
  const ops = coz(hex);
  if (!ops) return { ok: false, code: "capability_unsupported", reason: "geçersiz hex" };
  // Blok sınırları: her JUMPDEST yeni blok başlatır (ilk op da blok başıdır).
  const bloklar: { pc: number; opcode: string; ad: string; operand: string | null }[][] = [[]];
  for (const o of ops) { if (o.ad === "JUMPDEST" && (bloklar[bloklar.length - 1] as { pc: number }[]).length) bloklar.push([]); (bloklar[bloklar.length - 1] as { pc: number; opcode: string; ad: string; operand: string | null }[]).push(o); }
  // Her bloktan ilk PUSH operandı aday olur (4-bayt avı yok, blok-başı kuralı).
  const ham: string[] = [];
  for (const b of bloklar) { const ilk = b.find((o) => o.ad.startsWith("PUSH") && o.operand); if (ilk?.operand) ham.push(ilk.operand); }
  // Sıra korunarak tekille.
  const adaylar = [...new Set(ham)];
  if (!adaylar.length) return { ok: false, code: "capability_unsupported", reason: "seçici adayı yok" };
  return { ok: true, tool: "rea_evm_selectors", summary: `${adaylar.length} aday`, details: { adaylar, blokSayisi: bloklar.length } };
}
