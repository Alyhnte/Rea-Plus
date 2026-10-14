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
// --- Dalga C/1: CreateFileW + RegSet profilleri (saf, exec yok) ---
// Ham işaretçi metni mi? "0x..." salt sayıysa ad/yol sayılmaz (sahte eşleşme yok).
const isaretciMi = (v: unknown): boolean => typeof v === "string" && /^0x[0-9a-f]+$/i.test(v.trim());
// Metin alan mı? Boş ve işaretçi olmayan metin.
const metinMi = (v: unknown): v is string => typeof v === "string" && !!v.trim() && !isaretciMi(v);
// Sayısal erişim ayrıştır: sayı ya da "0x.."/"123" metni; yoksa null.
const erisimAl = (o: ApiOlay & { erisim?: unknown; access?: unknown; desiredAccess?: unknown }): number | null => {
const aday = [o?.erisim, o?.access, o?.desiredAccess, o?.args?.[1]];
for (const v of aday) {
if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
if (typeof v === "string") { const s = v.trim().toLowerCase(); if (/^0x[0-9a-f]+$/.test(s)) return parseInt(s, 16); if (/^\d+$/.test(s)) return parseInt(s, 10); }
}
return null;
};
// Yazma bitleri: GENERIC_WRITE/ALL + yazma-yönlü dosya erişim bitleri.
const YAZMA_BITLERI = 0x40000000 | 0x10000000 | 0x0002 | 0x0004 | 0x00040000 | 0x00080000 | 0x00010000;
const CREATEFILE_AILESI = new Set(["createfilew", "createfilea"]);
// Tek profil: yol + erişim + yazma/salt (erişim bilinmiyorsa yazma varsayılır).
export type CreateFileWProfili = { api: string; yol: string; erisim: number | null; yazma: boolean; salt: boolean };
export type CreateFileWSonuç = { ok: true; tool: string; summary: string; details: { profiller: CreateFileWProfili[] } } | { ok: false; code: "capability_unsupported"; reason: string };
// CreateFileW profili: her çağrıda yol + erişim + yazma/salt ayrımı.
export function rea_createfilew_profili(apiOlaylariJson: ApiOlay[]): CreateFileWSonuç {
if (!Array.isArray(apiOlaylariJson) || apiOlaylariJson.length === 0) return { ok: false, code: "capability_unsupported", reason: "api olay listesi boş" };
const profiller: CreateFileWProfili[] = [];
for (const o of apiOlaylariJson) {
const k = ad(o as ApiOlay);
if (!CREATEFILE_AILESI.has(k)) continue;
const ham = o as ApiOlay & { erisim?: unknown; access?: unknown; desiredAccess?: unknown };
const ilk = (ham as ApiOlay)?.args?.[0];
const yol = metinMi((ham as ApiOlay)?.yol) ? String((ham as ApiOlay).yol).trim()
: metinMi((ham as ApiOlay)?.dosya) ? String((ham as ApiOlay).dosya).trim()
: metinMi((ham as ApiOlay)?.path) ? String((ham as ApiOlay).path).trim()
: metinMi(ilk) ? String(ilk).trim() : "";
const erisim = erisimAl(ham);
const yazma = erisim === null ? true : (erisim & YAZMA_BITLERI) !== 0;
profiller.push({ api: String((o as ApiOlay)?.api ?? ""), yol, erisim, yazma, salt: !yazma });
}
const y = profiller.filter((p) => p.yazma).length, s = profiller.length - y;
return { ok: true, tool: "rea_createfilew_profili", summary: `${y} yazma ${s} salt`, details: { profiller } };
}
const REGSET_AILESI = new Set(["regsetvaluew", "regsetvaluea", "regsetvalueexw", "regsetvalueexa", "ntsetvaluekey"]);
// Tek profil: anahtar + değer adı (çözülemeyen boş kalır, uydurulmaz).
export type RegSetProfili = { api: string; anahtar: string; degerAdi: string };
export type RegSetSonuç = { ok: true; tool: string; summary: string; details: { profiller: RegSetProfili[] } } | { ok: false; code: "capability_unsupported"; reason: string };
// RegSet profili: her yazımda anahtar + değer adı çıkar.
export function rea_regset_profili(apiOlaylariJson: ApiOlay[]): RegSetSonuç {
if (!Array.isArray(apiOlaylariJson) || apiOlaylariJson.length === 0) return { ok: false, code: "capability_unsupported", reason: "api olay listesi boş" };
const profiller: RegSetProfili[] = [];
for (const o of apiOlaylariJson) {
const k = ad(o as ApiOlay);
if (!REGSET_AILESI.has(k)) continue;
const ham = o as ApiOlay & { deger?: unknown; degerAdi?: unknown; valueName?: unknown; value?: unknown };
const a0 = (ham as ApiOlay)?.args?.[0], a1 = (ham as ApiOlay)?.args?.[1];
const anahtar = metinMi((ham as ApiOlay)?.anahtar) ? String((ham as ApiOlay).anahtar).trim()
: metinMi((ham as ApiOlay)?.key) ? String((ham as ApiOlay).key).trim()
: metinMi(a0) ? String(a0).trim() : "";
const degerAdi = metinMi(ham?.degerAdi) ? String(ham.degerAdi).trim()
: metinMi(ham?.deger) ? String(ham.deger).trim()
: metinMi(ham?.valueName) ? String(ham.valueName).trim()
: metinMi(a1) && !/^\d+$/.test(String(a1).trim()) ? String(a1).trim() : "";
profiller.push({ api: String((o as ApiOlay)?.api ?? ""), anahtar, degerAdi });
}
return { ok: true, tool: "rea_regset_profili", summary: `${profiller.length} değer yazımı`, details: { profiller } };
}
