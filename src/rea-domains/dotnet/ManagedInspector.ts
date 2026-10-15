// Managed (.NET) denetçi: metadata + CIL okuma iskeleti (hedef ASLA çalıştırılmaz).
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readSync, statSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Facade prefix kuralı: rea_ öneki zorunlu.
export const DOTNET_TOOLS = ["rea_dotnet_metadata", "rea_dotnet_cil"] as const;

// Metadata okuyucu var mı? (dotnet SDK veya monodis/ikdasm).
function okuyucuBul(): string | null {
  for (const bin of ["dotnet", "monodis", "ikdasm"]) {
    try {
      execFileSync(bin, ["--version"], { stdio: "ignore" });
      return bin;
    } catch { /* sonraki adaya geç */ }
  }
  return null;
}

// Gerçek .NET tespiti: PE optional header'daki CLR dizini (DataDirectory[14]) dolu mu?
// Yalnız MZ bakmak her native PE'yi .NET sanır; karar bu kontrole dayanır.
// KRİTİK: dosyanın tamamı belleğe alınmaz; yalnız başlık pencereleri okunur
// (GB'lık imajlarda OOM bitirir). Karar mantığı eski tam-okuma ile birebir.
function clrDurumu(yol: string): "dotnet" | "native" | "pe-degil" {
  let fd = -1;
  try {
    const boy = statSync(yol).size;
    fd = openSync(yol, "r");
    // [off, off+len) aralığını oku; menzil dışıysa null.
    const oku = (off: number, len: number): Buffer | null => {
      if (off < 0 || off >= boy || len <= 0) return null;
      const n = Math.min(len, boy - off);
      const buf = Buffer.alloc(n);
      let doldu = 0;
      while (doldu < n) {
        const k = readSync(fd, buf, doldu, n - doldu, off + doldu);
        if (k <= 0) break;
        doldu += k;
      }
      return doldu > 0 ? buf.subarray(0, doldu) : null;
    };
    const bas = oku(0, 0x40);
    if (!bas || bas.length < 0x40 || bas[0] !== 0x4d || bas[1] !== 0x5a) return "pe-degil"; // MZ yok
    const peOff = bas.readUInt32LE(0x3c);
    // COFF(20) + optional sihri + DataDirectory[14] için tek pencere (280B yeter).
    const pencere = oku(peOff, 280);
    if (!pencere || pencere.length < 24 || pencere.subarray(0, 4).toString("latin1") !== "PE\0\0") return "pe-degil";
    const optBoyu = pencere.readUInt16LE(20);
    const opt = peOff + 24;
    if (optBoyu < 2 || opt + optBoyu > boy) return "native";
    const magic = pencere.readUInt16LE(24);
    const dizinBas = magic === 0x20b ? opt + 112 : magic === 0x10b ? opt + 96 : -1; // PE32+ / PE32
    if (dizinBas < 0) return "native";
    // dizinBas görece ofsetleri pencere içine çevir (pencere peOff'ta başlar).
    const r32 = (mutlak: number): number | null => {
      const g = mutlak - peOff;
      return g >= 0 && g + 4 <= pencere.length ? pencere.readUInt32LE(g) : null;
    };
    const girdiSayisi = r32(dizinBas - 4);
    if (girdiSayisi === null) return "pe-degil"; // eski kod menzil dışında fırlatırdı
    if (girdiSayisi < 15) return "native"; // CLR girdisi (14) yok
    const clrRva = r32(dizinBas + 14 * 8);
    if (clrRva === null) return "pe-degil"; // eski kod menzil dışında fırlatırdı
    return clrRva !== 0 ? "dotnet" : "native";
  } catch {
    return "pe-degil";
  } finally {
    if (fd >= 0) { try { closeSync(fd); } catch { /* kapanmış */ } }
  }
}

