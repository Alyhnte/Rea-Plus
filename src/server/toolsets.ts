// rea-plus toolset profilleri (REA_TOOLSETS): kayit aninda arac altkumesi secimi.
// Kurallar:
// - REA_TOOLSETS tanimsiz/bos veya "all" ise filtre YOKTUR: mevcut 171 arac aynen kaydolur.
// - Virgulle birden cok profil yazilabilir; sonuc profillerin birlesimidir (all varsa baskindir).
// - Bilinmeyen/bos profil parcasi sessizce all'a DUSMEZ; parseToolsets acik hata firlatir ve
//   sunucu kurulumu (createReaPlusMcpServer / main) bu hatayla durur.
// - Profiller isim deseni/regex ile DEGIL, asagidaki acik isim listeleriyle tanimlidir; her
//   grubun basindaki yorum hangi aracin neden o profilde oldugunu soyler. Liste disi bir arac
//   (yeni eklenen dahil) hicbir ozel profilde gorunmez; yalniz all'da vardir (fail-closed).
// - Filtre yalniz registerTool cagrilarina uygulanir; resources/prompts etkilenmez.
// Arac adlari gercek kayitlardan alinmistir: conduit 30 (src/conduit-core) + rea 141
// (src/server/registerReaTools.ts R tablosu). tests/toolsets.test.mjs her ismin gercek
// tools/list ciktisinda karsiligi oldugunu ve sayilarin deterministikligini dogrular.
import type { McpServer } from "@modelcontextprotocol/server";

export const TOOLSET_NAMES = ["all", "minimal", "static", "android", "dotnet", "web", "debug"] as const;
export type ToolsetName = (typeof TOOLSET_NAMES)[number];

// minimal'in da kendisi olan cekirdek triyaj kumesi; her ozel profil bunu icerir cunku
// hedef tipi/motor secimi (sniff/investigate/best_motor) ve eksik arac tanisi olmadan
// hicbir alan akisi guvenle baslayamaz. Hicbir uyesi motor/cihaz/surec calistirmaz.
const CEKIRDEK: readonly string[] = [
  "health", // conduit: kopru canliligi, motora dokunmaz
  "prerequisites", // conduit: dis program onkosul yoklamasi
  "rea_sniff", // magic-byte ile dosya tipi + motor onerisi
  "rea_investigate", // sniff+skor+yedek zinciriyle otomatik sorusturma plani
  "rea_best_motor", // hedef tipi icin aday motor skorlamasi
  "rea_fallback", // birincil motor yoksa yedek zinciri
  "rea_missing_reason", // eksik arac nedeni + kurulum komutu
  "rea_config_suggest", // bulunan araclara gore MCP config onerisi
];

