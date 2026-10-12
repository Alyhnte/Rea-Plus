// Managed (.NET) denetçi: metadata + CIL okuma iskeleti (hedef ASLA çalıştırılmaz).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

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
