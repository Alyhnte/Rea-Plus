// rea-domains/behavior: tam davranış raporu (saf, exec yok)
// API+syscall+net olaylarını timeline ile birleştirir, dosya/registry özeti ekler.
import { rea_behavior_timeline } from "./BehaviorTimeline.js";
import type { DavranışOlay } from "./BehaviorTimeline.js";
import { syscall_ad } from "./SyscallTable.js";
import { rea_dosya_izi, rea_registry_izi } from "./FileRegProfiles.js";
import type { ApiOlay } from "./FileRegProfiles.js";
// Tek rapor: çizelge (timeline) + özet metni + bulgu listesi.
export type ReaFullSonuç = { ok: true; tool: string; cizelge: DavranışOlay[]; ozet: string; bulgular: string[] } | { ok: false; code: "capability_unsupported"; reason: string };
// Sayısal api metni mi? "85"/"0x55" -> syscall adı çözülür.
const sayiAd = (api: string): string | null => {
const s = String(api ?? "").trim().toLowerCase();
if (/^0x[0-9a-f]+$/.test(s)) return syscall_ad(parseInt(s, 16));
if (/^\d+$/.test(s)) return syscall_ad(parseInt(s, 10));
return null;
};
// Tek api olayını timeline olayına çevir (no varsa syscall kaynağı).
const cevir = (o: ApiOlay, i: number): DavranışOlay => {
const ham = o as ApiOlay & { no?: number; zaman?: number | string };
const zaman = (ham?.zaman ?? i) as number | string;
if (typeof ham?.no === "number" && Number.isInteger(ham.no)) return { kaynak: "syscall", zaman, detay: syscall_ad(ham.no) };
const cozum = sayiAd(ham?.api);
if (cozum) return { kaynak: "syscall", zaman, detay: cozum };
return { kaynak: "api", zaman, detay: String(ham?.api ?? "bilinmiyor") };
};
// Tam rapor: birleştir + syscall çöz + dosya/registry özeti (saf).
export function rea_behavior_full(apiJson: ApiOlay[], netJson?: DavranışOlay[], dosyaProfili = true): ReaFullSonuç {
if (!Array.isArray(apiJson) || apiJson.length === 0) return { ok: false, code: "capability_unsupported", reason: "api listesi boş" };
const olaylar: DavranışOlay[] = apiJson.map((o, i) => cevir(o, i));
if (Array.isArray(netJson)) for (const n of netJson) { if (n && (n as DavranışOlay).kaynak && (n as DavranışOlay).detay !== undefined) olaylar.push({ kaynak: String((n as DavranışOlay).kaynak), zaman: (n as DavranışOlay).zaman, detay: String((n as DavranışOlay).detay) }); }
const c = rea_behavior_timeline(olaylar);
if (!c.ok) return { ok: false, code: "capability_unsupported", reason: "çizelge kurulamadı" };
const bulgular: string[] = [`olay=${olaylar.length}`, `top_api=${c.details.top_api[0]?.ad ?? "-"}`];
for (const o of olaylar) if (o.kaynak === "syscall") bulgular.push(`syscall:${o.detay}`);
if (dosyaProfili) {
const d = rea_dosya_izi(apiJson);
if (d.ok) { bulgular.push(`dosya_yazma=${d.details.yazilanDosyalar.length}`, `dosya_okuma=${d.details.okunanDosyalar.length}`); for (const y of d.details.yazilanDosyalar.slice(0, 5)) bulgular.push(`yazilan:${y}`); }
const r = rea_registry_izi(apiJson);
if (r.ok) { bulgular.push(`registry=${r.details.yazilanAnahtarlar.length}`); for (const a of r.details.yazilanAnahtarlar.slice(0, 5)) bulgular.push(`anahtar:${a}`); }
}
const ozet = `${c.summary} | ${bulgular.slice(0, 4).join(" ")}`;
return { ok: true, tool: "rea_behavior_full", cizelge: c.details.sıralı, ozet, bulgular };
}
