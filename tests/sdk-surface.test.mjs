// sdk-surface.test.mjs: derlenmis sunucu uzerinde gercek stdio JSON-RPC yuzeyi.
// Kos: npm run build sonrasi `node --test tests/sdk-surface.test.mjs`.
// Kapsam: initialize, tools/list (191), outputSchema dalga 1+2+3+4+D/2+E/1
// (165 rea + 30 conduit = 191; semasiz yalniz 4 rea araci: string/dizi donen
// best_motor + fallback ve hic ok:true uretmeyen process_compare +
// pwn_elf_layout) + acik annotations kumeleri (rea: 81 readOnly, 24
// destructive, 59 openWorld; conduit: 4 readOnly, 13 destructive, 26
// openWorld; annotations tasiyan toplam 191/191), tools/call'da
// structuredContent == text JSON. Yalniz deterministik/offline
// araclar cagrilir; dosya gerektiren cagrilar tests/corpus fixture'larini
// salt-okunur kullanir. Canli arac, ag, alt surec yoklamasi ve dosya yazma
// yok (dotnet_metadata/browser_har_import yalniz tools/list'te dogrulanir).
// Conduit motor araclari yalniz kapidan once donen dallarla cagrilir
// (bilinmeyen session, confirm kapisi, acilmamis hedefin debug_state/static_info
// basarisi); canli debugger/r2 acilmaz. Surec timeout'ta oldurulur.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const ISTEK_ZAMAN_ASIMI_MS = 15_000;

let cocuk;
let sonrakiId = 1;
let tampon = "";
let stderrLog = "";
const bekleyenler = new Map();

