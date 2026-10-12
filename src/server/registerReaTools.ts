// rea-plus merkezi rea kayıtları: TÜMÜ gerçek bağlı (hopper/ida/jeb hariç kapılı).
// Conduit 30 ismi donduruldu; rea kökenliler qualifyReaTool ile korunur.
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { qualifyReaTool } from "../facade/toolNamespace.js";
import { sniffBytes } from "../facade/sniff.js";
import { bestMotor } from "../facade/confidence.js";
import { resolveChain } from "../facade/fallback.js";
import { missingReason } from "../facade/missingReasons.js";
import { suggestConfig } from "../facade/configSuggest.js";
import { rea_evm_selector, rea_wasm_exports, rea_wasm_decode } from "../rea-domains/wasm-evm/WasmEvmBridge.js";
import { rea_wasm_validate, rea_evm_disasm } from "../rea-domains/wasm-evm/EvmTools.js";
import { rea_cutter_funcs, rea_cutter_disasm, rea_cutter_xrefs, rea_cutter_strings, rea_cutter_decompile, rea_cutter_caps } from "../rea-domains/cutter/CutterBridge.js";
import { rea_ghidra_analyze, rea_ghidra_funcs, rea_ghidra_decompile, rea_ghidra_xrefs, rea_ghidra_strings, rea_ghidra_disasm, rea_ghidra_vt, rea_ghidra_trace } from "../rea-domains/ghidra/GhidraBridge.js";
import { rea_jadx_manifest, rea_jadx_classes, rea_jadx_decompile, rea_jadx_full, rea_jadx_methods, rea_jadx_xrefs, rea_jadx_read } from "../rea-domains/android/JadxBridge.js";
import { rea_apktool_decode, rea_apktool_info, rea_apktool_build, rea_apktool_framework, rea_apktool_caps } from "../rea-domains/android/ApktoolBridge.js";
import { rea_adb_devices, rea_adb_packages, rea_adb_install, rea_adb_logcat, rea_adb_screencap } from "../rea-domains/android/AdbBridge.js";
import { rea_dotnet_metadata, rea_dotnet_cil } from "../rea-domains/dotnet/ManagedInspector.js";
import { rea_r2_callgraph, rea_r2_esil, rea_r2_debug } from "../rea-domains/r2plus/R2Plus.js";
import { rea_frida_pause, rea_frida_resume, rea_frida_step, rea_frida_cond, rea_frida_stalker } from "../rea-domains/frida-plus/FridaPlus.js";
import { rea_browser_scenario, rea_browser_har_import, rea_browser_caps, rea_browser_nav, rea_browser_click, rea_browser_shot } from "../rea-domains/firmware-browser/BrowserBridge.js";
import { rea_process_run, rea_process_compare, rea_process_caps } from "../rea-domains/firmware-browser/ProcessCapture.js";
import { rea_js_sourcemap, rea_js_bundle } from "../rea-domains/javascript/JsAnalyzer.js";
import { rea_diff_match, rea_diff_summary } from "../rea-domains/javascript/BinaryDiff.js";
import { rea_recon_funcs, rea_recon_harness, rea_recon_tag } from "../rea-domains/javascript/ReconHarness.js";
import { rea_crash_append, rea_crash_timeline, rea_crash_hint } from "../rea-domains/wasm-evm/CrashTimeline.js";
import { rea_dos_mz, rea_dos_int21, rea_mips_funcs, rea_mips_psp_profile } from "../rea-domains/wasm-evm/DosMipsBridge.js";
import { rea_aot_detect, rea_aot_objc, rea_aot_swift, rea_aot_profile } from "../rea-domains/wasm-evm/NativeAotBridge.js";
import { rea_go_module, rea_go_version, rea_pwn_elf_layout, rea_pwn_gadgets } from "../rea-domains/wasm-evm/GoPwnBridge.js";
import { rea_firmware_extract, rea_firmware_handoff, rea_firmware_caps } from "../rea-domains/firmware-browser/FirmwareBridge.js";
import { buildEvidenceBundle, verifyEvidenceBundle } from "../facade/evidenceBundle.js";
import { build_reconstruction_obligation_ledger, advanceObligation, verifyObligationChain, closeObligationLedger } from "../facade/obligationLedger.js";

const P = z.object({ path: z.string().min(1) });
const J = z.object({ text: z.string().min(1) });
const O = z.object({});
const B64 = z.object({ b64: z.string().min(1) });
const ADDR = z.object({ path: z.string().min(1), addr: z.string().min(1) });