export const TOOLSETS: Record<Exclude<ToolsetName, "all">, readonly string[]> = {
  // minimal: yalniz cekirdek triyaj (8 arac). Kucuk baglamli istemcilerde kesif yuzeyi.
  minimal: CEKIRDEK,

  // static: ornegi CALISTIRMADAN yapilan tum inceleme (disassembly, decompile, baslik,
  // string/xref, format profilleri, unpack ve yeniden-insa defteri). Canli debug, cihaz,
  // tarayici ve surec araclari bilerek disaridadir.
  static: [
    ...CEKIRDEK,
    // conduit radare2 statik oturumu: open_target/disassemble vb. session_id ister;
    // events_pull canli olay tamponudur, o yuzden yalniz debug profilindedir.
    "session_open", "session_close", "session_list",
    "static_info", "open_target", "close_target", "disassemble", "get_cfg", "xrefs", "strings", "dump",
    "explain", // verilmis asm penceresinin aciklamasi; debug'da da vardir (canli oturumu confirm ile okuyabilir)
    // Ghidra headless statik analiz; ghidra_trace'in hedefi statik Ghidra veritabani oldugu icin buradadir.
    "rea_ghidra_analyze", "rea_ghidra_funcs", "rea_ghidra_decompile", "rea_ghidra_xrefs",
    "rea_ghidra_strings", "rea_ghidra_disasm", "rea_ghidra_vt", "rea_ghidra_trace",
    // Cutter/rizin statik analiz + yetenek yoklamasi.
    "rea_cutter_funcs", "rea_cutter_disasm", "rea_cutter_xrefs", "rea_cutter_strings",
    "rea_cutter_decompile", "rea_cutter_caps",
    // r2 cagri grafigi ve ESIL emulasyonu cevrimdisi/statiktir; rea_r2_debug canli bp/regs oldugu icin debug'dadir.
    "rea_r2_callgraph", "rea_r2_esil",
    // PE/ELF baslik ve tip bilgisi okuma (salt-okunur format incelemesi).
    "rea_pe_info", "rea_pe_imports", "rea_pe_sections",
    "rea_pdb_yolu", "rea_dwarf_ozet", "rea_typedef_oner",
    // WASM ve EVM bytecode'unun cevrimdisi cozumu (web profilinde de vardir: tarayici WASM'i).
    "rea_wasm_exports", "rea_wasm_decode", "rea_wasm_validate", "rea_wasm_sections", "rea_wasm_imports",
    "rea_evm_selector", "rea_evm_disasm", "rea_evm_stats", "rea_evm_selectors",
    // Format/platform profilleri: DOS/MIPS, AOT izleri, Go, ELF pwn duzeni, Mach-O, HAP, Flutter.
    "rea_dos_mz", "rea_dos_int21", "rea_mips_funcs", "rea_mips_psp_profile", "rea_dos_com", "rea_dos_psp",
    "rea_aot_detect", "rea_aot_objc", "rea_aot_swift", "rea_aot_profile",
    "rea_go_module", "rea_go_version", "rea_pwn_elf_layout", "rea_pwn_gadgets",
    "rea_apple_macho", "rea_apple_plist", "rea_apple_bundle",
    "rea_hap_liste", "rea_hap_manifest",
    "rea_flutter_scan", "rea_flutter_payload", // android'de de vardir: Flutter APK yuk izleri
    // Packer cozme akisi (dosya uzerinde, ornek calistirilmadan).
    "rea_upx_info", "rea_upx_unpack", "rea_unpack_try", "rea_unpack_hunt",
    // Iki surum/derleme arasi fonksiyon esleme ve yeniden-insa iskeleti.
    "rea_diff_match", "rea_diff_summary", "rea_recon_funcs", "rea_recon_harness", "rea_recon_tag",
    // Firmware imajinin statik cikarimi ve devri.
    "rea_firmware_extract", "rea_firmware_handoff", "rea_firmware_caps",
    // Dis decompiler kopruleri (istek/sorgu uretir; hedef ornegi calistirmaz).
    "rea_hopper_istek", "rea_hopper_tara", "rea_ida_idb", "rea_ida_flirt", "rea_jeb_sorgu",
    // Repo duzeyinde tip taramasi + analiz plani.
    "rea_scan_repo",
    // Kanit paketi ve yeniden-insa yukumluk defteri: statik bulgularin kayit/duzeltme katmani.
    "rea_evidence_bundle", "rea_evidence_verify",
    "rea_obligation_ledger", "rea_obligation_advance", "rea_obligation_verify", "rea_obligation_close",
    "rea_readiness", "rea_coverage",
  ],

  // android: APK'nin statik acilimi (jadx/apktool) + gercek cihaz etkilesimi (adb).
  // adb ucleri canli cihaz gerektirir; bu profil onlarsiz eksik kalir. HAP (HarmonyOS)
  // Android degildir, static'tedir.
  android: [
    ...CEKIRDEK,
    // jadx: manifestten tek-sinif decompile'a APK kod okuma zinciri.
    "rea_jadx_manifest", "rea_jadx_classes", "rea_jadx_decompile", "rea_jadx_full",
    "rea_jadx_methods", "rea_jadx_xrefs", "rea_jadx_read",
    // apktool: kaynak decode/rebuild ve framework yonetimi.
    "rea_apktool_decode", "rea_apktool_info", "rea_apktool_build", "rea_apktool_framework", "rea_apktool_caps",
    // adb: bagli cihazda kesif, kurulum, log ve ekran goruntusu.
    "rea_adb_devices", "rea_adb_packages", "rea_adb_install", "rea_adb_logcat", "rea_adb_screencap",
    // Flutter APK'larinda Dart yuk izleri (static'te de vardir: genel binary taramasi olarak).
    "rea_flutter_scan", "rea_flutter_payload",
  ],

  // dotnet: yonetilen (managed) PE incelemesi: metadata/CIL okuma, ILSpy decompile,
  // managed uye karsilastirma ve NativeAOT tespiti. PE basliklari + PDB yolu, hedefin
  // yonetilen oldugunu dogrulamak icin dahildir; saf native PE akisi static'tedir.
  dotnet: [
    ...CEKIRDEK,
    "rea_dotnet_metadata", "rea_dotnet_cil", "rea_ilspy_decompile",
    "rea_managed_compare", "rea_managed_verify", "rea_managed_import",
    // NativeAOT tespiti/profili (.NET AOT derlemesi); objc/swift dispatch izleri genel oldugu icin static'tedir.
    "rea_aot_detect", "rea_aot_profile",
    "rea_pe_info", "rea_pe_imports", "rea_pe_sections", "rea_pdb_yolu",
  ],

  // web: tarayici tarafi inceleme: sayfa otomasyonu, depolama/konsol gozlemi, ag
  // yakalama (HAR), JS bundle/source-map cozumu ve tarayicida kosan WASM modulleri.
  // EVM araclari zincir bytecode'udur, web degildir; static'tedir.
  web: [
    ...CEKIRDEK,
    "rea_browser_nav", "rea_browser_click", "rea_browser_shot",
    "rea_browser_har_import", "rea_browser_scenario", "rea_browser_caps",
    "rea_storage_dump", "rea_console_yakala",
    "rea_net_capture", // debug'da da vardir: canli davranis sirasinda ag yakalama
    "rea_js_sourcemap", "rea_js_bundle", "rea_js_require", "rea_js_export_shape",
    "rea_wasm_exports", "rea_wasm_decode", "rea_wasm_validate", "rea_wasm_sections", "rea_wasm_imports",
  ],

  // debug: CANLI hedefle etkilesim: conduit debugger cekirdegi, Frida enstrumantasyonu,
  // r2 canli debug, surec kosusu/davranis/crash kaydi. Bu profil yalniz VM/CI'da
  // kullanilmalidir (bkz. capabilities-safety resource'u). Statik decompiler'lar disaridadir.
  debug: [
    ...CEKIRDEK,
    // conduit oturum + olay tamponu: tum debug_* cagrilari session_id ile calisir,
    // durma olaylari events_pull ile okunur.
    "session_open", "session_close", "session_list", "events_pull",
    "debug_open", "debug_attach", "debug_close", "debug_state", "debug_breakpoint",
    "debug_continue", "debug_step", "debug_pause", "debug_registers", "debug_callstack",
    "debug_memory", "debug_code", "debug_thread", "debug_plugin", "debug_time",
    "explain", // static'te de vardir; burada durmus hedefteki asm penceresini aciklamak icin
    // Frida: surec duraklatma/adimlama, kosullu kirilma, Stalker ve API izleme.
    "rea_frida_pause", "rea_frida_resume", "rea_frida_step", "rea_frida_cond", "rea_frida_stalker", "rea_frida_api",
    "rea_r2_debug", // r2 uzerinden toplu canli bp+regs
    // Surec kosusu kaydi ve kosu oncesi/sonrasi dosya sistemi farki.
    "rea_process_run", "rea_process_compare", "rea_process_caps", "rea_fs_snapshot", "rea_fs_diff",
    // Calisma zamani davranis raporu: API olaylarindan dosya/registry/ag izleri.
    "rea_behavior_timeline", "rea_behavior_full", "rea_dosya_izi", "rea_registry_izi", "rea_net_capture",
    // Crash olaylarinin kaydi, zaman cizelgesi ve ipucu cikarimi.
    "rea_crash_append", "rea_crash_timeline", "rea_crash_hint", "rea_crash_kayit_parse", "rea_crash_ozet",
  ],
};

