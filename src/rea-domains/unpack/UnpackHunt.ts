// rea-plus unpack-hunt: bilinmeyen packer için rehberli akış.
// Karar ağacı: upx-info -> upx-dene -> dotnet? ilspy -> dump reçetesi (x64dbg OEP).
// SAF karar + gerçek alt çağrılar (upc/ilspy mevcut köprüler üstünden değil, bağımsız).
import { existsSync } from "node:fs";
import { rea_upx_info } from "./Unpack.js";
import { rea_dotnet_metadata } from "../dotnet/ManagedInspector.js";

export const UNPACKHUNT_TOOLS = ["rea_unpack_hunt"] as const;

export interface HuntAdimi {
  sira: number;
  eylem: string;
  tool: string;
  neden: string;
}

export function rea_unpack_hunt(yol: string): { ok: true; arac: string; karar: string; adimlar: HuntAdimi[] } | { ok: false; code: "capability_unsupported"; neden: string } {
  if (!yol || !existsSync(yol)) {
    return { ok: false, code: "capability_unsupported", neden: `hedef yok: ${yol}` };
  }
  // 1) UPX dene (gerçek).
  const upx = rea_upx_info(yol);
  if (upx.ok && (upx as { sikisik?: boolean }).sikisik) {
    return {
      ok: true, arac: "rea_unpack_hunt", karar: "upx",
      adimlar: [{ sira: 1, eylem: "upx ile aç", tool: "rea_upx_unpack", neden: "sıkışık tespit edildi" }],
    };
  }
  // 2) .NET obfuscation? metadata varsa ilspy yolu.
  const md = rea_dotnet_metadata(yol);
  if (md.ok) {
    return {
      ok: true, arac: "rea_unpack_hunt", karar: "dotnet",
      adimlar: [{ sira: 1, eylem: "ilspycmd ile C# üret", tool: "rea_ilspy_decompile", neden: "managed assembly" }],
    };
  }
  // 3) Bilinmeyen packer: OEP dump reçetesi (x64dbg, Scylla).
  return {
    ok: true, arac: "rea_unpack_hunt", karar: "dump",
    adimlar: [
      { sira: 1, eylem: "x64dbg ile aç, entry'de dur", tool: "debug_open", neden: "OEP avı başlar" },
      { sira: 2, eylem: "memory breakpoint ile OEP'yi yakala (yazma->çalıştırma geçişi)", tool: "debug_breakpoint", neden: "unpack sonrası kod belirir" },
      { sira: 3, eylem: "Scylla ile dump + IAT rebuild", tool: "debug_plugin", neden: "çalışır imaj çıkar" },
      { sira: 4, eylem: "dump üstünde statik analiz", tool: "rea_investigate", neden: "açılmış binary" },
    ],
  };
}
