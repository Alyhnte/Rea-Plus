// rea-plus merkezi rea kayıtları: 30 araç tek döngüden geçer (stub).
// Conduit 30 ismi donduruldu; rea kökenliler qualifyReaTool ile korunur.
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { qualifyReaTool } from "../facade/toolNamespace.js";

// Ortak zod girdileri: her araç en az bir şema taşır.
const P = z.object({ path: z.string().min(1) }); // dosya yolu girdisi
const J = z.object({ text: z.string().min(1) }); // metin/pseudo girdisi
const O = z.object({}); // girdisiz yetenek yoklaması
const Sig = z.object({ sig: z.string().min(1) }); // EVM imza girdisi
const Wat = z.object({ wat: z.string().min(1) }); // WAT metin girdisi
const Apk = z.object({ apk_path: z.string().min(1) }); // APK yolu girdisi
const Cmd = z.object({ cmd: z.string().min(1) }); // komut girdisi

// Hata zarfı: desteklenmeyen yetenek tek tip döner.
function kapı(tool: string, neden: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: false, code: "capability_unsupported", tool, reason: neden }) }], isError: true as const };
}

// Merkezi kayıt: eksik bağlama capability_unsupported verir, gerçek iş WP4'te.
export function registerReaTools(server: McpServer): void {
  // Liste: ad + açıklama + zod şema (hepsi stub).
  const a: Array<[string, string, any]> = [
    ["rea_dotnet_metadata", "DOTNET metadata başlık okuma (stub).", P],
    ["rea_dotnet_cil", "CIL döküm iskeleti (stub).", P],
    ["rea_js_sourcemap", "Source-map çözümleme (stub).", J],
    ["rea_js_bundle", "Bundle özet çıkarma (stub).", J],
    ["rea_js_diff", "Bundle satır farkı (stub).", J],
    ["rea_js_recon", "JS keşif özeti (stub).", J],
    ["rea_diff_match", "Sürümler arası fonksiyon eşleme (stub).", J],
    ["rea_diff_summary", "Eklenen/silinen özeti (stub).", J],
    ["rea_recon_harness", "Pseudocode C harness iskeleti (stub).", J],
    ["rea_crash_timeline", "Crash olay timeline (stub).", J],
    ["rea_dos_mz", "MZ başlık kontrolü (stub).", P],
    ["rea_mips_funcs", "MIPS JAL ön-tarama (stub).", P],
    ["rea_aot_detect", "NativeAOT sinyal tarama (stub).", P],
    ["rea_firmware_extract", "Firmware çıkarma (yalnız Linux, stub).", P],
    ["rea_browser_har_import", "HAR içe aktarma (stub).", P],
    ["rea_browser_scenario", "Tarayıcı senaryo kaydı (stub).", J],
    ["rea_process_run", "Süreç koşusu kaydı (stub).", Cmd],
    ["rea_process_compare", "Pipe/PTY karşılaştırma (stub).", Cmd],
    ["rea_process_caps", "Süreç yetenek yoklaması (stub).", O],
    ["rea_wasm_decode", "WASM/WAT çözümleme (stub).", P],
    ["rea_wasm_exports", "WAT export listesi (stub).", Wat],
    ["rea_evm_selector", "EVM 4-byte selector (stub).", Sig],
    ["rea_jadx_manifest", "APK manifest özeti (stub).", Apk],
    ["rea_jadx_classes", "APK sınıf listesi (stub).", Apk],
    ["rea_adb_devices", "Bağlı cihaz listesi (stub).", O],
    ["rea_adb_packages", "Yüklü paket listesi (stub).", O],
    ["rea_evidence_bundle", "Kanıt paketi derleme (stub).", O],
    ["rea_obligation_ledger", "Yükümlülük defteri kurma (stub).", O],
    ["rea_obligation_advance", "Defter halkası ilerletme (stub).", O],
    ["rea_obligation_verify", "Zincir doğrulama (stub).", O],
  ];
  // Döngü: prefix + kayıt + stub yanıt (çift kayıt yok).
  for (const [ad, aciklama, sema] of a) {
    const isim = qualifyReaTool(ad); // frozen çakışma koruması
    server.registerTool(isim, { description: aciklama, inputSchema: sema }, async () => kapı(isim, "bağlama yok (stub)"));
  }
}
