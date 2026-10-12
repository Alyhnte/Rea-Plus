// ManagedWorkflow: üye diff + doğrulama + içe-aktarma (saf TS, yürütmesiz).
// Girdi JSON metnidir (dosya okunmaz); compare ad-anahtarlı, verify metadata çıktılı, import eşlemelidir.
export interface ManagedUye { ad: string; imza: string }
export type ManagedSonuc = { ok: true; arac: string; ozet: string; detay: unknown } | { ok: false; code: "capability_unsupported"; neden: string };
// Boş/bozuk girdi kapısı: sahte sonuç yerine tek tip hata döner.
function kapi(neden: string): ManagedSonuc { return { ok: false, code: "capability_unsupported", neden }; }
// JSON dizisi çözer, dizi değilse null döner (bozuk girdi kapıya düşer).
function diziCoz(json: string): unknown[] | null {
  try { const v: unknown = JSON.parse(json); return Array.isArray(v) ? v : null; }
  catch { return null; }
}
// Üye adı çıkarır: string ya da {ad/name} nesnesi kabul edilir.
function adCoz(v: unknown): string | null {
  if (typeof v === "string") return v.trim() ? v.trim() : null;
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const a = o["ad"] ?? o["name"] ?? o["uye"];
    return typeof a === "string" && a.trim() ? a.trim() : null;
  }
  return null;
}
// İmza çıkarır: {imza/sig} yoksa boş dizge sayılır (adsız kayıt elenir).
function uyeCoz(v: unknown): ManagedUye | null {
  const ad = adCoz(v);
  if (!ad) return null;
  const o = (v !== null && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const imza = o["imza"] ?? o["sig"] ?? o["signature"];
  return { ad, imza: typeof imza === "string" ? imza : "" };
}
// İki üye listesi diff'i: eklenen/silinen/imza-değişen (ad anahtarlı).
export function rea_managed_compare(uyelerAJson: string, uyelerBJson: string): ManagedSonuc {
  const hamA = diziCoz(uyelerAJson);
  const hamB = diziCoz(uyelerBJson);
  if (!hamA || !hamB) return kapi("geçersiz üye JSON (dizi gerekli)");
  const a = hamA.map(uyeCoz).filter((x): x is ManagedUye => x !== null);
  const b = hamB.map(uyeCoz).filter((x): x is ManagedUye => x !== null);
  if (!a.length && !b.length) return kapi("üye listesi yok");
  const haritaA = new Map(a.map((u) => [u.ad, u.imza]));
  const haritaB = new Map(b.map((u) => [u.ad, u.imza]));
  const eklenen = b.filter((u) => !haritaA.has(u.ad));
  const silinen = a.filter((u) => !haritaB.has(u.ad));
  const imzaDegisen = b.filter((u) => haritaA.has(u.ad) && haritaA.get(u.ad) !== u.imza);
  return { ok: true, arac: "rea_managed_compare", ozet: `+${eklenen.length} -${silinen.length} ~${imzaDegisen.length}`, detay: { eklenen, silinen, imzaDegisen } };
}
// Metadata çıktısından mevcut ad listesi çıkarır (methods/uyeler/members/adlar ya da dizi).
function mevcutCoz(metaJson: string): string[] | null {
  try {
    const v: unknown = JSON.parse(metaJson);
    if (Array.isArray(v)) return v.map(adCoz).filter((x): x is string => x !== null);
    if (v !== null && typeof v === "object") {
      const o = v as Record<string, unknown>;
      for (const k of ["methods", "uyeler", "members", "adlar"])
        if (Array.isArray(o[k])) return (o[k] as unknown[]).map(adCoz).filter((x): x is string => x !== null);
    }
    return null;
  } catch { return null; }
}
// Beklenen adlara karşı eksik/fazla raporu (yalnızca JSON karşılaştırma).
export function rea_managed_verify(dllYolu: string, beklenenAdlarJson: string): ManagedSonuc {
  // dllYolu: rea_dotnet_metadata JSON çıktısı (dosya yolu okunmaz, yürütme yok).
  const mevcut = mevcutCoz(dllYolu);
  const hamBeklenen = diziCoz(beklenenAdlarJson);
  if (!mevcut) return kapi("metadata JSON gerekli (rea_dotnet_metadata çıktısı)");
  if (!hamBeklenen) return kapi("geçersiz beklenen JSON (dizi gerekli)");
  const beklenen = hamBeklenen.map(adCoz).filter((x): x is string => x !== null);
  if (!mevcut.length || !beklenen.length) return kapi("üye listesi yok");
  const kumeM = new Set(mevcut);
  const kumeB = new Set(beklenen);
  const eksik = beklenen.filter((n) => !kumeM.has(n));
  const fazla = mevcut.filter((n) => !kumeB.has(n));
  return { ok: true, arac: "rea_managed_verify", ozet: `eksik:${eksik.length} fazla:${fazla.length}`, detay: { eksik, fazla } };
}
// Bulgu dizisini reconstruction kaydına çevirir (bulgu->üye eşleme listesi).
export function rea_managed_import(jsonDosya: string): ManagedSonuc {
  // jsonDosya: bulgu JSON metni ([{bulgu, uye/aday/ad}] ya da [{bulgu}]), dosya okunmaz.
  const ham = diziCoz(jsonDosya);
  if (!ham) return kapi("geçersiz bulgu JSON (dizi gerekli)");
  if (!ham.length) return kapi("bulgu listesi yok");
  const esleme = ham.map((v) => {
    const o = (v !== null && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const bulgu = typeof o["bulgu"] === "string" ? (o["bulgu"] as string) : adCoz(v) ?? "";
    const uye = adCoz(o["uye"] ?? o["aday"] ?? o["ad"] ?? o["name"]) ?? "";
    return { bulgu, uye };
  }).filter((e) => e.bulgu && e.uye);
  if (!esleme.length) return kapi("eşleme yok");
  return { ok: true, arac: "rea_managed_import", ozet: `${esleme.length} eşleme`, detay: { kayit: "reconstruction", esleme } };
}