function sureciOldur() {
  if (!cocuk || cocuk.exitCode !== null) return;
  if (process.platform === "win32") {
    try { spawnSync("taskkill", ["/PID", String(cocuk.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* zaten olu */ }
  } else {
    try { cocuk.kill("SIGKILL"); } catch { /* zaten olu */ }
  }
}

function satirAl(parca) {
  tampon += parca.toString("utf8");
  for (;;) {
    const i = tampon.indexOf("\n");
    if (i < 0) return;
    const satir = tampon.slice(0, i).trim();
    tampon = tampon.slice(i + 1);
    if (!satir) continue;
    let mesaj;
    try { mesaj = JSON.parse(satir); } catch { continue; } // JSON disi satir protokolun parcasi degil
    if (mesaj && typeof mesaj.id === "number" && bekleyenler.has(mesaj.id)) {
      const { resolve, reject, zamanlayici } = bekleyenler.get(mesaj.id);
      bekleyenler.delete(mesaj.id);
      clearTimeout(zamanlayici);
      if (mesaj.error) reject(new Error(`JSON-RPC hata: ${JSON.stringify(mesaj.error)}`));
      else resolve(mesaj.result);
    }
  }
}

function istek(method, params) {
  const id = sonrakiId++;
  return new Promise((resolve, reject) => {
    const zamanlayici = setTimeout(() => {
      bekleyenler.delete(id);
      sureciOldur();
      reject(new Error(`${method} zaman asimi (${ISTEK_ZAMAN_ASIMI_MS}ms). stderr: ${stderrLog.slice(-1000)}`));
    }, ISTEK_ZAMAN_ASIMI_MS);
    bekleyenler.set(id, { resolve, reject, zamanlayici });
    cocuk.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

function bildirim(method, params) {
  cocuk.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

async function tumuListele() {
  const araclar = [];
  let cursor;
  do {
    const sayfa = await istek("tools/list", cursor ? { cursor } : {});
    araclar.push(...sayfa.tools);
    cursor = sayfa.nextCursor;
  } while (cursor);
  return araclar;
}

function textJson(sonuc) {
  const metin = sonuc.content.find((c) => c.type === "text");
  assert.ok(metin, "text icerigi olmali");
  return { metin: metin.text, json: JSON.parse(metin.text) };
}

describe("sdk yuzeyi (stdio JSON-RPC)", () => {
  let araclar;

  before(async () => {
    const env = { ...process.env };
    delete env.REA_WORKSPACE_ROOT; // yol korumasi bu testin konusu degil
    delete env.REA_TOOLSETS; // tam 191 arac yuzeyi bu testin konusu
    cocuk = spawn(process.execPath, [join(kok, "dist", "server.js")], {
      cwd: kok,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    cocuk.stdout.on("data", satirAl);
    cocuk.stderr.on("data", (d) => { stderrLog = (stderrLog + d).slice(-4000); });
    cocuk.on("error", (e) => { stderrLog += String(e); });
    const baslat = await istek("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "sdk-surface-test", version: "0" },
    });
    assert.equal(baslat.serverInfo.name, "rea-plus");
    bildirim("notifications/initialized", {});
    araclar = await tumuListele();
  });

  after(async () => {
    for (const { reject, zamanlayici } of bekleyenler.values()) {
      clearTimeout(zamanlayici);
      reject(new Error("test bitti, surec kapatiliyor"));
    }
    bekleyenler.clear();
    if (!cocuk || cocuk.exitCode !== null) return;
    const cikis = new Promise((r) => cocuk.once("exit", r));
    try { cocuk.stdin.end(); } catch { /* kapali */ }
    const sonuc = await Promise.race([
      cikis.then(() => "cikti"),
      new Promise((r) => setTimeout(() => r("zaman"), 3000)),
    ]);
    if (sonuc !== "cikti") {
      sureciOldur();
      await Promise.race([cikis, new Promise((r) => setTimeout(r, 3000))]);
    }
  });

  it("tools/list 191 arac dondurur", () => {
    assert.equal(araclar.length, 191, `beklenen 191, gelen ${araclar.length}`);
    assert.equal(new Set(araclar.map((a) => a.name)).size, 191, "arac adlari benzersiz olmali");
  });

  it("pilot araclar outputSchema ve readOnly annotations tasir", () => {
    const pilotlar = ["rea_evm_selector", "rea_wasm_exports", "rea_evm_disasm", "rea_coverage"];
    for (const ad of pilotlar) {
      const a = araclar.find((t) => t.name === ad);
      assert.ok(a, `${ad} listede olmali`);
      assert.equal(a.outputSchema?.type, "object", `${ad} outputSchema nesne olmali`);
      assert.equal(a.annotations?.readOnlyHint, true, `${ad} readOnlyHint true olmali`);
      assert.equal(a.annotations?.destructiveHint, false, `${ad} destructiveHint false olmali`);
      assert.equal(a.annotations?.idempotentHint, true, `${ad} idempotentHint true olmali`);
      assert.equal(a.annotations?.openWorldHint, false, `${ad} openWorldHint false olmali`);
    }
    const selector = araclar.find((t) => t.name === "rea_evm_selector");
    assert.ok(selector.outputSchema.properties.details, "selector semasi details icermeli");
    const coverage = araclar.find((t) => t.name === "rea_coverage");
    assert.ok(coverage.outputSchema.properties.oran, "coverage semasi oran icermeli");
  });

  it("annotations yalniz siniflandirilmis kumede; yazan/surec/ag araci readOnly degil", () => {
    const sniff = araclar.find((t) => t.name === "rea_sniff");
    assert.equal(sniff.annotations?.readOnlyHint, true, "rea_sniff saf hesap, readOnly olmali");
    for (const ad of ["rea_process_run", "rea_upx_unpack", "rea_browser_nav", "rea_adb_install", "rea_jeb_sorgu"]) {
      const a = araclar.find((t) => t.name === ad);
      assert.ok(a, `${ad} listede olmali`);
      assert.notEqual(a.annotations?.readOnlyHint, true, `${ad} readOnly isaretlenmemeli`);
    }
    const semasiz = araclar.find((t) => t.name === "rea_fallback");
    assert.equal(semasiz.outputSchema, undefined, "sema disi arac outputSchema almamali");
    // Dalga E/1: iki kapi araci da etkisiz kapi oldugu icin readOnly isaretlidir.
    const pc = araclar.find((t) => t.name === "rea_process_compare");
    assert.equal(pc.annotations?.readOnlyHint, true, "rea_process_compare etkisiz kapi, readOnly olmali");
    assert.equal(pc.outputSchema, undefined, "rea_process_compare outputSchema almamali");
    // String donen arac readOnly olabilir ama nesne semasi alamaz.
    const motor = araclar.find((t) => t.name === "rea_best_motor");
    assert.equal(motor.annotations?.readOnlyHint, true, "rea_best_motor readOnly olmali");
    assert.equal(motor.outputSchema, undefined, "string sonuclu arac nesne semasi almamali");
  });

  it("dalga-2 araclari outputSchema tasir; toplam sayilar sabittir", () => {
    const dalga2 = [
      "rea_sniff", "rea_missing_reason", "rea_config_suggest", "rea_readiness",
      "rea_wasm_sections", "rea_wasm_imports", "rea_evm_stats", "rea_evm_selectors",
      "rea_dos_mz", "rea_dos_int21", "rea_mips_funcs", "rea_dos_psp",
      "rea_go_module", "rea_go_version", "rea_pwn_gadgets", "rea_aot_objc",
      "rea_aot_swift", "rea_js_sourcemap", "rea_js_bundle", "rea_diff_match",
      "rea_diff_summary", "rea_recon_funcs", "rea_recon_harness", "rea_recon_tag",
      "rea_crash_timeline", "rea_crash_hint", "rea_behavior_timeline",
      "rea_dosya_izi", "rea_registry_izi", "rea_managed_compare",
      "rea_managed_verify", "rea_typedef_oner", "rea_crash_kayit_parse",
      "rea_crash_ozet",
    ];
    assert.equal(dalga2.length, 34);
    // Crash kaydi araclari dahil tumu readOnly: kayit araclari dalga 3'te salt
    // dosya-okuma kumesiyle isaretlendi (tek-satir yolda dosya acar, yazmaz).
    for (const ad of dalga2) {
      const a = araclar.find((t) => t.name === ad);
      assert.ok(a, `${ad} listede olmali`);
      assert.equal(a.outputSchema?.type, "object", `${ad} outputSchema nesne olmali`);
      assert.equal(a.annotations?.readOnlyHint, true, `${ad} saf hesap, readOnly olmali`);
      assert.equal(a.annotations?.destructiveHint, false, `${ad} destructiveHint false olmali`);
      assert.equal(a.annotations?.idempotentHint, true, `${ad} idempotentHint true olmali`);
      assert.equal(a.annotations?.openWorldHint, false, `${ad} openWorldHint false olmali`);
    }
    // Toplamlar dalga E/1 sonrasi degerlerdir; ayrinti dalga-4, dalga-D/2 ve dalga-E/1 testlerinde.
    assert.equal(araclar.filter((a) => a.outputSchema).length, 187, "toplam outputSchema 187 olmali (161 rea + 30 conduit)");
    assert.equal(araclar.filter((a) => a.annotations?.readOnlyHint === true).length, 104, "toplam readOnly 104 olmali (100 rea + 4 conduit)");
    assert.equal(araclar.filter((a) => a.annotations?.destructiveHint === true).length, 38, "toplam destructive 38 olmali (25 rea + 13 conduit)");
    assert.equal(araclar.filter((a) => a.annotations?.openWorldHint === true).length, 86, "toplam openWorld 86 olmali (60 rea + 26 conduit)");
  });

  it("dalga-3 araclari outputSchema tasir; annotations kumeleri ayriktir", () => {
    // Saf surec-ici (kapali dunya) + salt dosya okuyan araclar ayni readOnly
    // degerlerini tasir; obligation_ledger zaman damgali kimligi yuzunden
    // idempotent degildir. Alt surec yoklayan iki arac openWorld'dur.
    const safKapali = [
      "rea_crash_append", "rea_mips_psp_profile", "rea_aot_detect",
      "rea_aot_profile", "rea_firmware_handoff", "rea_firmware_caps",
      "rea_process_caps", "rea_evidence_bundle", "rea_evidence_verify",
      "rea_obligation_advance", "rea_obligation_verify",
      "rea_obligation_close", "rea_managed_import", "rea_fs_diff",
      "rea_behavior_full",
    ];
    const dosyaOkuyan = [
      "rea_jadx_methods", "rea_jadx_xrefs", "rea_jadx_read",
      "rea_flutter_scan", "rea_flutter_payload", "rea_apple_macho",
      "rea_apple_plist", "rea_apple_bundle", "rea_hap_liste",
      "rea_hap_manifest", "rea_pe_info", "rea_pe_imports",
      "rea_pe_sections", "rea_dos_com", "rea_hopper_tara",
      "rea_ida_flirt", "rea_fs_snapshot", "rea_js_require",
      "rea_js_export_shape", "rea_investigate", "rea_pdb_yolu",
      "rea_dwarf_ozet", "rea_scan_repo",
    ];
    const altSurecYoklayan = ["rea_dotnet_metadata", "rea_browser_har_import"];
    assert.equal(safKapali.length + dosyaOkuyan.length + altSurecYoklayan.length + 1, 41, "dalga-3 sema sayisi (ledger dahil)");
    for (const ad of [...safKapali, ...dosyaOkuyan, "rea_obligation_ledger"]) {
      const a = araclar.find((t) => t.name === ad);
      assert.ok(a, `${ad} listede olmali`);
      assert.equal(a.outputSchema?.type, "object", `${ad} outputSchema nesne olmali`);
      assert.equal(a.annotations?.readOnlyHint, true, `${ad} readOnly olmali`);
      assert.equal(a.annotations?.destructiveHint, false, `${ad} destructiveHint false olmali`);
      assert.equal(a.annotations?.openWorldHint, false, `${ad} openWorldHint false olmali`);
      assert.equal(a.annotations?.idempotentHint, ad !== "rea_obligation_ledger", `${ad} idempotentHint`);
    }
    for (const ad of altSurecYoklayan) {
      const a = araclar.find((t) => t.name === ad);
      assert.ok(a, `${ad} listede olmali`);
      assert.equal(a.outputSchema?.type, "object", `${ad} outputSchema nesne olmali`);
      assert.equal(a.annotations?.readOnlyHint, false, `${ad} alt surec yoklar, readOnly olmamali`);
      assert.equal(a.annotations?.openWorldHint, true, `${ad} openWorld olmali`);
      assert.equal(a.annotations?.destructiveHint, undefined, `${ad} destructive iddia etmemeli`);
    }
    // Semasiz ama dalga 3'te isaretlenen dosya-okuyan crash cifti (dalga-2 semali).
    for (const ad of ["rea_crash_kayit_parse", "rea_crash_ozet"]) {
      assert.equal(araclar.find((t) => t.name === ad)?.annotations?.readOnlyHint, true, `${ad} dosya-okuyan readOnly olmali`);
    }
    // Dalga E/1: iki kapi araci da etkisiz kapi oldugu icin readOnly kumededir;
    // annotations'siz arac kalmamistir (sema disi 4 rea araci da isaretlidir).
    const isaretsiz = araclar.filter((a) => a.name.startsWith("rea_") && !a.annotations).map((a) => a.name).sort();
    assert.deepEqual(isaretsiz, []);
    assert.equal(araclar.filter((a) => a.annotations).length, 191, "annotations tasiyan toplam 191 olmali (161 rea + 30 conduit)");
    for (const ad of ["rea_process_compare", "rea_pwn_elf_layout"]) {
      const a = araclar.find((t) => t.name === ad);
      assert.equal(a.annotations?.readOnlyHint, true, `${ad} etkisiz kapi, readOnly olmali`);
      assert.equal(a.annotations?.destructiveHint, false, `${ad} destructiveHint false olmali`);
      assert.equal(a.annotations?.openWorldHint, false, `${ad} openWorldHint false olmali`);
      assert.equal(a.outputSchema, undefined, `${ad} basari sekli yok, sema almamali`);
    }
  });

  it("dalga-4 kopru araclari outputSchema tasir; annotations toplamlari degismez", () => {
    const dalga4 = [
      "rea_ghidra_analyze", "rea_ghidra_funcs", "rea_ghidra_decompile",
      "rea_ghidra_xrefs", "rea_ghidra_strings", "rea_ghidra_disasm",
      "rea_ghidra_vt", "rea_ghidra_trace", "rea_cutter_funcs",
      "rea_cutter_disasm", "rea_cutter_xrefs", "rea_cutter_strings",
      "rea_cutter_decompile", "rea_cutter_caps", "rea_apktool_decode",
      "rea_apktool_info", "rea_apktool_build", "rea_apktool_framework",
      "rea_apktool_caps", "rea_adb_devices", "rea_adb_packages",
      "rea_adb_install", "rea_adb_logcat", "rea_adb_screencap",
      "rea_upx_info", "rea_upx_unpack", "rea_ilspy_decompile",
      "rea_jadx_manifest", "rea_jadx_classes", "rea_jadx_decompile",
      "rea_jadx_full", "rea_dotnet_cil", "rea_r2_callgraph",
      "rea_r2_esil", "rea_r2_debug", "rea_wasm_decode",
      "rea_wasm_validate", "rea_process_run",
    ];
    assert.equal(dalga4.length, 38);
    for (const ad of dalga4) {
      const a = araclar.find((t) => t.name === ad);
      assert.ok(a, `${ad} listede olmali`);
      assert.equal(a.outputSchema?.type, "object", `${ad} outputSchema nesne olmali`);
      assert.equal(a.annotations?.readOnlyHint, false, `${ad} harici arac/surec, readOnly olmamali`);
      assert.equal(a.annotations?.openWorldHint, true, `${ad} openWorld olmali`);
    }
    assert.equal(araclar.filter((a) => a.outputSchema).length, 187, "toplam outputSchema 187 olmali (161 rea + 30 conduit)");
    assert.equal(araclar.filter((a) => a.annotations).length, 191, "annotations toplami 191 olmali");
  });

  it("dalga-D/2 kopru araclari outputSchema tasir; annotations kumeleri degismez", () => {
    // Onceki dalgalarda semasiz kalan 20 kopru araci: basari sekli handler
    // govdesindeki ok:true literalinden turetilmistir. Tumu harici arac/surec/
    // ag/cihaz ile konusur (readOnly degil). Sema disi kalan 4 rea araci:
    // string donenler (best_motor, fallback) + her zaman kapidan donen
    // sablonlar (process_compare, pwn_elf_layout).
    const yikiciVeAcik = [
      "rea_firmware_extract", "rea_frida_pause", "rea_frida_resume",
      "rea_frida_step", "rea_frida_cond", "rea_ida_idb",
      "rea_unpack_try", "rea_browser_shot", "rea_browser_scenario",
      "rea_net_capture",
    ];
    const yalnizAcik = [
      "rea_browser_caps", "rea_browser_nav", "rea_browser_click",
      "rea_console_yakala", "rea_storage_dump", "rea_jeb_sorgu",
      "rea_frida_api", "rea_frida_stalker", "rea_unpack_hunt",
    ];
    assert.equal(yikiciVeAcik.length + yalnizAcik.length + 1, 20);
    for (const ad of [...yikiciVeAcik, ...yalnizAcik, "rea_hopper_istek"]) {
      const a = araclar.find((t) => t.name === ad);
      assert.ok(a, `${ad} listede olmali`);
      assert.equal(a.outputSchema?.type, "object", `${ad} outputSchema nesne olmali`);
      assert.equal(a.annotations?.readOnlyHint, false, `${ad} harici arac/surec, readOnly olmamali`);
    }
    for (const ad of yikiciVeAcik) {
      const a = araclar.find((t) => t.name === ad);
      assert.equal(a.annotations?.destructiveHint, true, `${ad} destructive olmali`);
      assert.equal(a.annotations?.openWorldHint, true, `${ad} openWorld olmali`);
    }
    for (const ad of yalnizAcik) {
      const a = araclar.find((t) => t.name === ad);
      assert.equal(a.annotations?.destructiveHint, undefined, `${ad} destructive iddia etmemeli`);
      assert.equal(a.annotations?.openWorldHint, true, `${ad} openWorld olmali`);
    }
    // hopper_istek yalniz yerel istek dosyasi yazar: yikici ama openWorld degil.
    const istek = araclar.find((t) => t.name === "rea_hopper_istek");
    assert.equal(istek.annotations?.destructiveHint, true, "rea_hopper_istek destructive olmali");
    assert.equal(istek.annotations?.openWorldHint, undefined, "rea_hopper_istek openWorld iddia etmemeli");
    // unpack_try ust zarfta ok tasimaz; yontem dort literaldan biridir.
    const yonlendir = araclar.find((t) => t.name === "rea_unpack_try");
    assert.deepEqual(yonlendir.outputSchema.properties.yontem?.enum?.sort(), ["dump-hunt", "ilspy", "none", "upx"]);
    assert.ok(yonlendir.outputSchema.properties.sonuc, "rea_unpack_try semasi sonuc icermeli");
    // Sema disi kalanlar: string/dizi donenler + kapidan donen sablonlar.
    for (const ad of ["rea_best_motor", "rea_fallback", "rea_process_compare", "rea_pwn_elf_layout"]) {
      assert.equal(araclar.find((t) => t.name === ad)?.outputSchema, undefined, `${ad} outputSchema almamali`);
    }
    assert.equal(araclar.filter((a) => a.outputSchema).length, 187, "toplam outputSchema 187 olmali (161 rea + 30 conduit)");
    assert.equal(araclar.filter((a) => a.annotations).length, 191, "annotations toplami 191 olmali");
  });

  it("dalga-E/1 conduit motor araclari outputSchema tasir; toplam 187 olur", () => {
    // Onceki dalgalarda semasiz kalan 20 conduit araci: sekiller handler
    // govdesindeki ok:true literali + paylasilan motor arayuzlerinden
    // (x64dbg.ts ortak tipler, radare2.ts sonuc arayuzleri, dynamic_tools.ts
    // yerel yardimcilari, snapshots.ts Checkpoint) birebirdir. Tumu motorla
    // konusur (readOnly degil). Union semalar tools/list'te anyOf tasir
    // (ust duzey type yoktur); nesne-lik iki sekilden biriyle dogrulanir.
    const nesneSema = (s) =>
      s?.type === "object" ||
      (Array.isArray(s?.anyOf) && s.anyOf.length > 0 && s.anyOf.every((m) => m?.type === "object"));
    const tumAlanlar = (s) => {
      if (s?.type === "object") return Object.keys(s.properties ?? {});
      if (Array.isArray(s?.anyOf)) return [...new Set(s.anyOf.flatMap((m) => Object.keys(m.properties ?? {})))];
      return [];
    };
    const dalgaE = [
      "static_info", "disassemble", "get_cfg", "xrefs", "strings", "dump",
      "debug_open", "debug_attach", "debug_state", "debug_breakpoint",
      "debug_continue", "debug_step", "debug_pause", "debug_registers",
      "debug_callstack", "debug_memory", "debug_code", "debug_thread",
      "debug_plugin", "debug_time",
    ];
    assert.equal(dalgaE.length, 20);
    for (const ad of dalgaE) {
      const a = araclar.find((t) => t.name === ad);
      assert.ok(a, `${ad} listede olmali`);
      assert.ok(nesneSema(a.outputSchema), `${ad} nesne/anyOf semasi tasimali`);
      assert.equal(a.annotations?.readOnlyHint, false, `${ad} motorla konusur, readOnly olmamali`);
    }
    // Alan orneklemesi: tekil semalarda properties, unionlarda anyOf uyeleri.
    const alanVar = (ad, ...alanlar) => {
      const a = araclar.find((t) => t.name === ad);
      const hepsi = tumAlanlar(a.outputSchema);
      for (const alan of alanlar) assert.ok(hepsi.includes(alan), `${ad} semasi ${alan} icermeli`);
    };
    alanVar("static_info", "session_id", "engine", "capabilities", "r2", "target");
    alanVar("disassemble", "session_id", "location", "count", "ops", "text");
    alanVar("get_cfg", "session_id", "location", "function");
    alanVar("xrefs", "session_id", "address", "to", "from");
    alanVar("strings", "session_id", "total", "offset", "strings");
    alanVar("dump", "session_id", "address", "length", "format");
    alanVar("debug_open", "opened", "session_id", "engine", "mode", "attached", "path", "pid");
    alanVar("debug_attach", "attached", "session_id", "engine", "mode", "path", "pid");
    alanVar("debug_continue", "session_id", "reason", "address");
    alanVar("debug_pause", "session_id", "reason", "address");
    alanVar("debug_step", "session_id", "kind", "address");
    alanVar("debug_registers", "session_id", "general", "flags");
    alanVar("debug_callstack", "session_id", "threadId", "frames");
    const unionUye = (ad, beklenen) => {
      const s = araclar.find((t) => t.name === ad).outputSchema;
      assert.ok(Array.isArray(s?.anyOf), `${ad} anyOf semasi olmali`);
      assert.equal(s.anyOf.length, beklenen, `${ad} anyOf uye sayisi`);
      assert.ok(s.anyOf.every((m) => m?.type === "object"), `${ad} uyeleri nesne olmali`);
    };
    unionUye("debug_state", 2);
    unionUye("debug_breakpoint", 3);
    unionUye("debug_memory", 2);
    unionUye("debug_code", 3);
    unionUye("debug_thread", 3);
    unionUye("debug_plugin", 3);
    unionUye("debug_time", 3);
    // Sema disi kalan 4 rea araci degismez: string/dizi sonuc + ok:true uretmeyen kapilar.
    for (const ad of ["rea_best_motor", "rea_fallback", "rea_process_compare", "rea_pwn_elf_layout"]) {
      assert.equal(araclar.find((t) => t.name === ad)?.outputSchema, undefined, `${ad} outputSchema almamali`);
    }
    assert.equal(araclar.filter((a) => a.outputSchema).length, 187, "toplam outputSchema 187 olmali (161 rea + 30 conduit)");
    assert.equal(araclar.filter((a) => a.annotations).length, 191, "annotations toplami 191 olmali (161 rea + 30 conduit)");
  });

  it("yazanlar destructive, ag/cihaz/surec/harici araclar openWorld isaretli", () => {
    const kontrol = [
      // [ad, destructiveHint, openWorldHint] -- undefined: o alanda iddia yok
      ["rea_adb_install", true, true],
      ["rea_upx_unpack", true, true],
      ["rea_process_run", true, true],
      ["rea_jadx_full", true, true],
      ["rea_frida_pause", true, true],
      ["rea_hopper_istek", true, undefined], // yalniz yerel istek dosyasi yazar
      ["rea_browser_nav", undefined, true],
      ["rea_adb_devices", undefined, true],
      ["rea_ghidra_funcs", undefined, true],
      ["rea_jeb_sorgu", undefined, true],
      ["rea_wasm_decode", undefined, true],
      ["rea_frida_api", undefined, true],
    ];
    for (const [ad, yikici, dis] of kontrol) {
      const a = araclar.find((t) => t.name === ad);
      assert.ok(a, `${ad} listede olmali`);
      assert.equal(a.annotations?.readOnlyHint, false, `${ad} acikca readOnly=false olmali`);
      assert.equal(a.annotations?.destructiveHint, yikici, `${ad} destructiveHint`);
      assert.equal(a.annotations?.openWorldHint, dis, `${ad} openWorldHint`);
    }
  });

  it("rea_evm_selector structuredContent, text JSON ile ayni", async () => {
    const sonuc = await istek("tools/call", {
      name: "rea_evm_selector",
      arguments: { sig: "transfer(address,uint256)" },
    });
    assert.notEqual(sonuc.isError, true);
    const { json } = textJson(sonuc);
    assert.deepEqual(sonuc.structuredContent, json);
    assert.equal(sonuc.structuredContent.details.selector, "0xa9059cbb");
  });

  it("rea_coverage ve rea_evm_disasm yapisal cikti semaya uygun doner", async () => {
    const kapsama = await istek("tools/call", {
      name: "rea_coverage",
      arguments: { incelenen: 1, toplam: 4 },
    });
    assert.deepEqual(kapsama.structuredContent, textJson(kapsama).json);
    assert.equal(kapsama.structuredContent.oran, 0.25);
    assert.equal(kapsama.structuredContent.kalan, 3);

    const disasm = await istek("tools/call", {
      name: "rea_evm_disasm",
      arguments: { hex: "0x6000" },
    });
    assert.deepEqual(disasm.structuredContent, textJson(disasm).json);
    assert.deepEqual(disasm.structuredContent.detay.ops, [
      { pc: 0, opcode: "0x60", ad: "PUSH1", operand: "0x00" },
    ]);

    const exportsSonuc = await istek("tools/call", {
      name: "rea_wasm_exports",
      arguments: { wat: '(module (export "run" (func)))' },
    });
    assert.deepEqual(exportsSonuc.structuredContent, textJson(exportsSonuc).json);
    assert.deepEqual(exportsSonuc.structuredContent.details.names, ["run"]);
  });

  it("dalga-2 araclari semaya uygun structuredContent doner", async () => {
    const b64hex = (hex) => Buffer.from(hex, "hex").toString("base64");
    const mzBuf = Buffer.alloc(128, 0); mzBuf[0] = 0x4d; mzBuf[1] = 0x5a; mzBuf[0x3c] = 64;
    const int21Buf = Buffer.alloc(64, 0); int21Buf[0] = 0xcd; int21Buf[1] = 0x21;
    const mipsBuf = Buffer.alloc(64, 0); mipsBuf[0] = 0x0c;
    const pspBuf = Buffer.alloc(256, 0); pspBuf[0] = 0xcd; pspBuf[1] = 0x20;
    pspBuf[0x80] = 2; pspBuf[0x81] = 0x68; pspBuf[0x82] = 0x69;
    const crashNot = "Signal: SIGSEGV (signal 11) at 0x401005\nThread 0 Crashed:\n#0 0x401005 in foo (/src/a.c:10)\nrax: 0x0\nrip: 0x401005\nThread 1:\n#0 0x7fff in poll (libc)\n";
    const crashOlay = { signal: "SIGSEGV", pc: "0x1", regs: { rax: 0 } };
    // [ad, args, structuredContent kontrolu] -- yalniz offline/deterministik cagrilar.
    const cagrilar = [
      ["rea_sniff", { b64dosya: Buffer.from([0x7f, 0x45, 0x4c, 0x46]).toString("base64") }, (s) => assert.equal(s.tip, "elf")],
      ["rea_missing_reason", { eksik: "jadx", platform: "win32" }, (s) => { assert.equal(s.alternatif, "apktool"); assert.ok(s.kur.includes("winget")); }],
      ["rea_config_suggest", { bulunan: ["jadx"] }, (s) => assert.ok(s.snippet.includes("REA_JADX_BIN"))],
      ["rea_readiness", { text: JSON.stringify({ fonksiyonlar: 3, problemler: 0, bilinmeyenler: 1 }) }, (s) => { assert.equal(s.seviye, "hazir"); assert.equal(s.skor, 100); }],
      ["rea_wasm_sections", { b64: b64hex("0061736d0100000007050101610000") }, (s) => assert.deepEqual(s.details.exports, [{ ad: "a", tur: "func" }])],
      ["rea_wasm_imports", { b64: b64hex("0061736d0100000002090103656e7601660000") }, (s) => assert.deepEqual(s.details.imports, [{ modul: "env", ad: "f", tur: "func" }])],
      ["rea_evm_stats", { hex: "0x60015b5b565b" }, (s) => { assert.equal(s.details.opSayisi, 5); assert.equal(s.details.tahminiFonksiyon, 3); }],
      ["rea_evm_selectors", { hex: "0x5b600a5b63deadbeef" }, (s) => assert.deepEqual(s.details.adaylar, ["0x0a", "0xdeadbeef"])],
      ["rea_dos_mz", { b64: mzBuf.toString("base64") }, (s) => assert.equal(s.details.eLfanew, 64)],
      ["rea_dos_int21", { b64: int21Buf.toString("base64") }, (s) => assert.equal(s.details.hits, 1)],
      ["rea_mips_funcs", { b64: mipsBuf.toString("base64") }, (s) => assert.equal(s.details.jal, 1)],
      ["rea_dos_psp", { b64: pspBuf.toString("base64") }, (s) => { assert.equal(s.details.cmdline, "hi"); assert.equal(s.details.int20, "cd20"); }],
      ["rea_go_module", { text: "module example.com/x\n\ngo 1.22\n" }, (s) => { assert.equal(s.details.mod, "example.com/x"); assert.equal(s.details.ver, "1.22"); }],
      ["rea_go_version", { text: "build go1.22.1 linux/amd64" }, (s) => assert.equal(s.details.version, "go1.22.1")],
      ["rea_pwn_gadgets", { text: "gadget: pop rdi\ngadget: ret\n" }, (s) => assert.equal(s.details.n, 2)],
      ["rea_aot_objc", { text: "+ [Foo bar] - [Baz qux]" }, (s) => assert.equal(s.details.sample.length, 2)],
      ["rea_aot_swift", { text: "$s4main3fooyyF $s4main3baryyF" }, (s) => assert.equal(s.details.mangled, 2)],
      ["rea_js_sourcemap", { text: JSON.stringify({ sources: ["a.js"], mappings: "AAAA" }) }, (s) => assert.ok(s.summary.includes("1 kaynak"))],
      ["rea_js_bundle", { text: "console.log(1);" }, (s) => assert.ok(s.summary.includes("char bundle"))],
      ["rea_diff_match", { a: JSON.stringify([{ name: "f", sig: "s", body: "x y" }]), b: JSON.stringify([{ name: "f", sig: "s", body: "x y" }]) }, (s) => assert.deepEqual(s.details.matched, [{ from: "f", to: "f", score: 1 }])],
      ["rea_diff_summary", { a: JSON.stringify([{ name: "a", sig: "", body: "" }]), b: JSON.stringify([{ name: "b", sig: "", body: "" }]) }, (s) => { assert.equal(s.details.added, 1); assert.equal(s.details.removed, 1); }],
      ["rea_recon_funcs", { text: "function foo_bar_uzun(){} sub_401000();" }, (s) => assert.deepEqual(s.details.subs, ["sub_401000"])],
      ["rea_recon_harness", { text: "function foo_bar_uzun(){} sub_401000();" }, (s) => { assert.equal(s.details.caseId, "3205"); assert.ok(s.details.harness.includes("sub_401000")); }],
      ["rea_recon_tag", {}, (s) => { assert.equal(s.details.caseId, "3205"); assert.equal(s.details.note, ""); }],
      ["rea_crash_timeline", { olaylar: JSON.stringify([crashOlay]) }, (s) => assert.deepEqual(s.details.lines, ["0: SIGSEGV @ 0x1 (1 reg)"])],
      ["rea_crash_hint", { olaylar: JSON.stringify([crashOlay, crashOlay]) }, (s) => { assert.equal(s.details.top, "SIGSEGV@0x1"); assert.equal(s.details.topN, 2); }],
      ["rea_behavior_timeline", { olaylar: JSON.stringify([{ kaynak: "api", zaman: 1, detay: "CreateFileW" }]) }, (s) => { assert.equal(s.details["sıralı"].length, 1); assert.deepEqual(s.details.top_api, [{ ad: "CreateFileW", n: 1 }]); }],
      ["rea_dosya_izi", { text: JSON.stringify([{ api: "CreateFileW", yol: "a.txt" }, { api: "ReadFile", yol: "b.txt" }]) }, (s) => { assert.deepEqual(s.details.yazilanDosyalar, ["a.txt"]); assert.deepEqual(s.details.okunanDosyalar, ["b.txt"]); }],
      ["rea_registry_izi", { text: JSON.stringify([{ api: "RegSetValueExW", anahtar: "HKCU-Run" }]) }, (s) => assert.deepEqual(s.details.yazilanAnahtarlar, ["HKCU-Run"])],
      ["rea_managed_compare", { a: JSON.stringify([{ ad: "A", imza: "v()" }]), b: JSON.stringify([{ ad: "A", imza: "v()" }, { ad: "B", imza: "w()" }]) }, (s) => assert.deepEqual(s.detay.eklenen, [{ ad: "B", imza: "w()" }])],
      ["rea_managed_verify", { path: JSON.stringify(["A", "B"]), beklenen: JSON.stringify(["A", "C"]) }, (s) => { assert.deepEqual(s.detay.eksik, ["C"]); assert.deepEqual(s.detay.fazla, ["B"]); }],
      ["rea_typedef_oner", { text: JSON.stringify({ cagrilar: [{ api: "CreateFileW", args: [{ reg: "rcx" }] }] }) }, (s) => { assert.equal(s.sayi, 1); assert.equal(s.oneriler[0].oneri, "lpFileName"); }],
      ["rea_crash_kayit_parse", { text: crashNot }, (s) => { assert.equal(s.threadSayisi, 2); assert.ok(s.sinyal.includes("SIGSEGV")); }],
      ["rea_crash_ozet", { text: crashNot }, (s) => { assert.equal(s.threadSayisi, 2); assert.ok(s.ilkFrame.includes("0x401005")); }],
    ];
    assert.equal(cagrilar.length, 34);
    for (const [ad, args, kontrolEt] of cagrilar) {
      const sonuc = await istek("tools/call", { name: ad, arguments: args });
      assert.notEqual(sonuc.isError, true, `${ad} basarili olmali: ${sonuc.content?.[0]?.text ?? ""}`);
      assert.deepEqual(sonuc.structuredContent, textJson(sonuc).json, `${ad} iki kanal ayni JSON'u tasimali`);
      kontrolEt(sonuc.structuredContent);
    }
    // Opsiyonel alan: go directive yoksa ver dusurulur, sema yine gecer.
    const versiz = await istek("tools/call", { name: "rea_go_module", arguments: { text: "module example.com/y\n" } });
    assert.notEqual(versiz.isError, true);
    assert.equal(versiz.structuredContent.details.ver, undefined);
    // Ek alanli olay: behavior_timeline sirali icin cekirdek + serbest ek alan.
    const ekAlanli = await istek("tools/call", {
      name: "rea_behavior_timeline",
      arguments: { olaylar: JSON.stringify([{ kaynak: "api", zaman: 2, detay: "ReadFile", ekstra: 7 }]) },
    });
    assert.notEqual(ekAlanli.isError, true);
    assert.equal(ekAlanli.structuredContent.details["sıralı"][0].ekstra, 7);
  });

  it("dalga-3 araclari semaya uygun structuredContent doner", async () => {
    const corpus = join(kok, "tests", "corpus");
    const PE = join(corpus, "mini_pe_x64.exe");
    const APK = join(corpus, "sahte.apk");
    const JS = join(corpus, "ornek.js");
    const WASM = join(corpus, "ornek.wasm");
    const mz128 = Buffer.alloc(128, 0); mz128[0] = 0x4d; mz128[1] = 0x5a;
    const dosMips = Buffer.alloc(64, 0); dosMips[0] = 0xcd; dosMips[1] = 0x21; dosMips[4] = 0x0c;
    const olay = { signal: "SIGSEGV", pc: "0x1", regs: { rax: 0 } };
    const tamDefter = JSON.stringify({
      ledger_id: "obl_test", tools_sha256: "t", evidence_digest: "e",
      links: [{ bulgu: "B1", kod: "src/x.ts:1", test: "tests/x::t", durum: "testli" }],
      kapatıldı: false,
    });
    const acikDefter = JSON.stringify({
      ledger_id: "obl_test", tools_sha256: "t", evidence_digest: "e",
      links: [{ bulgu: "B1", kod: "", test: "", durum: "açık" }],
      kapatıldı: false,
    });
    // [ad, args, kontrol] -- corpus yollari salt-okunur; yazma/surec/browser cagrisi yok.
    // Cagrilmayan 12 sema (fixture yok/platform/alt surec): rea_firmware_caps,
    // rea_jadx_read, rea_flutter_scan, rea_flutter_payload, rea_apple_macho,
    // rea_apple_plist, rea_apple_bundle, rea_hap_manifest, rea_pdb_yolu,
    // rea_dwarf_ozet, rea_dotnet_metadata, rea_browser_har_import.
    const cagrilar = [
      ["rea_crash_append", { olaylar: JSON.stringify([olay]), olay: JSON.stringify(olay) }, (s) => assert.equal(s.details.count, 2)],
      ["rea_mips_psp_profile", { b64: dosMips.toString("base64") }, (s) => { assert.equal(s.details.dos.ok, true); assert.equal(s.details.mips.details.jal, 1); }],
      ["rea_aot_detect", { b64dosya: mz128.toString("base64"), metin: "NativeAOT" }, (s) => assert.deepEqual(s.details.hit, ["NativeAOT"])],
      ["rea_aot_profile", { b64dosya: mz128.toString("base64"), metin: "NativeAOT + [Foo bar] $s4main3fooyyF" }, (s) => { assert.equal(s.details.aot.ok, true); assert.equal(s.details.swift.ok, true); }],
      ["rea_firmware_handoff", { path: "fw.bin", neden: "linux gerekir" }, (s) => assert.equal(s.handoff, "fw.bin")],
      ["rea_process_caps", {}, (s) => { assert.equal(s["kayıt"].kanal, "pipe"); assert.equal(s["kayıt"].komut, "caps"); }],
      ["rea_evidence_bundle", { ogeler: JSON.stringify([{ ad: "x", inline: "1" }]), sakli: JSON.stringify([{ id: "ev_abc", sha256: "s", bytes: 1, mime: "text/plain" }]) }, (s) => { assert.equal(s.digest.length, 64); assert.deepEqual(s.items, [{ ad: "x", inline: "1" }]); }],
      ["rea_obligation_ledger", { bulgular: ["B1"], tools_sha256: "t", evidence_digest: "e" }, (s) => { assert.ok(s.ledger_id.startsWith("obl_")); assert.equal(s.links[0].durum, "açık"); assert.equal(s["kapatıldı"], false); }],
      ["rea_obligation_advance", { defter: acikDefter, bulgu: "B1", kod: "src/x.ts:1" }, (s) => assert.equal(s.links[0].durum, "kodlandı")],
      ["rea_obligation_verify", { text: tamDefter }, (s) => assert.deepEqual(s.eksik, [])],
      ["rea_obligation_close", { text: tamDefter }, (s) => { assert.equal(s["kapatıldı"], true); assert.equal(s.links[0].durum, "kapalı"); }],
      ["rea_managed_import", { path: JSON.stringify([{ bulgu: "F1", uye: "U1" }]) }, (s) => assert.deepEqual(s.detay.esleme, [{ bulgu: "F1", uye: "U1" }])],
      ["rea_fs_diff", { once: JSON.stringify({ dosyalar: { "a.txt": { boyut: 1, mtime: 1 } } }), sonra: JSON.stringify({ dosyalar: { "a.txt": { boyut: 2, mtime: 1 }, "b.txt": { boyut: 1, mtime: 1 } } }) }, (s) => { assert.deepEqual(s["kayıt"].eklenen, ["b.txt"]); assert.deepEqual(s["kayıt"]["değişen"], ["a.txt"]); }],
      ["rea_behavior_full", { api: JSON.stringify([{ api: "CreateFileW", yol: "a.txt" }, { api: "RegSetValueExW", anahtar: "HKCU-Run" }]) }, (s) => { assert.equal(s.cizelge.length, 2); assert.ok(s.bulgular.includes("dosya_yazma=1")); }],
      ["rea_jadx_methods", { dir: corpus }, (s) => assert.deepEqual(s.methodlar, [])],
      ["rea_jadx_xrefs", { dir: corpus, terim: "selamla" }, (s) => assert.deepEqual(s.kayitlar, [])],
      ["rea_hap_liste", { path: APK }, (s) => assert.deepEqual(s.dosyalar, ["AndroidManifest.xml"])],
      ["rea_pe_info", { path: PE }, (s) => { assert.equal(s.machine, 0x8664); assert.equal(s.bit, "64"); assert.equal(s.section_sayisi, 1); }],
      ["rea_pe_imports", { path: PE }, (s) => { assert.deepEqual(s.dlls, ["kernel32.dll"]); assert.deepEqual(s.fonksiyonlar, ["kernel32.dll!ExitProcess"]); }],
      ["rea_pe_sections", { path: PE }, (s) => assert.deepEqual(s.bolumler, [{ ad: ".text", vsize: 0x1000, vaddr: 0x1000 }])],
      ["rea_dos_com", { path: WASM }, (s) => assert.deepEqual(s.details, { boyut: 11, com: true })],
      ["rea_hopper_tara", { path: JS, desen: "selamla" }, (s) => { assert.equal(s.sayi, 3); assert.equal(s.eslesmeler[0].satir, 4); }],
      ["rea_ida_flirt", { path: JS }, (s) => { assert.equal(s.sayi, 0); assert.deepEqual(s.eslesmeler, []); }],
      ["rea_fs_snapshot", { path: corpus }, (s) => assert.deepEqual(Object.keys(s["kayıt"].dosyalar).filter((f) => !["HASHES.json", "README.md"].includes(f)).sort(), ["mini_branch.elf", "mini_pe_x64.exe", "ornek.js", "ornek.wasm", "sahte.apk"])],
      ["rea_js_require", { path: corpus }, (s) => assert.deepEqual(s.details.graf, { "ornek.js": ["node:path", "node:fs"] })],
      ["rea_js_export_shape", { path: JS }, (s) => { assert.deepEqual(s.details.fonksiyonlar, ["selamla"]); assert.equal(s.details.defaultVarMi, true); }],
      ["rea_investigate", { path: PE }, (s) => { assert.equal(s.tip, "pe"); assert.equal(s.motor, "cutter"); assert.equal(s.plan.length, 3); }],
      ["rea_scan_repo", { path: corpus }, (s) => { const gercek = s.details.dosyalar.filter((d) => !["HASHES.json", "README.md"].includes((d.yol ?? "").split(/[\\/]/).pop())); assert.equal(gercek.length, 5); assert.deepEqual(s.details.tipler, { elf: 1, pe: 1, js: 1, wasm: 1, apk: 1 }); }],
    ];
    assert.equal(cagrilar.length, 28);
    let paket;
    for (const [ad, args, kontrolEt] of cagrilar) {
      const sonuc = await istek("tools/call", { name: ad, arguments: args });
      assert.notEqual(sonuc.isError, true, `${ad} basarili olmali: ${sonuc.content?.[0]?.text ?? ""}`);
      assert.deepEqual(sonuc.structuredContent, textJson(sonuc).json, `${ad} iki kanal ayni JSON'u tasimali`);
      kontrolEt(sonuc.structuredContent);
      if (ad === "rea_evidence_bundle") paket = sonuc.structuredContent;
    }
    // Zincir: uretilen gercek paket evidence_verify ile dogrulanir.
    const dogrula = await istek("tools/call", {
      name: "rea_evidence_verify",
      arguments: { text: JSON.stringify(paket) },
    });
    assert.notEqual(dogrula.isError, true);
    assert.deepEqual(dogrula.structuredContent, { ok: true });
    assert.deepEqual(dogrula.structuredContent, textJson(dogrula).json);
  });

  it("dalga-D/2 araclari semaya uygun doner (alt surec yoklayan dal dosyasiz)", async () => {
    // Varolmayan yol: unpack_try hizli "none" dalina duser (upx yoklamasi
    // yapilmaz, alt surec yok); ust zarf basaridir ve semaya uyar.
    const yonlendir = await istek("tools/call", {
      name: "rea_unpack_try",
      arguments: { path: "yok-boyle-bir-dosya.bin" },
    });
    assert.notEqual(yonlendir.isError, true);
    assert.deepEqual(yonlendir.structuredContent, textJson(yonlendir).json);
    assert.equal(yonlendir.structuredContent.yontem, "none");
    assert.equal(yonlendir.structuredContent.sonuc.ok, false);
    // Ayni yol unpack_hunt'ta erken kapiya duser: isError kalir, iki kanal ayni.
    const av = await istek("tools/call", {
      name: "rea_unpack_hunt",
      arguments: { path: "yok-boyle-bir-dosya.bin" },
    });
    assert.equal(av.isError, true);
    const { json } = textJson(av);
    assert.equal(json.ok, false);
    assert.deepEqual(av.structuredContent, json);
  });

  it("dalga-E/1 araclari semaya uygun doner (kapidan onceki dallar, canli motor yok)", async () => {
    // Basari sekli kapidan once uretilebilen iki dal: acilmamis hedefin
    // debug_state'i (kapali zarf) ve r2 yoklamasiz static_info. Diger 18
    // motor aracinda basari canli hedef ister; onlar icin hata zarfinin iki
    // kanalli dondugu dogrulanir (sema hata zarfina zorlanmaz -- desen).
    const BILINMEYEN = "00000000-0000-4000-8000-000000000000";
    const fridaAc = await istek("tools/call", { name: "session_open", arguments: { engine: "frida" } });
    assert.notEqual(fridaAc.isError, true);
    const fridaId = textJson(fridaAc).json.session_id;
    const kapali = await istek("tools/call", { name: "debug_state", arguments: { session_id: fridaId } });
    assert.notEqual(kapali.isError, true);
    assert.deepEqual(kapali.structuredContent, textJson(kapali).json);
    assert.deepEqual(kapali.structuredContent, { session_id: fridaId, engine: "frida", open: false, target: null });
    const fridaKapat = await istek("tools/call", { name: "session_close", arguments: { session_id: fridaId } });
    assert.deepEqual(textJson(fridaKapat).json, { closed: true, session_id: fridaId });

    const r2Ac = await istek("tools/call", { name: "session_open", arguments: { engine: "radare2" } });
    const r2Id = textJson(r2Ac).json.session_id;
    const bilgi = await istek("tools/call", { name: "static_info", arguments: { session_id: r2Id } });
    assert.notEqual(bilgi.isError, true);
    assert.deepEqual(bilgi.structuredContent, textJson(bilgi).json);
    assert.equal(bilgi.structuredContent.session_id, r2Id);
    assert.equal(bilgi.structuredContent.engine, "radare2");
    assert.equal(bilgi.structuredContent.capabilities.kind, "static");
    assert.equal(bilgi.structuredContent.target, null);
    assert.equal(typeof bilgi.structuredContent.r2.available, "boolean");
    await istek("tools/call", { name: "session_close", arguments: { session_id: r2Id } });

    // 20 motor aracinin tamami bilinmeyen oturumda kapi hatasi doner; iki kanal ayni.
    const hataCagrilari = [
      ["static_info", {}], ["disassemble", {}], ["get_cfg", {}],
      ["xrefs", { address: "0x400200" }], ["strings", {}], ["dump", { address: "0x400200" }],
      ["debug_open", { path: "yok.exe" }], ["debug_attach", { pid: 1 }],
      ["debug_state", {}], ["debug_breakpoint", { action: "list" }],
      ["debug_continue", {}], ["debug_step", {}], ["debug_pause", {}],
      ["debug_registers", {}], ["debug_callstack", {}],
      ["debug_memory", { action: "read", address: "0x0" }],
      ["debug_code", { action: "disassemble" }], ["debug_thread", { action: "list" }],
      ["debug_plugin", { action: "status" }], ["debug_time", { action: "timeline" }],
    ];
    assert.equal(hataCagrilari.length, 20);
    for (const [ad, args] of hataCagrilari) {
      const sonuc = await istek("tools/call", { name: ad, arguments: { session_id: BILINMEYEN, ...args } });
      assert.equal(sonuc.isError, true, `${ad} bilinmeyen oturumda hata donmeli`);
      const { json } = textJson(sonuc);
      assert.equal(json.error, "session_not_found", `${ad} kapi hatasi session_not_found olmali`);
      assert.deepEqual(sonuc.structuredContent, json, `${ad} iki kanal ayni JSON'u tasimali`);
    }
    // Confirm kapisi: gecerli oturumda bile onaysiz cagri debuggee'ye ulasmaz.
    const frida2 = textJson(await istek("tools/call", { name: "session_open", arguments: { engine: "frida" } })).json.session_id;
    const onaysiz = await istek("tools/call", {
      name: "debug_memory", arguments: { session_id: frida2, action: "read", address: "0x0" },
    });
    assert.equal(onaysiz.isError, true);
    assert.equal(textJson(onaysiz).json.error, "confirmation_required");
    assert.deepEqual(onaysiz.structuredContent, textJson(onaysiz).json);
    await istek("tools/call", { name: "session_close", arguments: { session_id: frida2 } });
  });

  it("nesne sonucu structuredContent alir, nesne disi sonuc almaz", async () => {
    const sniffSonuc = await istek("tools/call", {
      name: "rea_sniff",
      arguments: { b64dosya: Buffer.from([0x7f, 0x45, 0x4c, 0x46]).toString("base64") },
    });
    assert.deepEqual(sniffSonuc.structuredContent, textJson(sniffSonuc).json);
    assert.equal(sniffSonuc.structuredContent.tip, "elf");

    const motor = await istek("tools/call", {
      name: "rea_best_motor",
      arguments: { tip: "apk", adaylar: ["apktool", "jadx"] },
    });
    const { metin } = textJson(motor);
    assert.equal(metin, '"jadx"', "text kanali aynen korunmali");
    assert.equal(motor.structuredContent, undefined, "string sonuc structuredContent olmamali");
  });

  it("ok:false sonucu isError doner ve iki kanal yine ayni JSON'u tasir", async () => {
    const sonuc = await istek("tools/call", {
      name: "rea_coverage",
      arguments: { incelenen: 5, toplam: 4 },
    });
    assert.equal(sonuc.isError, true);
    const { json } = textJson(sonuc);
    assert.equal(json.ok, false);
    assert.deepEqual(sonuc.structuredContent, json);
  });

  it("dalga-2 hata dali isError kalir ve sema dogrulanmaz", async () => {
    const bozukWasm = await istek("tools/call", {
      name: "rea_wasm_sections",
      arguments: { b64: Buffer.from("not a wasm").toString("base64") },
    });
    assert.equal(bozukWasm.isError, true);
    const { json } = textJson(bozukWasm);
    assert.equal(json.ok, false);
    assert.deepEqual(bozukWasm.structuredContent, json);
    const bozukHazirlik = await istek("tools/call", {
      name: "rea_readiness",
      arguments: { text: "bozuk" },
    });
    assert.equal(bozukHazirlik.isError, true);
    assert.equal(textJson(bozukHazirlik).json.ok, false);
  });
});