type C = { type: "text"; text: string };
function ok(v: unknown): { content: C[] } {
  return { content: [{ type: "text", text: JSON.stringify(v) }] };
}
function kapı(tool: string, neden: string): { content: C[]; isError: true } {
  return { content: [{ type: "text", text: JSON.stringify({ ok: false, code: "capability_unsupported", tool, reason: neden }) }], isError: true as const };
}
function jsonParse<T>(tool: string, s: string): { v: T } | { err: ReturnType<typeof kapı> } {
  try {
    return { v: JSON.parse(s) as T };
  } catch {
    return { err: kapı(tool, "geçersiz JSON girdisi") };
  }
}
const b64 = (s: string): Uint8Array => Buffer.from(s, "base64");

type H = (a: any) => Promise<unknown> | unknown;
const R: Array<[string, string, any, H]> = [
  ["rea_evm_selector", "EVM 4-byte selector (keccak, offline).", z.object({ sig: z.string().min(1) }), (a) => rea_evm_selector(a.sig)],
  ["rea_wasm_exports", "WAT export listesi (offline).", z.object({ wat: z.string().min(1) }), (a) => rea_wasm_exports(a.wat)],
  ["rea_wasm_decode", "WASM/WAT çözümleme (wabt).", P, (a) => rea_wasm_decode(a.path)],
  ["rea_wasm_validate", "WASM doğrulama (wasm-validate).", P, (a) => rea_wasm_validate(a.path)],
  ["rea_evm_disasm", "EVM bytecode disassembly (offline).", z.object({ hex: z.string().min(1) }), (a) => rea_evm_disasm(a.hex)],
  ["rea_sniff", "Dosya tip + motor önerisi (magic-byte).", z.object({ b64dosya: z.string().min(1) }), (a) => sniffBytes(b64(a.b64dosya))],
  ["rea_best_motor", "Hedef tip için en iyi motor (skor).", z.object({ tip: z.string().min(1), adaylar: z.array(z.string()).min(1) }), (a) => bestMotor(a.tip, a.adaylar)],
  ["rea_fallback", "Birincil yoksa yedek zincir.", z.object({ birincil: z.string().min(1), mevcut: z.array(z.string()) }), (a) => resolveChain(a.birincil, new Set(a.mevcut))],
  ["rea_missing_reason", "Eksik araç + kur komutu.", z.object({ eksik: z.string().min(1), platform: z.string().optional() }), (a) => missingReason(a.eksik, (a.platform ?? process.platform))],
  ["rea_config_suggest", "Bulunan araçlara MCP config snippet.", z.object({ bulunan: z.array(z.string()) }), (a) => ({ snippet: suggestConfig(a.bulunan) })],
  ["rea_ghidra_analyze", "Ghidra headless import+analiz.", P, (a) => rea_ghidra_analyze(a.path)],
  ["rea_ghidra_funcs", "Ghidra fonksiyon listesi.", P, (a) => rea_ghidra_funcs(a.path)],
  ["rea_ghidra_decompile", "Ghidra sözde-kod.", ADDR, (a) => rea_ghidra_decompile(a.path, a.addr)],
  ["rea_ghidra_xrefs", "Ghidra xref listesi.", ADDR, (a) => rea_ghidra_xrefs(a.path, a.addr)],
  ["rea_ghidra_strings", "Ghidra string listesi.", P, (a) => rea_ghidra_strings(a.path)],
  ["rea_ghidra_disasm", "Ghidra disassembly.", ADDR, (a) => rea_ghidra_disasm(a.path, a.addr)],
  ["rea_ghidra_vt", "İki binary fonksiyon diff (version tracking).", z.object({ eski: z.string().min(1), yeni: z.string().min(1) }), (a) => rea_ghidra_vt(a.eski, a.yeni)],
  ["rea_ghidra_trace", "Snapshot -> Ghidra Trace import.", z.object({ path: z.string().min(1), kayit: z.string().min(1) }), (a) => rea_ghidra_trace(a.path, a.kayit)],
  ["rea_cutter_funcs", "Cutter/rizin fonksiyon listesi.", P, (a) => rea_cutter_funcs(a.path)],
  ["rea_cutter_disasm", "Cutter/rizin disassembly.", ADDR, (a) => rea_cutter_disasm(a.path, a.addr)],
  ["rea_cutter_xrefs", "Cutter/rizin xref listesi.", ADDR, (a) => rea_cutter_xrefs(a.path, a.addr)],
  ["rea_cutter_strings", "Cutter/rizin string listesi.", P, (a) => rea_cutter_strings(a.path)],
  ["rea_cutter_decompile", "Cutter sözde-derleme.", ADDR, (a) => rea_cutter_decompile(a.path, a.addr)],
  ["rea_cutter_caps", "Cutter/rizin yetenek yoklaması.", O, () => rea_cutter_caps()],
  ["rea_jadx_manifest", "APK manifest özeti.", z.object({ apk_path: z.string().min(1) }), (a) => rea_jadx_manifest(a.apk_path)],
  ["rea_jadx_classes", "APK sınıf listesi.", z.object({ apk_path: z.string().min(1) }), (a) => rea_jadx_classes(a.apk_path)],
  ["rea_jadx_decompile", "APK tek sınıf decompile.", z.object({ apk_path: z.string().min(1), sinif: z.string().min(1), out: z.string().min(1) }), (a) => rea_jadx_decompile(a.apk_path, a.sinif, a.out)],
  ["rea_jadx_full", "APK tam decompile.", z.object({ apk_path: z.string().min(1), out: z.string().min(1) }), (a) => rea_jadx_full(a.apk_path, a.out)],
  ["rea_jadx_methods", "Decompile çıktıda method listesi.", z.object({ dir: z.string().min(1) }), (a) => rea_jadx_methods(a.dir)],
  ["rea_jadx_xrefs", "Decompile çıktıda terim arama.", z.object({ dir: z.string().min(1), terim: z.string().min(1) }), (a) => rea_jadx_xrefs(a.dir, a.terim)],
  ["rea_jadx_read", "Decompile sınıf okuma (400 satır).", z.object({ dir: z.string().min(1), sinif: z.string().min(1) }), (a) => rea_jadx_read(a.dir, a.sinif)],
  ["rea_apktool_decode", "APK decode (resource).", z.object({ apk_path: z.string().min(1), out: z.string().min(1) }), (a) => rea_apktool_decode(a.apk_path, a.out)],
  ["rea_apktool_info", "apktool+aapt2 sürümleri.", O, () => rea_apktool_info()],
  ["rea_apktool_build", "Decode dizinden APK rebuild.", z.object({ dir: z.string().min(1), out: z.string().min(1) }), (a) => rea_apktool_build(a.dir, a.out)],
  ["rea_apktool_framework", "Framework APK kurulumu.", P, (a) => rea_apktool_framework(a.path)],
  ["rea_apktool_caps", "apktool yetenek yoklaması.", O, () => rea_apktool_caps()],
  ["rea_adb_devices", "Bağlı cihaz listesi.", O, () => rea_adb_devices()],
  ["rea_adb_packages", "Yüklü paket listesi.", z.object({ seri: z.string().optional(), filtre: z.string().optional() }), (a) => rea_adb_packages(a.seri, a.filtre)],
  ["rea_adb_install", "APK cihaza kurulum.", z.object({ apk_path: z.string().min(1), seri: z.string().optional() }), (a) => rea_adb_install(a.apk_path, a.seri)],
  ["rea_adb_logcat", "Cihaz logcat dökümü.", z.object({ seri: z.string().optional() }), (a) => rea_adb_logcat(a.seri)],
  ["rea_adb_screencap", "Cihaz ekran görüntüsü.", z.object({ seri: z.string().optional(), out: z.string().min(1) }), (a) => rea_adb_screencap(a.seri, a.out)],
  ["rea_dotnet_metadata", "Assembly metadata okuma.", P, (a) => rea_dotnet_metadata(a.path)],
  ["rea_dotnet_cil", "CIL method dökümü (dnfile).", z.object({ path: z.string().min(1), filtre: z.string().optional() }), (a) => rea_dotnet_cil(a.path, a.filtre)],
  ["rea_r2_callgraph", "r2 fonksiyon çağrı grafı.", P, (a) => rea_r2_callgraph(a.path)],
  ["rea_r2_esil", "r2 ESIL emülasyon regs.", ADDR, (a) => rea_r2_esil(a.path, a.addr)],
  ["rea_r2_debug", "r2 toplu debug (bp+regs).", ADDR, (a) => rea_r2_debug(a.path, a.addr)],
  ["rea_frida_pause", "Hedef süreç duraklatma (NtSuspend).", z.object({ pid: z.number().int().positive() }), (a) => rea_frida_pause(a.pid)],
  ["rea_frida_resume", "Duraklatılmış süreci devam ettirme.", z.object({ pid: z.number().int().positive() }), (a) => rea_frida_resume(a.pid)],
  ["rea_frida_step", "Sonraki-komut emülasyonu.", z.object({ pid: z.number().int().positive(), adres: z.string().optional() }), (a) => rea_frida_step(a.pid, a.adres)],
  ["rea_frida_cond", "Koşullu breakpoint.", z.object({ pid: z.number().int().positive(), adres: z.string().min(1), kosul: z.string().min(1) }), (a) => rea_frida_cond(a.pid, a.adres, a.kosul)],
  ["rea_frida_stalker", "Stalker çağrı izleme.", z.object({ pid: z.number().int().positive(), sure_ms: z.number().int().positive().optional() }), (a) => rea_frida_stalker(a.pid, undefined, a.sure_ms)],
  ["rea_browser_nav", "Sayfa açma + başlık.", z.object({ url: z.string().min(1) }), (a) => rea_browser_nav(a.url)],
  ["rea_browser_click", "Tıklama + sonrası durum.", z.object({ url: z.string().min(1), selector: z.string().min(1) }), (a) => rea_browser_click(a.url, a.selector)],
  ["rea_browser_shot", "Tam sayfa ekran görüntüsü.", z.object({ url: z.string().min(1), out: z.string().min(1) }), (a) => rea_browser_shot(a.url, a.out)],
  ["rea_browser_har_import", "HAR içe aktarma.", P, (a) => rea_browser_har_import(a.path)],
  ["rea_browser_scenario", "Senaryo kaydı.", J, (a) => rea_browser_scenario(JSON.parse(a.text))],
  ["rea_browser_caps", "Browser yetenek yoklaması.", O, () => rea_browser_caps()],
  ["rea_process_run", "Süreç koşusu kaydı.", z.object({ cmd: z.string().min(1) }), (a) => rea_process_run(a.cmd)],
  ["rea_process_compare", "Pipe/PTY karşılaştırma.", z.object({ cmd: z.string().min(1) }), (a) => rea_process_compare(a.cmd)],
  ["rea_process_caps", "Süreç yetenek yoklaması.", O, () => rea_process_caps()],
  ["rea_js_sourcemap", "Source-map çözümleme.", J, (a) => rea_js_sourcemap(a.text)],
  ["rea_js_bundle", "Bundle özeti.", J, (a) => rea_js_bundle(a.text)],
  ["rea_diff_match", "Fonksiyon eşleme (JSON diziler).", z.object({ a: z.string().min(1), b: z.string().min(1) }), (a) => {
    const pa = jsonParse<any[]>("rea_diff_match", a.a); if ("err" in pa) return pa.err;
    const pb = jsonParse<any[]>("rea_diff_match", a.b); if ("err" in pb) return pb.err;
    return rea_diff_match(pa.v, pb.v);
  }],
  ["rea_diff_summary", "Eklenen/silinen özeti.", z.object({ a: z.string().min(1), b: z.string().min(1) }), (a) => {
    const pa = jsonParse<any[]>("rea_diff_summary", a.a); if ("err" in pa) return pa.err;
    const pb = jsonParse<any[]>("rea_diff_summary", a.b); if ("err" in pb) return pb.err;
    return rea_diff_summary(pa.v, pb.v);
  }],
  ["rea_recon_funcs", "Pseudo-code fonksiyon listesi.", J, (a) => rea_recon_funcs(a.text)],
  ["rea_recon_harness", "C harness iskeleti.", J, (a) => rea_recon_harness(a.text)],
  ["rea_recon_tag", "Vaka etiketi.", O, () => rea_recon_tag()],
  ["rea_crash_append", "Crash olayı ekleme.", z.object({ olaylar: z.string().min(1), olay: z.string().min(1) }), (a) => {
    const pa = jsonParse<any[]>("rea_crash_append", a.olaylar); if ("err" in pa) return pa.err;
    const pb = jsonParse<any>("rea_crash_append", a.olay); if ("err" in pb) return pb.err;
    return rea_crash_append(pa.v, pb.v);
  }],
  ["rea_crash_timeline", "Crash timeline.", z.object({ olaylar: z.string().min(1) }), (a) => {
    const p = jsonParse<any[]>("rea_crash_timeline", a.olaylar); if ("err" in p) return p.err;
    return rea_crash_timeline(p.v);
  }],
  ["rea_crash_hint", "Crash ipucu.", z.object({ olaylar: z.string().min(1) }), (a) => {
    const p = jsonParse<any[]>("rea_crash_hint", a.olaylar); if ("err" in p) return p.err;
    return rea_crash_hint(p.v);
  }],
  ["rea_dos_mz", "MZ başlık kontrolü.", B64, (a) => rea_dos_mz(b64(a.b64))],
  ["rea_dos_int21", "INT21 çağrı taraması.", B64, (a) => rea_dos_int21(b64(a.b64))],
  ["rea_mips_funcs", "MIPS fonksiyon ön-tarama.", B64, (a) => rea_mips_funcs(b64(a.b64))],
  ["rea_mips_psp_profile", "MIPS/PSP profili.", B64, (a) => rea_mips_psp_profile(b64(a.b64))],
  ["rea_aot_detect", "NativeAOT sinyali.", z.object({ b64dosya: z.string().min(1), metin: z.string().optional() }), (a) => rea_aot_detect(b64(a.b64dosya), a.metin ?? "")],
  ["rea_aot_objc", "ObjC dispatch izleri.", J, (a) => rea_aot_objc(a.text)],
  ["rea_aot_swift", "Swift dispatch izleri.", J, (a) => rea_aot_swift(a.text)],
  ["rea_aot_profile", "AOT profili.", z.object({ b64dosya: z.string().min(1), metin: z.string().optional() }), (a) => rea_aot_profile(b64(a.b64dosya), a.metin ?? "")],
  ["rea_go_module", "Go modül bilgisi.", J, (a) => rea_go_module(a.text)],
  ["rea_go_version", "Go sürüm izi.", J, (a) => rea_go_version(a.text)],
  ["rea_pwn_elf_layout", "ELF layout + mitigation.", P, (a) => rea_pwn_elf_layout(a.path)],
  ["rea_pwn_gadgets", "Gadget ipucu.", J, (a) => rea_pwn_gadgets(a.text)],
  ["rea_firmware_extract", "Firmware çıkarma.", P, (a) => rea_firmware_extract(a.path)],
  ["rea_firmware_handoff", "Firmware handoff notu.", z.object({ path: z.string().min(1), neden: z.string().min(1) }), (a) => rea_firmware_handoff(a.path, a.neden)],
  ["rea_firmware_caps", "Firmware yetenek yoklaması.", O, () => rea_firmware_caps()],
  ["rea_evidence_bundle", "Kanıt paketi derleme.", z.object({ ogeler: z.string().min(1), sakli: z.string().min(1) }), (a) => {
    const pa = jsonParse<any[]>("rea_evidence_bundle", a.ogeler); if ("err" in pa) return pa.err;
    const pb = jsonParse<any[]>("rea_evidence_bundle", a.sakli); if ("err" in pb) return pb.err;
    return buildEvidenceBundle(pa.v, pb.v);
  }],
  ["rea_evidence_verify", "Kanıt paketi doğrulama.", J, (a) => {
    const p = jsonParse<any>("rea_evidence_verify", a.text); if ("err" in p) return p.err;
    return { ok: verifyEvidenceBundle(p.v) };
  }],
  ["rea_obligation_ledger", "Defter kurma.", z.object({ bulgular: z.array(z.string()).min(1), tools_sha256: z.string().min(1), evidence_digest: z.string().min(1) }), (a) => build_reconstruction_obligation_ledger(a.bulgular, { tools_sha256: a.tools_sha256, evidence_digest: a.evidence_digest })],
  ["rea_obligation_advance", "Halka ilerletme.", z.object({ defter: z.string().min(1), bulgu: z.string().min(1), kod: z.string().min(1) }), (a) => {
    const p = jsonParse<any>("rea_obligation_advance", a.defter); if ("err" in p) return p.err;
    return advanceObligation(p.v, a.bulgu, a.kod);
  }],
  ["rea_obligation_verify", "Zincir doğrulama.", J, (a) => {
    const p = jsonParse<any>("rea_obligation_verify", a.text); if ("err" in p) return p.err;
    return verifyObligationChain(p.v);
  }],
  ["rea_obligation_close", "Defter mühürleme.", J, (a) => {
    const p = jsonParse<any>("rea_obligation_close", a.text); if ("err" in p) return p.err;
    return closeObligationLedger(p.v);
  }],
];

export function registerReaTools(server: McpServer): void {
  for (const [ad, aciklama, sema, is] of R) {
    const isim = qualifyReaTool(ad);
    server.registerTool(isim, { description: aciklama, inputSchema: sema }, async (args: unknown) => ok(await is(args as any)));
  }
}