// Assembly metadata: hedef çalıştırılmadan başlık okuma.
export function rea_dotnet_metadata(dllYolu: string) {
  const okuyucu = okuyucuBul(); // bilgi amaçlı; karar CLR kontrolünde, şart değil
  const durum = existsSync(dllYolu) ? clrDurumu(dllYolu) : "pe-degil";
  if (!existsSync(dllYolu)) return { ok: false as const, code: "capability_unsupported", neden: `Dosya yok: ${dllYolu}` };
  if (durum === "pe-degil") return { ok: false as const, code: "capability_unsupported", neden: "PE imzası yok (MZ/PE bulunamadı)" };
  if (durum === "native") return { ok: false as const, code: "capability_unsupported", neden: "CLR başlığı yok (native PE, .NET değil)" };
  // Not: burada sadece bilgi okunur, assembly yüklenip çalıştırılmaz.
  return { ok: true as const, arac: "rea_dotnet_metadata", dosya: dllYolu, clr: true as const, okuyucu, not: "CLR dizini doğrulandı; yalnızca başlık/metadata, çalıştırma yok" };
}

// dnfile'lı python bul: adaylar sırayla denenir (Linux'ta genelde yalnız python3 olur).
function pyBul(): string | null {
  for (const b of ["python", "python3", "py"]) {
    try { execFileSync(b, ["-c", "import dnfile"], { stdio: "ignore", timeout: 10000 }); return b; } catch { /* sıradaki */ }
  }
  return null;
}

