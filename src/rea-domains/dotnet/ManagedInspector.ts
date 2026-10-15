// Managed (.NET) denetçi: metadata + CIL okuma iskeleti (hedef ASLA çalıştırılmaz).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, readdirSync } from "node:fs";
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
function clrDurumu(yol: string): "dotnet" | "native" | "pe-degil" {
  try {
    const buf = readFileSync(yol);
    if (buf.length < 0x40 || buf[0] !== 0x4d || buf[1] !== 0x5a) return "pe-degil"; // MZ yok
    const peOff = buf.readUInt32LE(0x3c);
    if (peOff + 24 > buf.length || buf.toString("latin1", peOff, peOff + 4) !== "PE\0\0") return "pe-degil";
    const optBoyu = buf.readUInt16LE(peOff + 20);
    const opt = peOff + 24;
    if (optBoyu < 2 || opt + optBoyu > buf.length) return "native";
    const magic = buf.readUInt16LE(opt);
    const dizinBas = magic === 0x20b ? opt + 112 : magic === 0x10b ? opt + 96 : -1; // PE32+ / PE32
    if (dizinBas < 0) return "native";
    if (buf.readUInt32LE(dizinBas - 4) < 15) return "native"; // CLR girdisi (14) yok
    return buf.readUInt32LE(dizinBas + 14 * 8) !== 0 ? "dotnet" : "native";
  } catch {
    return "pe-degil";
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
  let buf: Buffer;
  try { buf = readFileSync(datYolu); }
  catch { return il2cppKapi(`Dosya okunamadı: ${datYolu}`); }
  if (buf.length < IL2CPP_BASLIK_ENAZ) return il2cppKapi("başlık çok kısa (global-metadata.dat değil?)");
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
  if (metodOfset >= buf.length || sinifOfset >= buf.length) return il2cppKapi("ofsetler tutarsız (dosya dışında)");
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
