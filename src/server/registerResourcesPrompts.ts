// rea-plus MCP resource + prompt kayitlari: statik, salt-okunur ve yan etkisiz.
// Resource'lar hicbir env degeri, kisisel yol veya rastgele dosya icerigi acmaz;
// prompt'lar yalniz metin uretir, hicbir arac calistirmaz.
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

export const REA_SERVER_INFO_URI = "rea-plus://server-info";
export const REA_CAPABILITIES_SAFETY_URI = "rea-plus://capabilities-safety";
export const REA_PROMPT_NAMES = ["packer-triage", "dotnet-malware-triage", "android-triage"] as const;

export interface ReaServerInfoInput {
  name: string;
  version: string;
}

const VM_RULE =
  "Canli veya dinamik isler (ornek calistirma, debugger/Frida enjeksiyonu, paket yakalama, " +
  "cihaza kurulum, tarayici otomasyonu) ana makinede yapilmaz; yalniz VM/CI'in ayri, bilincli " +
  "kosulan isinde yapilir. Bu akista emin degilsen statik adimda dur ve canli adimi atlama.";

const TRIAGE_ARGS = z.object({
  path: z.string().min(1).describe("Incelenecek ornegin yolu"),
  focus: z.string().min(1).optional().describe("Opsiyonel odak sorusu veya suphe alani"),
});

function focusSatiri(focus?: string): string {
  const f = focus?.trim();
  return f ? `Odak: ${f}` : "Odak belirtilmedi; genel triage yap ve bulgulari onceliklendir.";
}

function promptSonuc(metin: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text: metin } }] };
}

export function buildServerInfo(info: ReaServerInfoInput) {
  return {
    name: info.name,
    version: info.version,
    description: "Conduit live-debug core + Rea static reverse-engineering domains over stdio/HTTP.",
    transports: ["stdio", "streamable-http"],
    tools: { total: 172, conduit: 30, rea: 142 },
    resources: [REA_SERVER_INFO_URI, REA_CAPABILITIES_SAFETY_URI],
    prompts: [...REA_PROMPT_NAMES],
  };
}

export function buildCapabilitiesSafety() {
  return {
    capabilities: {
      tools: { total: 172, conduit: 30, rea: 142 },
      resources: { subscribe: false, uris: [REA_SERVER_INFO_URI, REA_CAPABILITIES_SAFETY_URI] },
      prompts: { names: [...REA_PROMPT_NAMES], sideEffectFree: true },
    },
    safety: {
      resourcesReadOnly: true,
      arbitraryFileResources: false,
      environmentValuesExposed: false,
      personalPathsExposed: false,
      staticAnalysisFirst: true,
      workOnCopyForWrites: true,
      liveExecution: "vm-ci-only",
      liveExecutionRule: VM_RULE,
    },
    domains: [
      "native-pe-elf", "ghidra", "cutter-r2", "dotnet", "android-jadx-apktool", "wasm-evm",
      "unpack", "javascript", "firmware", "browser", "frida-live", "behavior-evidence",
    ],
  };
}

export function buildPackerTriageText(path: string, focus?: string): string {
  return [
    `Hedef: ${path}`,
    focusSatiri(focus),
    "Gorev: packer/koruma triage'i yap. Bu prompt tek basina hicbir arac calistirmaz; adimlari sirayla, her adimda sonucu degerlendirerek uygula.",
    "1) rea_investigate(path) ile tip + sorusturma planini al; plan disina cikmadan ilerle.",
    "2) PE ise rea_pe_info(path), rea_pe_sections(path) ve rea_pe_imports(path) ile bolum entropisi/isaretleri ve import seyrekligine bak; PE degilse bu adimi atla.",
    "3) rea_upx_info(path) ile UPX izini dogrula.",
    "4) rea_unpack_hunt(path) ile bilinmeyen packer rehberli akisini al; ardindan gerekirse rea_unpack_try(path) yonlendirmesini izle. Yazma gerektiren acma adimlarinda (orn. rea_upx_unpack) yalniz ornegin kopyasi uzerinde calis, orijinali degistirme.",
    "5) Acilmis veya acilmamis kopyada rea_cutter_strings(path) veya rea_ghidra_strings(path) ile yalniz dikkat cekici stringleri ozetle; tum dokumu raporlama.",
    "Cikti: tespit edilen packer/koruma, dayanak kanitlar (bolum/import/string), guven duzeyi ve onerilen sonraki tek adim.",
    VM_RULE,
  ].join("\n");
}

