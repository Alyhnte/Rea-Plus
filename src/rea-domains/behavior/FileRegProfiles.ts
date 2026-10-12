// rea-domains/behavior: dosya/registry mini profilleri (saf, exec yok)
// CreateFileW/WriteFile/RegSetValue imzalarına özel, JSON girdiden özet.
export type ApiOlay = { api: string; args?: unknown[]; yol?: string; dosya?: string; path?: string; anahtar?: string; key?: string };
// Sonuç: ok ise sıralı-tekil liste, değilse capability_unsupported kapısı.
export type DosyaSonuç = { ok: true; tool: string; summary: string; details: { yazilanDosyalar: string[]; okunanDosyalar: string[] } } | { ok: false; code: "capability_unsupported"; reason: string };
export type RegistrySonuç = { ok: true; tool: string; summary: string; details: { yazilanAnahtarlar: string[] } } | { ok: false; code: "capability_unsupported"; reason: string };
// API adını küçük harfe indir (eksikse boş döner).
const ad = (o: ApiOlay): string => String((o as ApiOlay)?.api ?? "").toLowerCase();
// Yol çıkar: adlandırılmış alan önce, yoksa args[0] metni.
const yolAl = (o: ApiOlay): string => {
const a = (o as ApiOlay)?.yol ?? (o as ApiOlay)?.dosya ?? (o as ApiOlay)?.path;
if (typeof a === "string" && a.trim()) return a.trim();
const ilk = (o as ApiOlay)?.args?.[0];
return typeof ilk === "string" && ilk.trim() ? ilk.trim() : "";
};
// Anahtar çıkar: adlandırılmış alan önce, yoksa args[0]/args[1] metni.
const anahtarAl = (o: ApiOlay): string => {
const a = (o as ApiOlay)?.anahtar ?? (o as ApiOlay)?.key;
if (typeof a === "string" && a.trim()) return a.trim();
for (const i of [0, 1]) { const v = (o as ApiOlay)?.args?.[i]; if (typeof v === "string" && v.trim()) return v.trim(); }
return "";
};
// Tekille + sırala (deterministik özet için).
const tekil = (l: string[]): string[] => [...new Set(l.filter((s) => !!s))].sort((a, b) => a.localeCompare(b));
// Yazma/okuma kümeleri: CreateFile+Write yazma, Read okuma sayılır.
const YAZAN = new Set(["createfilew", "createfilea", "writefile", "ntcreatefile", "ntwritefile"]);
const OKUNAN = new Set(["readfile", "ntreadfile"]);
const REG_YAZAN = new Set(["regsetvaluew", "regsetvaluea", "regsetvalueexw", "regsetvalueexa", "ntsetvaluekey", "regcreatekeyw", "regcreatekeyexw", "ntcreatekey"]);
// Dosya izi: yazılan/okunan ayrımı (girdi değişmez, saf).
export function rea_dosya_izi(apiOlaylariJson: ApiOlay[]): DosyaSonuç {
if (!Array.isArray(apiOlaylariJson) || apiOlaylariJson.length === 0) return { ok: false, code: "capability_unsupported", reason: "api olay listesi boş" };
const yaz: string[] = [], oku: string[] = [];
for (const o of apiOlaylariJson) { const k = ad(o as ApiOlay), y = yolAl(o as ApiOlay); if (!k || !y) continue; if (YAZAN.has(k)) yaz.push(y); else if (OKUNAN.has(k)) oku.push(y); }
const yazilanDosyalar = tekil(yaz), okunanDosyalar = tekil(oku);
return { ok: true, tool: "rea_dosya_izi", summary: `${yazilanDosyalar.length} yazma ${okunanDosyalar.length} okuma`, details: { yazilanDosyalar, okunanDosyalar } };
}
// Registry izi: değer/anahtar yazımları (girdi değişmez, saf).
export function rea_registry_izi(apiOlaylariJson: ApiOlay[]): RegistrySonuç {
if (!Array.isArray(apiOlaylariJson) || apiOlaylariJson.length === 0) return { ok: false, code: "capability_unsupported", reason: "api olay listesi boş" };
const yaz: string[] = [];
for (const o of apiOlaylariJson) { const k = ad(o as ApiOlay); if (!REG_YAZAN.has(k)) continue; const a = anahtarAl(o as ApiOlay); if (a) yaz.push(a); }
const yazilanAnahtarlar = tekil(yaz);
return { ok: true, tool: "rea_registry_izi", summary: `${yazilanAnahtarlar.length} anahtar yazımı`, details: { yazilanAnahtarlar } };
}