export interface ToolsetSelection {
  /** Ayristirilmis, tekrarsiz profil adlari (girilen sirada). */
  names: ToolsetName[];
  /** null = filtre yok (all). Aksi halde yalniz bu isimler kaydolur. */
  allowedTools: ReadonlySet<string> | null;
}

const GECERLI = TOOLSET_NAMES.join(", ");

/** REA_TOOLSETS degerini ayristirir; bilinmeyen/bos parcada acik hata firlatir. */
export function parseToolsets(raw: string | undefined): ToolsetSelection {
  if (raw === undefined || raw.trim() === "") return { names: ["all"], allowedTools: null };
  const parcalar = raw.split(",").map((p) => p.trim().toLowerCase());
  if (parcalar.some((p) => p === "")) {
    throw new Error(`REA_TOOLSETS gecersiz: bos profil parcasi var ("${raw}"). Gecerli profiller: ${GECERLI}.`);
  }
  const bilinmeyen = parcalar.filter((p) => !(TOOLSET_NAMES as readonly string[]).includes(p));
  if (bilinmeyen.length > 0) {
    throw new Error(`REA_TOOLSETS bilinmeyen profil: ${bilinmeyen.map((b) => `"${b}"`).join(", ")}. Gecerli profiller: ${GECERLI}.`);
  }
  const names = [...new Set(parcalar)] as ToolsetName[];
  if (names.includes("all")) return { names, allowedTools: null }; // all baskindir: filtre yok
  const allowedTools = new Set<string>();
  for (const ad of names) for (const arac of TOOLSETS[ad as Exclude<ToolsetName, "all">]) allowedTools.add(arac);
  return { names, allowedTools };
}

