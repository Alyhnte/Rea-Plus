// rea-domains/behavior: davranış timeline (saf fonksiyon, exec yok)
// Kaynak önceliğine dizer; ilk/son, kaynak sayıları, top-5 api özeti üretir.
export type DavranışOlay = { kaynak: string; zaman: number | string; detay: string };
// Başarıda sıralı liste + özet, kapıda capability_unsupported (exec asla yok).
export type ReaTimelineSonuç =
  | { ok: true; tool: string; summary: string; details: { sıralı: DavranışOlay[]; sayılar: Record<string, number>; top_api: { ad: string; n: number }[]; ilk: string; son: string } }
  | { ok: false; code: "capability_unsupported"; reason: string };
// Sabit kaynak önceliği: api önce, process sonda; bilinmeyen en sona.
const SIRA = ["api", "syscall", "net", "dosya", "process"];
const sıraNo = (k: string): number => { const i = SIRA.indexOf(k); return i < 0 ? SIRA.length : i; };
// Zaman karşılaştırma: sayı ya da ISO metin; bozuksa 0 sayılır.
const zamanNo = (z: number | string): number => { const n = typeof z === "number" ? z : Date.parse(z); return Number.isFinite(n) ? n : 0; };
// Timeline kur: kapı + deterministik sıralama + özet (girdiyi değiştirmez).
export function rea_behavior_timeline(olaylarJson: DavranışOlay[]): ReaTimelineSonuç {
  if (!Array.isArray(olaylarJson) || olaylarJson.length === 0) return { ok: false, code: "capability_unsupported", reason: "olay listesi boş" };
  for (const o of olaylarJson) if (!o || !o.kaynak || o.zaman === undefined || !o.detay) return { ok: false, code: "capability_unsupported", reason: "eksik alan (kaynak/zaman/detay gerekli)" };
  const sıralı = [...olaylarJson].sort((a, b) => sıraNo(a.kaynak) - sıraNo(b.kaynak) || zamanNo(a.zaman) - zamanNo(b.zaman) || a.detay.localeCompare(b.detay));
  const sayılar: Record<string, number> = {}; // Kaynak başına adet.
  for (const o of sıralı) sayılar[o.kaynak] = (sayılar[o.kaynak] ?? 0) + 1;
  const frek = new Map<string, number>(); // api detay frekansı.
  for (const o of sıralı) if (o.kaynak === "api") frek.set(o.detay, (frek.get(o.detay) ?? 0) + 1);
  const top_api = [...frek].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([ad, n]) => ({ ad, n }));
  const ilk = `${sıralı[0]?.kaynak}@${sıralı[0]?.zaman}`, son = `${sıralı[sıralı.length - 1]?.kaynak}@${sıralı[sıralı.length - 1]?.zaman}`;
  return { ok: true, tool: "rea_behavior_timeline", summary: `${sıralı.length} olay ${ilk} -> ${son} top_api=${top_api[0]?.ad ?? "-"}`, details: { sıralı, sayılar, top_api, ilk, son } };
}
