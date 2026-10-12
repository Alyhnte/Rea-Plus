// rea-plus merkezi rea kayıtları: 35 araç, gerçek bağlı.
// Conduit 30 ismi donduruldu; rea kökenliler qualifyReaTool ile korunur.
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { qualifyReaTool } from "../facade/toolNamespace.js";
import { sniffBytes } from "../facade/sniff.js";
import { scoreTarget, bestMotor } from "../facade/confidence.js";
import { resolveChain } from "../facade/fallback.js";
import { missingReason } from "../facade/missingReasons.js";
import { suggestConfig } from "../facade/configSuggest.js";
import { rea_evm_selector, rea_wasm_exports } from "../rea-domains/wasm-evm/WasmEvmBridge.js";
import { rea_cutter_funcs, rea_cutter_disasm, rea_cutter_xrefs, rea_cutter_strings, rea_cutter_decompile, rea_cutter_caps } from "../rea-domains/cutter/CutterBridge.js";
import { rea_jadx_full, rea_jadx_methods, rea_jadx_xrefs, rea_jadx_read } from "../rea-domains/android/JadxBridge.js";
import { rea_ghidra_analyze, rea_ghidra_funcs, rea_ghidra_decompile, rea_ghidra_xrefs, rea_ghidra_strings, rea_ghidra_disasm } from "../rea-domains/ghidra/GhidraBridge.js";

const P = z.object({ path: z.string().min(1) });
const J = z.object({ text: z.string().min(1) });
const O = z.object({});
const Sig = z.object({ sig: z.string().min(1) });
const Wat = z.object({ wat: z.string().min(1) });
const Apk = z.object({ apk_path: z.string().min(1) });
const Cmd = z.object({ cmd: z.string().min(1) });
const Tip = z.object({ tip: z.string().min(1) });
const Motor = z.object({ tip: z.string().min(1), adaylar: z.array(z.string()).min(1) });
const Zincir = z.object({ birincil: z.string().min(1), mevcut: z.array(z.string()) });
const Eksik = z.object({ eksik: z.string().min(1), platform: z.string().optional() });

type C = { type: "text"; text: string };
function ok(v: unknown): { content: C[] } {
  return { content: [{ type: "text", text: JSON.stringify(v) }] };
}
function kapı(tool: string, neden: string): { content: C[]; isError: true } {
  return { content: [{ type: "text", text: JSON.stringify({ ok: false, code: "capability_unsupported", tool, reason: neden }) }], isError: true as const };
}