export function buildDotnetMalwareTriageText(path: string, focus?: string): string {
  return [
    `Hedef: ${path}`,
    focusSatiri(focus),
    "Gorev: .NET ornegi icin zararli-yazilim triage'i yap. Bu prompt tek basina hicbir arac calistirmaz; adimlari sirayla, her adimda sonucu degerlendirerek uygula ve ornegi asla calistirma.",
    "1) rea_investigate(path) ile tip + sorusturma planini al.",
    "2) rea_dotnet_metadata(path) ile assembly metadata, referanslar ve entry point'i cikar.",
    "3) rea_dotnet_cil(path) ile CIL method dokumunu incele; odak varsa filtre ile ilgili methodlara daralt. Supheli kaliplari (process injection, reflection yukleme, ag, kalicilik, sifre cozme donguleri) isaretle ama calistirma.",
    "4) Gerekirse rea_ilspy_decompile(path, out) ile yalniz kopyaya ait cikti dizinine C# decompile al; orijinal ornegi degistirme.",
    "5) Native bagimlilik suphesi varsa rea_pe_imports(path) ve rea_pe_sections(path) ile capraz kontrol yap; referans ornek varsa rea_managed_compare ile farki ozetle.",
    "Cikti: supheli davranis basliklari, her birinin dayandigi tip/method kaniti, guven duzeyi ve onerilen sonraki tek adim. Kanit yoksa zararli hukum verme.",
    VM_RULE,
  ].join("\n");
}

export function buildAndroidTriageText(path: string, focus?: string): string {
  return [
    `Hedef (apk_path): ${path}`,
    focusSatiri(focus),
    "Gorev: Android APK triage'i yap. Bu prompt tek basina hicbir arac calistirmaz; adimlari sirayla, her adimda sonucu degerlendirerek uygula.",
    "1) rea_investigate(path) ile tip + sorusturma planini al.",
    "2) rea_jadx_manifest(apk_path) ile paket, izinler, exported bilesenler ve entry noktalarini ozetle.",
    "3) rea_jadx_classes(apk_path) ile sinif listesini al; odakla ilgili veya supheli siniflari sec.",
    "4) Secilen siniflar icin rea_jadx_decompile(apk_path, sinif, out) ile yalniz kopyaya ait cikti dizinine decompile al; gerekiyorsa rea_jadx_xrefs ile cagri zincirini daralt. Tum APK'yi kosulsuz dokme.",
    "5) Flutter suphesi varsa rea_flutter_scan(path) ve gerekirse rea_flutter_payload(path) ile capraz kontrol yap.",
    "Cikti: izin/bilesen riskleri, incelenen siniflar, dayanak kanitlar, guven duzeyi ve onerilen sonraki tek adim.",
    "Cihaza kurulum, calistirma veya logcat gibi canli adimlar (orn. rea_adb_install) bu akisin disindadir.",
    VM_RULE,
  ].join("\n");
}

export function registerResourcesPrompts(server: McpServer, info: ReaServerInfoInput): void {
  server.registerResource(
    "server-info",
    REA_SERVER_INFO_URI,
    { title: "ReaPlus server info", description: "Statik sunucu kimligi ve yuzey ozeti (salt-okunur).", mimeType: "application/json" },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(buildServerInfo(info), null, 2) }],
    }),
  );
  server.registerResource(
    "capabilities-safety",
    REA_CAPABILITIES_SAFETY_URI,
    { title: "ReaPlus capabilities and safety", description: "Statik yetenek ve guvenlik kurallari ozeti (salt-okunur).", mimeType: "application/json" },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(buildCapabilitiesSafety(), null, 2) }],
    }),
  );

  server.registerPrompt(
    "packer-triage",
    { title: "Packer triage", description: "Packer/koruma tespiti icin sirali, statik-oncelikli rea akisi (yan etkisiz prompt).", argsSchema: TRIAGE_ARGS },
    ({ path, focus }) => promptSonuc(buildPackerTriageText(path, focus)),
  );
  server.registerPrompt(
    "dotnet-malware-triage",
    { title: ".NET malware triage", description: ".NET ornegi icin statik zararli-yazilim triage akisi (yan etkisiz prompt).", argsSchema: TRIAGE_ARGS },
    ({ path, focus }) => promptSonuc(buildDotnetMalwareTriageText(path, focus)),
  );
  server.registerPrompt(
    "android-triage",
    { title: "Android triage", description: "APK icin jadx tabanli statik triage akisi (yan etkisiz prompt).", argsSchema: TRIAGE_ARGS },
    ({ path, focus }) => promptSonuc(buildAndroidTriageText(path, focus)),
  );
}
