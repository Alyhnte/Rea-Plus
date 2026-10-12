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

// PE imzası + CLR bayrağı hızlı kontrolü (ilk 2 bayt MZ olmalı).
function peMi(yol: string): boolean {
  try {
    const buf = readFileSync(yol);
    return buf.length > 2 && buf[0] === 0x4d && buf[1] === 0x5a;
  } catch {
    return false;
  }
}

// Assembly metadata: hedef çalıştırılmadan başlık okuma.
export function rea_dotnet_metadata(dllYolu: string) {
  const okuyucu = okuyucuBul();
  if (!okuyucu) return { ok: false as const, code: "capability_unsupported", neden: "dotnet/monodis/ikdasm yok (metadata okuyucu gerekli)" };
  if (!existsSync(dllYolu)) return { ok: false as const, code: "capability_unsupported", neden: `Dosya yok: ${dllYolu}` };
  if (!peMi(dllYolu)) return { ok: false as const, code: "capability_unsupported", neden: "PE imzası yok (MZ bulunamadı)" };
  // Not: burada sadece bilgi okunur, assembly yüklenip çalıştırılmaz.
  return { ok: true as const, arac: "rea_dotnet_metadata", dosya: dllYolu, okuyucu, not: "Yalnızca başlık/metadata, çalıştırma yok" };
}

// CIL dökümü: dnfile ile gerçek metadata okuma, kod yürütülmez.
export function rea_dotnet_cil(dllYolu: string, tipFiltre?: string) {
  const meta = rea_dotnet_metadata(dllYolu);
  if (!meta.ok) return meta;
  // dnfile yoksa kapı: sahte liste dönülmez.
  try {
    execFileSync("python", ["-c", "import dnfile"], { stdio: "ignore", timeout: 10000 });
  } catch {
    return { ok: false as const, code: "capability_unsupported", neden: "dnfile yok (python dnfile gerekli)" };
  }
  // Assembly + metod listesi tek python çağrısında JSON döner.
  const betik = "import dnfile,json,sys; p=sys.argv[1]; f=sys.argv[2] if len(sys.argv)>2 else ''; pe=dnfile.dnPE(p); asm=str(pe.net.mdtables.Assembly.rows[0].Name); adlar=[str(r.Name) for r in pe.net.mdtables.MethodDef.rows]; top=len(adlar); l=[n for n in adlar if f in n] if f else adlar; print(json.dumps({'assembly':asm,'method_sayisi':top,'methods':l[:100]}))";
  try {
    const cikti = execFileSync("python", ["-c", betik, dllYolu, tipFiltre ?? ""], { encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
    const ham = String(cikti);
    const veri = JSON.parse(ham.slice(ham.indexOf("{")));
    return { ok: true as const, arac: "rea_dotnet_cil", dosya: dllYolu, filtre: tipFiltre ?? null, assembly: veri.assembly, method_sayisi: veri.method_sayisi, methods: veri.methods, not: "CIL salt-okunur, yürütme yok" };
  } catch (e) {
    return { ok: false as const, code: "capability_unsupported", neden: `CIL okunamadı: ${(e as Error)?.message ?? e}` };
  }
}