export function registerReaTools(server: McpServer): void {
  // Gerçek bağlı 7 araç.
  const gercek: Array<[string, string, any, (a: any) => Promise<unknown> | unknown]> = [
    ["rea_evm_selector", "EVM 4-byte selector (keccak, offline).", Sig, (a) => rea_evm_selector(a.sig)],
    ["rea_wasm_exports", "WAT export listesi (offline).", Wat, (a) => rea_wasm_exports(a.wat)],
    ["rea_sniff", "Dosya tip + motor önerisi (magic-byte).", J, (a) => sniffBytes(Buffer.from(a.text, "base64"))],
    ["rea_best_motor", "Hedef tip için en iyi motor (skor).", Motor, (a) => bestMotor(a.tip, a.adaylar)],
    ["rea_fallback", "Birincil yoksa yedek zincir.", Zincir, (a) => resolveChain(a.birincil, new Set(a.mevcut))],
    ["rea_missing_reason", "Eksik araç + kur komutu.", Eksik, (a) => missingReason(a.eksik, (a.platform ?? process.platform))],
    ["rea_config_suggest", "Bulunan araçlara MCP config snippet.", z.object({ bulunan: z.array(z.string()) }), (a) => ({ snippet: suggestConfig(a.bulunan) })],
    ["rea_cutter_funcs", "Cutter/rizin fonksiyon listesi (aflj).", P, (a) => rea_cutter_funcs(a.path)],
    ["rea_cutter_disasm", "Cutter/rizin disassembly (pdfj).", z.object({ path: z.string().min(1), addr: z.string().min(1) }), (a) => rea_cutter_disasm(a.path, a.addr)],
    ["rea_cutter_xrefs", "Cutter/rizin xref listesi (axtj).", z.object({ path: z.string().min(1), addr: z.string().min(1) }), (a) => rea_cutter_xrefs(a.path, a.addr)],
    ["rea_cutter_strings", "Cutter/rizin string listesi (izj).", P, (a) => rea_cutter_strings(a.path)],
    ["rea_cutter_decompile", "Cutter sözde-derleme (pdc/pdf).", z.object({ path: z.string().min(1), addr: z.string().min(1) }), (a) => rea_cutter_decompile(a.path, a.addr)],
    ["rea_cutter_caps", "Cutter/rizin yetenek yoklaması.", O, () => rea_cutter_caps()],
    ["rea_jadx_full", "APK tam decompile (çıktı dizini).", z.object({ apk_path: z.string().min(1), out: z.string().min(1) }), (a) => rea_jadx_full(a.apk_path, a.out)],
    ["rea_jadx_methods", "Decompile çıktıda method listesi.", z.object({ dir: z.string().min(1) }), (a) => rea_jadx_methods(a.dir)],
    ["rea_jadx_xrefs", "Decompile çıktıda terim arama.", z.object({ dir: z.string().min(1), terim: z.string().min(1) }), (a) => rea_jadx_xrefs(a.dir, a.terim)],
    ["rea_jadx_read", "Decompile sınıf okuma (400 satır).", z.object({ dir: z.string().min(1), sinif: z.string().min(1) }), (a) => rea_jadx_read(a.dir, a.sinif)],
    ["rea_ghidra_analyze", "Ghidra headless import+analiz.", P, (a) => rea_ghidra_analyze(a.path)],
    ["rea_ghidra_funcs", "Ghidra fonksiyon listesi.", P, (a) => rea_ghidra_funcs(a.path)],
    ["rea_ghidra_decompile", "Ghidra sözde-kod (decompile).", z.object({ path: z.string().min(1), addr: z.string().min(1) }), (a) => rea_ghidra_decompile(a.path, a.addr)],
    ["rea_ghidra_xrefs", "Ghidra xref listesi.", z.object({ path: z.string().min(1), addr: z.string().min(1) }), (a) => rea_ghidra_xrefs(a.path, a.addr)],
    ["rea_ghidra_strings", "Ghidra string listesi.", P, (a) => rea_ghidra_strings(a.path)],
    ["rea_ghidra_disasm", "Ghidra disassembly notu (cutter önerili).", z.object({ path: z.string().min(1), addr: z.string().min(1) }), (a) => rea_ghidra_disasm(a.path, a.addr)],
  ];
  for (const [ad, aciklama, sema, is] of gercek) {
    const isim = qualifyReaTool(ad);
    server.registerTool(isim, { description: aciklama, inputSchema: sema }, async (args: unknown) => ok(await is(args as any)));
  }
  // Kapılı 28 araç: gerçek probe yoksa capability_unsupported, stub yok.
  const a: Array<[string, string, any, string]> = [
    ["rea_dotnet_metadata", "DOTNET metadata başlık okuma.", P, "dotnet SDK/ManagedInspector ile"],
    ["rea_dotnet_cil", "CIL dökümü.", P, "dotnet ManagedInspector ile"],
    ["rea_js_sourcemap", "Source-map çözümleme.", J, "JS artifact + sourcemap ile"],
    ["rea_js_bundle", "Bundle özeti.", J, "JsAnalyzer ile"],
    ["rea_js_diff", "Bundle satır farkı.", J, "BinaryDiff ile"],
    ["rea_js_recon", "JS keşif özeti.", J, "JsAnalyzer ile"],
    ["rea_diff_match", "Sürümler arası fonksiyon eşleme.", J, "BinaryDiff ile"],
    ["rea_diff_summary", "Eklenen/silinen özeti.", J, "BinaryDiff ile"],
    ["rea_recon_harness", "Pseudocode C harness.", J, "ReconHarness ile"],
    ["rea_crash_timeline", "Crash timeline.", J, "CrashTimeline ile"],
    ["rea_dos_mz", "MZ başlık kontrolü.", P, "DosMipsBridge ile"],
    ["rea_mips_funcs", "MIPS ön-tarama.", P, "DosMipsBridge ile"],
    ["rea_aot_detect", "NativeAOT tarama.", P, "NativeAotBridge ile"],
    ["rea_firmware_extract", "Firmware çıkarma (yalnız Linux).", P, "binwalk/unblob Linux'ta"],
    ["rea_browser_har_import", "HAR içe aktarma.", P, "BrowserBridge dosya okuma ile"],
    ["rea_browser_scenario", "Senaryo kaydı.", J, "BrowserBridge + Playwright ile"],
    ["rea_process_run", "Süreç koşusu.", Cmd, "ProcessCapture pipe ile"],
    ["rea_process_compare", "Pipe/PTY karşılaştırma (yalnız Linux).", Cmd, "Linux PTY ile"],
    ["rea_process_caps", "Süreç yetenek yoklaması.", O, "ProcessCapture ile"],
    ["rea_wasm_decode", "WASM/WAT çözümleme.", P, "REA_WABT_BIN/wasm2wat ile"],
    ["rea_jadx_manifest", "APK manifest özeti.", Apk, "headless jadx + JDK ile"],
    ["rea_jadx_classes", "APK sınıf listesi.", Apk, "headless jadx + JDK ile"],
    ["rea_adb_devices", "Bağlı cihaz listesi.", O, "platform-tools adb ile"],
    ["rea_adb_packages", "Yüklü paket listesi.", O, "platform-tools adb + cihaz ile"],
    ["rea_evidence_bundle", "Kanıt paketi derleme.", O, "evidenceBundle girdileri ile"],
    ["rea_obligation_ledger", "Defter kurma.", O, "bulgu listesi ile"],
    ["rea_obligation_advance", "Halka ilerletme.", O, "bulgu+kod ile"],
    ["rea_obligation_verify", "Zincir doğrulama.", O, "defter girdisi ile"],
  ];
  for (const [ad, aciklama, sema, nasil] of a) {
    const isim = qualifyReaTool(ad);
    server.registerTool(isim, { description: aciklama, inputSchema: sema }, async () => kapı(isim, `${nasil} çalıştırın (doğrudan modül/CLI hazır)`));
  }
  void scoreTarget;
  void Tip;
}