export function toolsetSelectionFromEnv(env: NodeJS.ProcessEnv = process.env): ToolsetSelection {
  return parseToolsets(env.REA_TOOLSETS);
}

/**
 * Kayit fonksiyonunu, server.registerTool'u gecici olarak filtreleyen bir sarmalayiciyla
 * calistirir. allowedTools null ise hicbir seye dokunulmaz (mevcut davranis birebir).
 * Gecirilen cagrilar Reflect.apply ile GERCEK server `this` baglaminda iletilir; sarmalayici
 * ornek uzerindeki golge ozellik olarak kurulur ve finally'de eski haline dondurulur,
 * boylece resources/prompts kayitlari ve sonraki kullanimlar etkilenmez.
 * Elenen aracin kayit cagrisi hic yapilmaz (handler'i da kurulmaz); cagiranlar donus
 * degerini kullanmadigi icin undefined doner.
 */
export function registerWithToolsetFilter(
  server: McpServer,
  allowedTools: ReadonlySet<string> | null,
  register: () => void,
): void {
  if (allowedTools === null) {
    register();
    return;
  }
  const hedef = server as unknown as { registerTool: (...args: unknown[]) => unknown };
  const gercek = hedef.registerTool;
  const kendiOzelligi = Object.prototype.hasOwnProperty.call(server, "registerTool");
  hedef.registerTool = (...args: unknown[]): unknown => {
    const ad = args[0];
    if (typeof ad === "string" && !allowedTools.has(ad)) return undefined;
    return Reflect.apply(gercek, server, args) as unknown;
  };
  try {
    register();
  } finally {
    if (kendiOzelligi) hedef.registerTool = gercek;
    else delete (server as unknown as Record<string, unknown>).registerTool;
  }
}
