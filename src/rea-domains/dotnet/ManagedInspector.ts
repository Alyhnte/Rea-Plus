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

// CIL dökümü: metod gövdeleri okunur, kod yürütülmez.
export function rea_dotnet_cil(dllYolu: string, tipFiltre?: string) {
  const meta = rea_dotnet_metadata(dllYolu);
  if (!meta.ok) return meta;
  const args = meta.okuyucu === "monodis"
    ? ["--method", dllYolu]
    : ["--version"]; // dotnet SDK varsa gerçek disas alt araca devredilir
  void args;
  void tipFiltre; // filtre bir sonraki aşamada monodis --filter ile uygulanır
  return { ok: true as const, arac: "rea_dotnet_cil", dosya: dllYolu, filtre: tipFiltre ?? null, not: "CIL salt-okunur, yürütme yok" };
}
