// rea-plus facade: katalog birleşimi
import { TOOL_CATALOG as CONDUIT_CATALOG } from "../conduit-core/catalog.js";

export interface ReaPlusCatalogEntry {
  id: string;
  ad: string;
  kaynak: "conduit" | "rea";
  zorunlu: boolean;
  url: string;
  nereye: string;
}

const REA_CATALOG: readonly ReaPlusCatalogEntry[] = [
  { id: "hopper", ad: "Hopper", kaynak: "rea", zorunlu: false, url: "https://www.hopperapp.com/", nereye: "REA_HOPPER_PATH veya Applications kurulumu" },
  { id: "ghidra", ad: "Ghidra", kaynak: "rea", zorunlu: false, url: "https://ghidra-sre.org/", nereye: "REA_GHIDRA_DIR, Java 17+" },
  { id: "ida", ad: "IDA", kaynak: "rea", zorunlu: false, url: "https://hex-rays.com/ida-pro/", nereye: "IDA MCP plugin + REA_IDA_URL" },
  { id: "cutter", ad: "Cutter", kaynak: "rea", zorunlu: false, url: "https://cutter.re/", nereye: "Rizin + Cutter kur (winget: Rizin.Rizin + Rizin.Cutter). Otomasyon rizin CLI üstünden, GUI manuel." },
  { id: "jeb", ad: "JEB", kaynak: "rea", zorunlu: false, url: "https://www.pnfsoftware.com/", nereye: "REA_JEB_MCP_URL ile caller-started client" },
  { id: "jadx", ad: "JADX", kaynak: "rea", zorunlu: false, url: "https://github.com/skylot/jadx", nereye: "headless jadx + full JDK, PATH" },
  { id: "apktool", ad: "Apktool", kaynak: "rea", zorunlu: false, url: "https://apktool.org/", nereye: "apktool launcher, PATH" },
  { id: "wabt", ad: "WABT", kaynak: "rea", zorunlu: false, url: "https://github.com/WebAssembly/wabt", nereye: "wabt 1.0.42, PATH" },
  { id: "binwalk", ad: "Binwalk/Unblob", kaynak: "rea", zorunlu: false, url: "https://github.com/ReFirmLabs/binwalk", nereye: "Linux, PATH" },
  { id: "dotnet", ad: ".NET SDK/dnfile", kaynak: "rea", zorunlu: false, url: "https://dotnet.microsoft.com/download", nereye: "dotnet CLI + python dnfile (pip install dnfile)" },
  { id: "adb", ad: "Android Platform-Tools", kaynak: "rea", zorunlu: false, url: "https://developer.android.com/tools/releases/platform-tools", nereye: "adb PATH'te (winget: Google.PlatformTools)" },
  { id: "playwright", ad: "Playwright+Chromium", kaynak: "rea", zorunlu: false, url: "https://playwright.dev/", nereye: "npm i playwright + npx playwright install chromium" },
  { id: "rizin", ad: "Rizin/Cutter", kaynak: "rea", zorunlu: false, url: "https://cutter.re/", nereye: "rizin CLI PATH'te (winget: Rizin.Rizin), Cutter GUI opsiyonel" },
  { id: "upx", ad: "UPX", kaynak: "rea", zorunlu: false, url: "https://upx.github.io/", nereye: "upx PATH'te (winget: UPX.UPX)" },
  { id: "ilspy", ad: "ILSpyCmd", kaynak: "rea", zorunlu: false, url: "https://github.com/icsharpcode/ILSpy", nereye: "dotnet tool install -g ilspycmd (SDK gerekir)" },
  { id: "mitmproxy", ad: "mitmproxy", kaynak: "rea", zorunlu: false, url: "https://mitmproxy.org/", nereye: "pip install mitmproxy" },
];

export function mergedCatalog(): ReaPlusCatalogEntry[] {
  const base: ReaPlusCatalogEntry[] = CONDUIT_CATALOG.map((c) => ({
    id: c.id, ad: c.ad, kaynak: "conduit" as const, zorunlu: c.zorunlu, url: c.url, nereye: c.nereye,
  }));
  return [...base, ...REA_CATALOG];
}