// CIL dökümü: dnfile ile gerçek metadata okuma, kod yürütülmez.
export function rea_dotnet_cil(dllYolu: string, tipFiltre?: string) {
  const meta = rea_dotnet_metadata(dllYolu);
  if (!meta.ok) return meta;
  // dnfile yoksa kapı: sahte liste dönülmez.
  const py = pyBul();
  if (!py) return { ok: false as const, code: "capability_unsupported", neden: "dnfile yok (python dnfile gerekli)" };
  // Assembly + metod listesi tek python çağrısında JSON döner.
  const betik = "import dnfile,json,sys; p=sys.argv[1]; f=sys.argv[2] if len(sys.argv)>2 else ''; pe=dnfile.dnPE(p); asm=str(pe.net.mdtables.Assembly.rows[0].Name); adlar=[str(r.Name) for r in pe.net.mdtables.MethodDef.rows]; top=len(adlar); l=[n for n in adlar if f in n] if f else adlar; print(json.dumps({'assembly':asm,'method_sayisi':top,'methods':l[:100]}))";
  try {
    const cikti = execFileSync(py, ["-c", betik, dllYolu, tipFiltre ?? ""], { encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
    const ham = String(cikti);
    const veri = JSON.parse(ham.slice(ham.indexOf("{")));
    return { ok: true as const, arac: "rea_dotnet_cil", dosya: dllYolu, filtre: tipFiltre ?? null, assembly: veri.assembly, method_sayisi: veri.method_sayisi, methods: veri.methods, not: "CIL salt-okunur, yürütme yok" };
  } catch (e) {
    return { ok: false as const, code: "capability_unsupported", neden: `CIL okunamadı: ${(e as Error)?.message ?? e}` };
  }
}

// --- Unity IL2CPP derinliği: global-metadata.dat saf TS başlık okuma (yürütme yok) ---
// Başlık düzeni (v16+ sabit ofsetler, LE u32): sürüm@4, methods sayı@52,
// typeDefinitions sayı@164, images sayı@172, assemblies sayı@180.
const IL2CPP_SIHIR = 0xfab11baf;
const IL2CPP_BASLIK_ENAZ = 216;
function il2cppKapi(neden: string) {
  return { ok: false as const, code: "capability_unsupported" as const, neden };
}
// Dış araç kapısı: önce env yolu, yoksa PATH (where/which). Çalıştırma yok, yalnız konum.
function disAracBul(envAd: string, adaylar: string[]): string | null {
  const ozel = process.env[envAd];
  if (ozel) return existsSync(ozel) ? ozel : null;
  const prob = process.platform === "win32" ? "where" : "which";
  for (const bin of adaylar) {
    try {
      const r = spawnSync(prob, [bin], { stdio: "ignore", timeout: 5000 });
      if (r.status === 0) return bin;
    } catch { /* sonraki aday */ }
  }
  return null;
}
// Metadata sayımı: sınıf (TypeDefinition) + metod (MethodDef) başlık sayıları.
export function rea_il2cpp_metadata(datYolu: string) {
  if (!existsSync(datYolu)) return il2cppKapi(`Dosya yok: ${datYolu}`);
  // KRİTİK: yalnız başlık penceresi okunur (216B); ofset tutarlılığı stat boyuna göre.
  let bas: Buffer;
  let boy = 0;
  let fd = -1;
  try {
    boy = statSync(datYolu).size;
    if (boy < IL2CPP_BASLIK_ENAZ) return il2cppKapi("başlık çok kısa (global-metadata.dat değil?)");
    fd = openSync(datYolu, "r");
    bas = Buffer.alloc(IL2CPP_BASLIK_ENAZ);
    let doldu = 0;
    while (doldu < IL2CPP_BASLIK_ENAZ) {
      const k = readSync(fd, bas, doldu, IL2CPP_BASLIK_ENAZ - doldu, doldu);
      if (k <= 0) break;
      doldu += k;
    }
    if (doldu < IL2CPP_BASLIK_ENAZ) return il2cppKapi("başlık çok kısa (global-metadata.dat değil?)");
  } catch { return il2cppKapi(`Dosya okunamadı: ${datYolu}`); }
  finally { if (fd >= 0) { try { closeSync(fd); } catch { /* kapanmış */ } } }
  const buf = bas;
  if (buf.readUInt32LE(0) !== IL2CPP_SIHIR) return il2cppKapi("global-metadata.dat sihri yok (FAB11BAF bulunamadı)");
  const surum = buf.readUInt32LE(4);
  const metodOfset = buf.readUInt32LE(48);
  const metodSayisi = buf.readUInt32LE(52);
  const sinifOfset = buf.readUInt32LE(160);
  const sinifSayisi = buf.readUInt32LE(164);
  const goruntuSayisi = buf.readUInt32LE(172);
  const assemblySayisi = buf.readUInt32LE(180);
  // Tutarlılık: ofsetler dosya içinde, sayılar makul aralıkta olmalı.
  const sayilar = [metodSayisi, sinifSayisi, goruntuSayisi, assemblySayisi];
  if (!sayilar.every((n) => n <= 50_000_000)) return il2cppKapi("sayılar tutarsız (aşırı büyük sayaç)");
  if (metodOfset >= boy || sinifOfset >= boy) return il2cppKapi("ofsetler tutarsız (dosya dışında)");
  return {
    ok: true as const, arac: "rea_il2cpp_metadata", dosya: datYolu, surum,
    sinifSayisi, metodSayisi, goruntuSayisi, assemblySayisi,
    ozet: `v${surum} sinif=${sinifSayisi} metod=${metodSayisi}`,
    not: "salt-okunur başlık sayımı, yürütme yok",
  };
}
// Il2CppDumper: araç yoksa dürüst kapı + kurulum ipucu; varsa timeout'lu gerçek çağrı.
export function rea_il2cpp_dump(metaYolu: string, assemblyYolu?: string) {
  if (!existsSync(metaYolu)) return il2cppKapi(`Dosya yok: ${metaYolu}`);
  const arac = disAracBul("REA_IL2CPPDUMPER_BIN", ["Il2CppDumper", "il2cppdumper"]);
  if (!arac) return il2cppKapi("Il2CppDumper yok (kurulum: https://github.com/Perfare/Il2CppDumper ; bulunan exe yolunu REA_IL2CPPDUMPER_BIN ile ver)");
  if (!assemblyYolu || !existsSync(assemblyYolu)) return il2cppKapi("GameAssembly gerekli (libil2cpp.so/GameAssembly.dll yolu ikinci argüman olmalı)");
  const cikti = mkdtempSync(join(tmpdir(), "il2cpp-dump-"));
  try {
    const log = execFileSync(arac, [assemblyYolu, metaYolu, cikti], { encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    const dosyalar = readdirSync(cikti);
    return { ok: true as const, arac: "rea_il2cpp_dump", dosya: metaYolu, cikti, dosyaSayisi: dosyalar.length, ozet: `${dosyalar.length} döküm dosyası`, log: String(log).slice(-2000) };
  } catch (e) {
    return il2cppKapi(`Il2CppDumper çalışmadı: ${(e as Error)?.message ?? e}`);
  }
}
