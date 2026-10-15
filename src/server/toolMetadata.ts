// rea araclari icin SDK yuzeyi metadata'si: outputSchema (dalga 1+2+3+4+D/2) +
// annotations (dalga E/1 ile 141/141: iki kapi araci da salt-okunur kumede).
// Kapsam bilincli olarak sinirli: yalniz gercek donus sekli
// handler govdesinde dogrulanmis araclar sema alir; surec-ici saf hesaplar ve
// (dalga 3) alt surec/ag/yazma etkisi olmayan salt dosya okuyan kopruler
// readOnly isaretlenir. Dosya okusa da alt surec yoklayan araclar
// (dotnet_metadata, browser_har_import) readOnly degil openWorld'dur. Yazan
// araclar destructive, ag/browser/cihaz/surec ve harici arac calistiranlar
// openWorld kumelerindedir. Her zaman kapidan donen sablonlar
// (process_compare, pwn_elf_layout) etkisiz kapidir: annotations alir ama
// ok:true uretmedigi icin outputSchema almaz. String/dizi donenler
// (best_motor, fallback) nesne semasi alamaz.
// Listede olmayan arac metadata almaz (tahmini siniflandirma yok).
// NOT: annotations, httpPolicy.ts'nin tokensiz-HTTP allowlist'ini beslemez;
// o liste ayri ve aciktir (dosya okuyan araclar oraya sizmaz).
import type { StandardSchemaWithJSON, ToolAnnotations } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

export interface ReaToolMetadata {
  outputSchema?: StandardSchemaWithJSON;
  annotations?: ToolAnnotations;
}

// Output semalari: basari (ok:true tasiyanlarda o) sekilleri; SDK isError
// sonuclarini dogrulamaz. Sekiller ilgili handler govdelerindeki donuslerle
// birebirdir; girdi yankisi ya da degisken alanlarda cekirdek alanlar sabitlenir,
// sahte kesinlik (orn. her zaman dolu sandigimiz opsiyonel alan) yapilmaz.
// String/dizi donen araca (rea_best_motor, rea_fallback) nesne semasi verilmez.
// Hic ok:true uretmeyen kapi araci (rea_process_compare, rea_pwn_elf_layout)
// basari sekli olmadigi icin sema almaz (dalga E/1 teyidi).
const OUTPUT_SCHEMAS: Readonly<Record<string, StandardSchemaWithJSON>> = {
  // Dalga 1 (pilot)
  rea_evm_selector: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ sig: z.string(), selector: z.string() }),
  }),
  rea_wasm_exports: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ names: z.array(z.string()) }),
  }),
  rea_evm_disasm: z.object({
    ok: z.literal(true),
    arac: z.string(),
    ozet: z.string(),
    detay: z.object({
      ops: z.array(
        z.object({
          pc: z.number(),
          opcode: z.string(),
          ad: z.string(),
          operand: z.string().nullable(),
        }),
      ),
    }),
  }),
  rea_coverage: z.object({
    ok: z.literal(true),
    arac: z.string(),
    oran: z.number(),
    kalan: z.number(),
  }),
  // Dalga 2: facade saf hesaplar
  // sniffBytes'in ok alani yoktur; tip/motor her kosulda dolu iki dizgidir.
  rea_sniff: z.object({ tip: z.string(), motor: z.string() }),
  // alternatif yalniz bazi araclarda doludur; bosken JSON'da alan hic yoktur.
  rea_missing_reason: z.object({
    eksik: z.string(),
    kur: z.string(),
    neden: z.string(),
    alternatif: z.string().optional(),
  }),
  // Kayit katmani suggestConfig ciktisini {snippet} olarak sarar.
  rea_config_suggest: z.object({ snippet: z.string() }),
  rea_readiness: z.object({
    ok: z.literal(true),
    arac: z.string(),
    skor: z.number(),
    seviye: z.enum(["hazir", "kismi", "eksik"]),
    eksik: z.array(z.string()),
  }),
  // Dalga 2: wasm/evm/dos/go/aot saf parser ve metin taramalari
  rea_wasm_sections: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({
      sihir: z.string(),
      versiyon: z.number(),
      sections: z.array(z.object({ id: z.number(), ad: z.string(), boyut: z.number() })),
      exports: z.array(z.object({ ad: z.string(), tur: z.string() })),
    }),
  }),
  rea_wasm_imports: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({
      imports: z.array(z.object({ modul: z.string(), ad: z.string(), tur: z.string() })),
    }),
  }),
  rea_evm_stats: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({
      opSayisi: z.number(),
      pushSayisi: z.number(),
      jumpSayisi: z.number(),
      tahminiFonksiyon: z.number(),
    }),
  }),
  rea_evm_selectors: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ adaylar: z.array(z.string()), blokSayisi: z.number() }),
  }),
  rea_dos_mz: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ eLfanew: z.number() }),
  }),
  rea_dos_int21: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ hits: z.number() }),
  }),
  rea_mips_funcs: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ jal: z.number() }),
  }),
  rea_dos_psp: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({
      int20: z.string(),
      memTop: z.number(),
      dagitici: z.string(),
      fcb1: z.string(),
      fcb2: z.string(),
      cmdLen: z.number(),
      cmdline: z.string(),
    }),
  }),
  // go directive satiri yoksa ver alani JSON'da dusurulur.
  rea_go_module: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ mod: z.string(), ver: z.string().optional() }),
  }),
  rea_go_version: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ version: z.string() }),
  }),
  rea_pwn_gadgets: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ n: z.number() }),
  }),
  rea_aot_objc: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ sample: z.array(z.string()) }),
  }),
  rea_aot_swift: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ mangled: z.number() }),
  }),
  // Dalga 2: javascript/diff/recon/crash saf metin isleyiciler
  // sourcemap ve bundle basarida details tasimaz (kayitta map argumani gecilmez).
  rea_js_sourcemap: z.object({ ok: z.literal(true), tool: z.string(), summary: z.string() }),
  rea_js_bundle: z.object({ ok: z.literal(true), tool: z.string(), summary: z.string() }),
  rea_diff_match: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({
      matched: z.array(z.object({ from: z.string(), to: z.string(), score: z.number() })),
    }),
  }),
  rea_diff_summary: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ added: z.number(), removed: z.number() }),
  }),
  rea_recon_funcs: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ subs: z.array(z.string()), fns: z.array(z.string()) }),
  }),
  rea_recon_harness: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ caseId: z.string(), harness: z.string() }),
  }),
  rea_recon_tag: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ caseId: z.string(), note: z.string() }),
  }),
  rea_crash_timeline: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ lines: z.array(z.string()) }),
  }),
  rea_crash_hint: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ top: z.string(), topN: z.number() }),
  }),
  // Dalga 2: behavior/managed/typedef saf JSON isleyiciler
  // sirali, girdideki olay nesnelerinin kendisidir: cekirdek alanlar sabit,
  // cagiranin ek alanlari looseObject ile serbest birakilir.
  rea_behavior_timeline: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({
      sıralı: z.array(
        z.looseObject({
          kaynak: z.string(),
          zaman: z.union([z.number(), z.string()]),
          detay: z.string(),
        }),
      ),
      sayılar: z.record(z.string(), z.number()),
      top_api: z.array(z.object({ ad: z.string(), n: z.number() })),
      ilk: z.string(),
      son: z.string(),
    }),
  }),
  rea_dosya_izi: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({
      yazilanDosyalar: z.array(z.string()),
      okunanDosyalar: z.array(z.string()),
    }),
  }),
  rea_registry_izi: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ yazilanAnahtarlar: z.array(z.string()) }),
  }),
  rea_managed_compare: z.object({
    ok: z.literal(true),
    arac: z.string(),
    ozet: z.string(),
    detay: z.object({
      eklenen: z.array(z.object({ ad: z.string(), imza: z.string() })),
      silinen: z.array(z.object({ ad: z.string(), imza: z.string() })),
      imzaDegisen: z.array(z.object({ ad: z.string(), imza: z.string() })),
    }),
  }),
  rea_managed_verify: z.object({
    ok: z.literal(true),
    arac: z.string(),
    ozet: z.string(),
    detay: z.object({ eksik: z.array(z.string()), fazla: z.array(z.string()) }),
  }),
  rea_typedef_oner: z.object({
    ok: z.literal(true),
    arac: z.string(),
    sayi: z.number(),
    oneriler: z.array(
      z.object({
        api: z.string(),
        reg: z.string(),
        oneri: z.string(),
        kaynak: z.enum(["imza", "yayilim"]),
      }),
    ),
  }),
  // Kayitli crash notu metin parse'i (hedef calistirilmaz; sema sekli sabittir).
  rea_crash_kayit_parse: z.object({
    ok: z.literal(true),
    arac: z.string(),
    sinyal: z.string(),
    threadSayisi: z.number(),
    threadler: z.array(
      z.object({ baslik: z.string(), frameSayisi: z.number(), frameler: z.array(z.string()) }),
    ),
    registerlar: z.array(z.string()),
  }),
  rea_crash_ozet: z.object({
    ok: z.literal(true),
    arac: z.string(),
    sinyal: z.string(),
    threadSayisi: z.number(),
    ilkFrame: z.string(),
    registerSayisi: z.number(),
  }),
  // Dalga 3: surec-ici saf hesap/donusumler (dosya/alt surec yok)
  rea_crash_append: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ count: z.number() }),
  }),
  // Alt sonuclarin kendi ok'leri degiskendir; cekirdek yalniz ok bayragidir.
  rea_mips_psp_profile: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({
      dos: z.looseObject({ ok: z.boolean() }),
      mips: z.looseObject({ ok: z.boolean() }),
    }),
  }),
  rea_aot_detect: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ hit: z.array(z.string()) }),
  }),
  rea_aot_profile: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({
      aot: z.looseObject({ ok: z.boolean() }),
      objc: z.looseObject({ ok: z.boolean() }),
      swift: z.looseObject({ ok: z.boolean() }),
    }),
  }),
  rea_firmware_handoff: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    handoff: z.string(),
  }),
  // Basari yalniz Linux'ta; handoff basari seklinde yoktur.
  rea_firmware_caps: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
  }),
  rea_process_caps: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    kayıt: z.object({
      komut: z.string(),
      args: z.array(z.string()),
      kanal: z.enum(["pty", "pipe"]),
      süre_ms: z.number(),
      çıkış_kodu: z.number().nullable(),
      stdout_sha256_kısa: z.string(),
    }),
  }),
  // items/retained cagiran girdisinin yansisidir: eleman sekli sabitlenmez.
  rea_evidence_bundle: z.object({
    digest: z.string(),
    tools_sha256: z.string(),
    items: z.array(z.unknown()),
    retained: z.array(z.unknown()),
  }),
  rea_evidence_verify: z.object({ ok: z.literal(true) }),
  // Kurulumda tum halkalar "acik" ve bos kod/test ile dogar, defter aciktir.
  rea_obligation_ledger: z.object({
    ledger_id: z.string(),
    tools_sha256: z.string(),
    evidence_digest: z.string(),
    links: z.array(
      z.object({
        bulgu: z.string(),
        kod: z.string(),
        test: z.string(),
        durum: z.string(),
      }),
    ),
    kapatıldı: z.literal(false),
  }),
  // Gelen defter spread ile tasinir: kok ve halka elemanlari serbest, yalniz
  // links dizisinin varligi (advance/close'un isledigi alan) sabittir.
  rea_obligation_advance: z.looseObject({ links: z.array(z.unknown()) }),
  rea_obligation_verify: z.object({
    ok: z.literal(true),
    eksik: z.array(z.string()),
  }),
  rea_obligation_close: z.looseObject({
    links: z.array(z.unknown()),
    kapatıldı: z.literal(true),
  }),
  rea_managed_import: z.object({
    ok: z.literal(true),
    arac: z.string(),
    ozet: z.string(),
    detay: z.object({
      kayit: z.literal("reconstruction"),
      esleme: z.array(z.object({ bulgu: z.string(), uye: z.string() })),
    }),
  }),
  rea_fs_diff: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    kayıt: z.object({
      eklenen: z.array(z.string()),
      silinen: z.array(z.string()),
      değişen: z.array(z.string()),
    }),
  }),
  // cizelge, timeline'in sirali olaylaridir (behavior_timeline ile ayni desen).
  rea_behavior_full: z.object({
    ok: z.literal(true),
    tool: z.string(),
    cizelge: z.array(
      z.looseObject({
        kaynak: z.string(),
        zaman: z.union([z.number(), z.string()]),
        detay: z.string(),
      }),
    ),
    ozet: z.string(),
    bulgular: z.array(z.string()),
  }),
  // Dalga 3: salt dosya/dizin okuyan saf kopruler (alt surec yok; jadx uclusu
  // decompile ciktisini tarar, jadx kosmaz)
  rea_jadx_methods: z.object({
    ok: z.literal(true),
    arac: z.string(),
    methodlar: z.array(z.object({ sinif: z.string(), method: z.string() })),
  }),
  rea_jadx_xrefs: z.object({
    ok: z.literal(true),
    arac: z.string(),
    kayitlar: z.array(
      z.object({ dosya: z.string(), satir: z.number(), metin: z.string() }),
    ),
  }),
  rea_jadx_read: z.object({
    ok: z.literal(true),
    arac: z.string(),
    dosya: z.string(),
    toplam_satir: z.number(),
    satirlar: z.array(z.string()),
  }),
  rea_flutter_scan: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    dartMi: z.literal(true),
    tur: z.string(),
    buildId: z.string().nullable(),
    motor: z.string().nullable(),
  }),
  rea_flutter_payload: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    izler: z.array(z.string()),
  }),
  rea_apple_macho: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({
      sihir: z.string(),
      fatMi: z.boolean(),
      dyld: z.array(z.string()),
    }),
  }),
  // Iki anahtardan biri dolu olabilir; her biri tek basina null olabilir.
  rea_apple_plist: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({
      bundleId: z.string().nullable(),
      executable: z.string().nullable(),
    }),
  }),
  rea_apple_bundle: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({
      macos: z.boolean(),
      frameworks: z.number(),
      plist: z.string().nullable(),
      kok: z.number(),
    }),
  }),
  rea_hap_liste: z.object({
    ok: z.literal(true),
    arac: z.string(),
    dosya: z.string(),
    dosyalar: z.array(z.string()),
    sayi: z.number(),
  }),
  rea_hap_manifest: z.object({
    ok: z.literal(true),
    arac: z.string(),
    dosya: z.string(),
    kaynak: z.string(),
    bundleName: z.string(),
    version: z.string(),
  }),
  rea_pe_info: z.object({
    ok: z.literal(true),
    arac: z.string(),
    dosya: z.string(),
    machine: z.number(),
    machine_hex: z.string(),
    bit: z.enum(["64", "32"]),
    section_sayisi: z.number(),
    entry: z.number(),
    entry_hex: z.string(),
  }),
  // not yalniz import dizini yokken gelen erken basari seklindedir.
  rea_pe_imports: z.object({
    ok: z.literal(true),
    arac: z.string(),
    dosya: z.string(),
    dlls: z.array(z.string()),
    fonksiyonlar: z.array(z.string()),
    sayi: z.number(),
    not: z.string().optional(),
  }),
  rea_pe_sections: z.object({
    ok: z.literal(true),
    arac: z.string(),
    dosya: z.string(),
    sayi: z.number(),
    bolumler: z.array(
      z.object({ ad: z.string(), vsize: z.number(), vaddr: z.number() }),
    ),
  }),
  rea_dos_com: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ boyut: z.number(), com: z.literal(true) }),
  }),
  rea_hopper_tara: z.object({
    ok: z.literal(true),
    arac: z.string(),
    hedef: z.string(),
    desen: z.string(),
    regex: z.boolean(),
    sayi: z.number(),
    eslesmeler: z.array(
      z.object({ satir: z.number(), offset: z.number(), metin: z.string() }),
    ),
  }),
  rea_ida_flirt: z.object({
    ok: z.literal(true),
    arac: z.string(),
    hedef: z.string(),
    eslesmeler: z.array(z.string()),
    surumler: z.array(z.string()),
    sayi: z.number(),
    method: z.literal("string-heuristic"),
    guven: z.number(),
    kutuphane: z.string(),
    idaMevcut: z.boolean(),
    not: z.string(),
  }),
  rea_fs_snapshot: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    kayıt: z.object({
      dizin: z.string(),
      dosyalar: z.record(
        z.string(),
        z.object({ boyut: z.number(), mtime: z.number() }),
      ),
    }),
  }),
  rea_js_require: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({ graf: z.record(z.string(), z.array(z.string())) }),
  }),
  rea_js_export_shape: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({
      fonksiyonlar: z.array(z.string()),
      siniflar: z.array(z.string()),
      defaultVarMi: z.boolean(),
    }),
  }),
  rea_investigate: z.object({
    ok: z.literal(true),
    arac: z.string(),
    tip: z.string(),
    motor: z.string(),
    skor: z.number(),
    yedekler: z.array(z.string()),
    plan: z.array(
      z.object({ adim: z.number(), tool: z.string(), neden: z.string() }),
    ),
  }),
  rea_pdb_yolu: z.object({
    ok: z.literal(true),
    arac: z.string(),
    dosya: z.string(),
    pdb: z.string(),
    guid: z.string(),
    yas: z.number(),
  }),
  rea_pdb_indir: z.object({
    ok: z.literal(true),
    arac: z.string(),
    dosya: z.string(),
    pdb: z.string(),
    guid: z.string(),
    yas: z.number(),
    yol: z.string(),
    url: z.string(),
    cache: z.boolean(),
  }),
  rea_dwarf_ozet: z.object({
    ok: z.literal(true),
    arac: z.string(),
    dosya: z.string(),
    unitSayisi: z.number(),
    subprogramSayisi: z.number(),
    fonksiyonAdlari: z.array(z.string()),
  }),
  rea_scan_repo: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({
      dosyalar: z.array(
        z.object({ yol: z.string(), tip: z.string(), motor: z.string() }),
      ),
      tipler: z.record(z.string(), z.number()),
      planlar: z.array(
        z.object({ dosya: z.string(), motor: z.string(), neden: z.string() }),
      ),
    }),
  }),
  // Dalga 3: alt surec yoklayan ama basari sekli sabit kopruler (annotations'ta
  // openWorld; sema canli cagrida degil yalniz handler govdesinden dogrulandi)
  rea_dotnet_metadata: z.object({
    ok: z.literal(true),
    arac: z.string(),
    dosya: z.string(),
    clr: z.literal(true),
    okuyucu: z.string().nullable(),
    not: z.string(),
  }),
  rea_browser_har_import: z.object({
    ok: z.literal(true),
    tool: z.string(),
    summary: z.string(),
    details: z.object({
      entries: z.number(),
      requests: z.number(),
      responses: z.number(),
      file: z.string(),
    }),
  }),
  // Dalga 4: harici arac koprulerinin sabit basari sekilleri. Sekiller yalniz
  // handler govdelerindeki ok:true donuslerinden turetilir; kapida donen
  // ok:false sonuclari SDK tarafindan semayla dogrulanmaz. Degisken icerikli
  // listelerde cekirdek alanlar sabitlenir, icerik z.unknown() kalir.
  rea_ghidra_analyze: z.object({ ok: z.literal(true), arac: z.string(), hedef: z.string(), log: z.string() }),
  rea_ghidra_funcs: z.object({ ok: z.literal(true), arac: z.string(), hedef: z.string(), fonksiyonlar: z.array(z.unknown()) }),
  rea_ghidra_decompile: z.object({ ok: z.literal(true), arac: z.string(), hedef: z.string(), addr: z.string(), kod: z.string() }),
  rea_ghidra_xrefs: z.object({ ok: z.literal(true), arac: z.string(), hedef: z.string(), addr: z.string(), xrefs: z.array(z.unknown()) }),
  rea_ghidra_strings: z.object({ ok: z.literal(true), arac: z.string(), hedef: z.string(), strings: z.array(z.unknown()) }),
  rea_ghidra_disasm: z.object({
    ok: z.literal(true), arac: z.string(), hedef: z.string(), addr: z.string(), sayi: z.number(),
    talimatlar: z.array(z.object({ addr: z.string(), mnemonic: z.string(), bytes: z.string(), length: z.number(), text: z.string() })),
    kod: z.string(),
  }),
  rea_ghidra_vt: z.object({
    ok: z.literal(true), arac: z.string(), eski: z.string(), yeni: z.string(),
    eklenen: z.array(z.object({ name: z.string(), entry: z.string(), size: z.number() })),
    silinen: z.array(z.object({ name: z.string(), entry: z.string(), size: z.number() })),
    degisen: z.array(z.object({ name: z.string(), eskiEntry: z.string(), yeniEntry: z.string(), eskiBoyut: z.number(), yeniBoyut: z.number() })),
    ozet: z.object({ eklenen: z.number(), silinen: z.number(), degisen: z.number() }),
  }),
  rea_ghidra_trace: z.object({
    ok: z.literal(true), arac: z.string(), hedef: z.string(),
    sonuc: z.object({ trace: z.string(), bolge: z.string(), yazilan: z.number(), adresSayisi: z.number(), dogrulama: z.record(z.string(), z.boolean()), tamam: z.boolean() }),
  }),
  rea_cutter_funcs: z.object({
    ok: z.literal(true), arac: z.string(), hedef: z.string(),
    fonksiyonlar: z.array(z.object({ ad: z.string().optional(), offset: z.number().optional(), boyut: z.number().optional() })),
  }),
  rea_cutter_disasm: z.object({ ok: z.literal(true), arac: z.string(), hedef: z.string(), addr: z.string(), ops: z.array(z.unknown()) }),
  rea_cutter_xrefs: z.object({ ok: z.literal(true), arac: z.string(), hedef: z.string(), addr: z.string(), xrefs: z.array(z.unknown()) }),
  rea_cutter_strings: z.object({ ok: z.literal(true), arac: z.string(), hedef: z.string(), strings: z.array(z.unknown()) }),
  rea_cutter_decompile: z.object({ ok: z.literal(true), arac: z.string(), hedef: z.string(), addr: z.string(), kaynak: z.enum(["pdc", "pdf"]), kod: z.string(), not: z.string().optional() }),
  rea_cutter_caps: z.object({ ok: z.literal(true), arac: z.string(), surum: z.string(), pdc: z.boolean() }),
  rea_apktool_decode: z.object({ ok: z.literal(true), arac: z.string(), apk: z.string(), ciktiDir: z.string() }),
  rea_apktool_info: z.object({ ok: z.literal(true), arac: z.string(), surum: z.string() }),
  rea_apktool_build: z.object({ ok: z.literal(true), arac: z.string(), proje: z.string(), ciktiApk: z.string() }),
  rea_apktool_framework: z.object({ ok: z.literal(true), arac: z.string(), apk: z.string() }),
  rea_apktool_caps: z.object({ ok: z.literal(true), arac: z.string(), apktool: z.string(), aapt2: z.string().nullable(), aapt2Tamam: z.boolean() }),
  rea_adb_devices: z.object({ ok: z.literal(true), arac: z.string(), cihazlar: z.array(z.string()) }),
  rea_adb_packages: z.object({ ok: z.literal(true), arac: z.string(), paketler: z.array(z.string()) }),
  rea_adb_install: z.object({ ok: z.literal(true), arac: z.string(), apk: z.string(), sonuc: z.string() }),
  rea_adb_logcat: z.object({ ok: z.literal(true), arac: z.string(), satirlar: z.array(z.string()), toplam_satir: z.number() }),
  rea_adb_screencap: z.object({ ok: z.literal(true), arac: z.string(), yol: z.string(), bayt: z.number() }),
  rea_upx_info: z.object({ ok: z.literal(true), arac: z.string(), dosya: z.string(), sikisik: z.boolean(), cikti: z.string().optional(), not: z.string().optional() }),
  rea_upx_unpack: z.object({ ok: z.literal(true), arac: z.string(), dosya: z.string(), cikti: z.string(), log: z.string() }),
  rea_ilspy_decompile: z.object({ ok: z.literal(true), arac: z.string(), dosya: z.string(), ciktiDir: z.string(), cs_sayisi: z.number(), not: z.string() }),
  rea_jadx_manifest: z.object({ ok: z.literal(true), arac: z.string(), apk: z.string(), paket: z.string(), izinler: z.array(z.string()), aktiviteler: z.array(z.string()) }),
  rea_jadx_classes: z.object({ ok: z.literal(true), arac: z.string(), toplam_sinif: z.number(), siniflar: z.array(z.string()) }),
  rea_jadx_decompile: z.object({ ok: z.literal(true), arac: z.string(), sinif: z.string(), ciktiDir: z.string(), dosya: z.string(), bayt: z.number() }),
  rea_jadx_full: z.object({ ok: z.literal(true), arac: z.string(), ciktiDir: z.string(), java_dosya_sayisi: z.number() }),
  rea_dotnet_cil: z.object({ ok: z.literal(true), arac: z.string(), dosya: z.string(), filtre: z.string().nullable(), assembly: z.string(), method_sayisi: z.number(), methods: z.array(z.string()), not: z.string() }),
  rea_r2_callgraph: z.object({
    ok: z.literal(true), arac: z.string(), hedef: z.string(),
    fonksiyonlar: z.array(z.object({ ad: z.string(), addr: z.number().optional(), cagrilar: z.array(z.string()) })),
  }),
  rea_r2_esil: z.object({ ok: z.literal(true), arac: z.string(), hedef: z.string(), addr: z.string(), adim: z.number(), regs: z.record(z.string(), z.number()) }),
  rea_r2_debug: z.object({ ok: z.literal(true), arac: z.string(), hedef: z.string(), bpAddr: z.string(), cikti: z.string(), not: z.string() }),
  rea_wasm_decode: z.object({ ok: z.literal(true), tool: z.string(), summary: z.string(), details: z.object({ bin: z.string(), text: z.string() }) }),
  rea_wasm_validate: z.object({ ok: z.literal(true), arac: z.string(), ozet: z.string(), detay: z.object({ dosya: z.string(), gecerli: z.literal(true) }) }),
  rea_process_run: z.object({
    ok: z.literal(true), tool: z.string(), summary: z.string(),
    "kayıt": z.object({ komut: z.string(), args: z.array(z.string()), kanal: z.enum(["pty", "pipe"]), "süre_ms": z.number(), "çıkış_kodu": z.number().nullable(), stdout_sha256_kısa: z.string() }),
  }),
  // Dalga D/2: onceki dalgalarda semasiz kalan kopru araclarinin sabit basari
  // sekilleri. Sekiller yalniz handler govdelerindeki ok:true donuslerindeki
  // nesne literallerinden turetilir; kapida donen ok:false sonuclari SDK
  // tarafindan semayla dogrulanmaz. Degisken icerikli listelerde cekirdek
  // alanlar sabitlenir, icerik z.unknown() kalir. Her zaman kapidan donen
  // sablonlar (process_compare, pwn_elf_layout) ile string/dizi donenler
  // (best_motor, fallback) sema almaz.
  // Browser koprusu (BrowserBridge.ts): details her basarida ayni anahtarlari
  // tasir; shot yalniz cikti yolu verildiyse dolar (diger halde null).
  rea_browser_caps: z.object({
    ok: z.literal(true), tool: z.string(), summary: z.string(),
    details: z.object({ cdp: z.boolean(), playwright: z.string().nullable() }),
  }),
  rea_browser_nav: z.object({
    ok: z.literal(true), tool: z.string(), summary: z.string(),
    details: z.object({ title: z.string(), url: z.string(), shot: z.string().nullable(), icerik: z.string() }),
  }),
  rea_browser_click: z.object({
    ok: z.literal(true), tool: z.string(), summary: z.string(),
    details: z.object({ title: z.string(), url: z.string(), selector: z.string(), shot: z.string().nullable(), icerik: z.string() }),
  }),
  rea_browser_shot: z.object({
    ok: z.literal(true), tool: z.string(), summary: z.string(),
    details: z.object({ file: z.string(), url: z.string(), title: z.string() }),
  }),
  rea_browser_scenario: z.object({
    ok: z.literal(true), tool: z.string(), summary: z.string(),
    details: z.object({ file: z.string(), dir: z.string() }),
  }),
  // Browser derinligi (BrowserDepth.ts): depo betigi her zaman nesne doner,
  // konsol iletileri tip+metin ciftleridir.
  rea_storage_dump: z.object({
    ok: z.literal(true), tool: z.string(), summary: z.string(),
    details: z.object({ cookies: z.array(z.unknown()), localStorage: z.record(z.string(), z.string().nullable()) }),
  }),
  rea_console_yakala: z.object({
    ok: z.literal(true), tool: z.string(), summary: z.string(),
    details: z.object({ mesajlar: z.array(z.object({ tip: z.string(), metin: z.string() })), sure_ms: z.number() }),
  }),
  // Firmware cikarma (FirmwareBridge.ts): basarida tool alani secilen
  // araca gore degisir (rea_firmware_binwalk/unblob), handoff tasimaz.
  rea_firmware_extract: z.object({ ok: z.literal(true), tool: z.string(), summary: z.string() }),
  // Frida araclari (FridaPlus.ts, ApiTracer.ts): arac/pid her basarida dolu,
  // durum dizgileri handler'da sabittir. step'in adres/sonraki/vurdu alanlari
  // ajan cevabina gore dusurulebilir (JSON'da alan hic yoktur).
  rea_frida_pause: z.object({ ok: z.literal(true), arac: z.string(), pid: z.number(), durum: z.literal("duraklatildi") }),
  rea_frida_resume: z.object({ ok: z.literal(true), arac: z.string(), pid: z.number(), durum: z.literal("sürdürüldü") }),
  rea_frida_step: z.object({
    ok: z.literal(true), arac: z.string(), pid: z.number(),
    adres: z.string().optional(), sonraki: z.string().optional(), vurdu: z.boolean().optional(),
  }),
  rea_frida_cond: z.object({
    ok: z.literal(true), arac: z.string(), pid: z.number(),
    adres: z.string(), tuttu: z.boolean(), hitSayisi: z.number(),
  }),
  rea_frida_stalker: z.object({
    ok: z.literal(true), arac: z.string(), pid: z.number(),
    cagrilar: z.array(z.string()), sayi: z.number(),
  }),
  rea_frida_api: z.object({
    ok: z.literal(true), arac: z.string(), pid: z.number(),
    cagrilar: z.array(z.object({ api: z.string(), tid: z.number(), args: z.array(z.string()), retval: z.string() })),
    sayi: z.number(),
  }),
  // Hopper istek dosyasi (HopperProvider.ts): kayit tek dalda uretilir,
  // adresler kayit katmaninda her zaman bos dizidir (handler varsayilani).
  rea_hopper_istek: z.object({
    ok: z.literal(true), arac: z.string(), hedef: z.string(),
    adresler: z.array(z.string()), istekDosyasi: z.string(), hopper: z.string(),
  }),
  // IDA batch (IdaProvider.ts): basarida idb dosyasi gercekten uretilmistir.
  rea_ida_idb: z.object({
    ok: z.literal(true), arac: z.string(), hedef: z.string(), idb: z.string(), idat: z.string(),
  }),
  // JEB sorgusu (JebProvider.ts): basarida HTTP durum + govde (16k kirpik) doner.
  rea_jeb_sorgu: z.object({
    ok: z.literal(true), arac: z.string(), url: z.string(), yontem: z.string(), durum: z.number(), govde: z.string(),
  }),
  // Ag yakalama (NetCapture.ts): basarida HAR dosyasi gercekten yazilmistir.
  rea_net_capture: z.object({
    ok: z.literal(true), tool: z.string(), summary: z.string(),
    "kayıt": z.object({ url: z.string(), har: z.string(), bayt: z.number() }),
  }),
  // Unpack yonlendirme (Unpack.ts): ust zarfta ok alani yoktur; yontem dort
  // literaldan biridir, sonucun cekirdegi yalniz ok bayragidir (upx basarisi
  // dahil tum dallar ok tasir).
  rea_unpack_try: z.object({
    yontem: z.enum(["upx", "ilspy", "dump-hunt", "none"]),
    sonuc: z.looseObject({ ok: z.boolean() }),
  }),
  // Unpack avi (UnpackHunt.ts): karar uc literaldan biri, adimlar sirali
  // recetedir (sira/eylem/tool/neden her adimda dolu).
  rea_unpack_hunt: z.object({
    ok: z.literal(true), arac: z.string(), karar: z.enum(["upx", "dotnet", "dump"]),
    adimlar: z.array(z.object({ sira: z.number(), eylem: z.string(), tool: z.string(), neden: z.string() })),
  }),
};

// Salt-okunur kume: saf, surec-icinde hesap; dosya okumaz/yazmaz, surec
// calistirmaz, aga cikmaz. Hepsi ayni girdide ayni ciktiyi verir (idempotent)
// ve dis dunyaya acilmaz (closed world). Dosya yolu okuyan araclar dalga 3'te
// ayri FILE_READ_ONLY_TOOLS kumesindedir (asagida). Dalga E/1 notu: her zaman
// kapidan donen iki sablon (process_compare, pwn_elf_layout) da buradadir --
// ikisi de dosya/surec/ag'a dokunmaz, ciktiyi yalniz sabit nedenden ve
// platform/env'den turetir; readOnly saptamasi bu yuzden durusttur. Ikisinin
// de ok:true dali hicbir kosulda uretilemedigi (handler govdelerinde basari
// literali yoktur) ve string/dizi donenler (best_motor, fallback) nesne
// olmadigi icin bu dort arac outputSchema almaz; gerekce handler bazinda
// sabittir, tahmin degildir.
const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  // Dalga 1
  "rea_evm_selector",
  "rea_wasm_exports",
  "rea_evm_disasm",
  "rea_coverage",
  "rea_sniff",
  "rea_best_motor",
  "rea_fallback",
  "rea_missing_reason",
  "rea_config_suggest",
  "rea_readiness",
  // Dalga 2: b64/metin/JSON girdili saf parser ve hesaplar
  "rea_wasm_sections",
  "rea_wasm_imports",
  "rea_evm_stats",
  "rea_evm_selectors",
  "rea_dos_mz",
  "rea_dos_int21",
  "rea_mips_funcs",
  "rea_dos_psp",
  "rea_go_module",
  "rea_go_version",
  "rea_pwn_gadgets",
  "rea_aot_objc",
  "rea_aot_swift",
  "rea_js_sourcemap",
  "rea_js_bundle",
  "rea_diff_match",
  "rea_diff_summary",
  "rea_recon_funcs",
  "rea_recon_harness",
  "rea_recon_tag",
  "rea_crash_timeline",
  "rea_crash_hint",
  "rea_behavior_timeline",
  "rea_dosya_izi",
  "rea_registry_izi",
  "rea_managed_compare",
  "rea_managed_verify",
  "rea_typedef_oner",
  // Dalga 3: b64/metin/JSON girdili saf hesap ve deger donusumleri (kalici
  // durum yazmaz; obligation advance/close gelen defterin yeni halini doner)
  "rea_crash_append",
  "rea_mips_psp_profile",
  "rea_aot_detect",
  "rea_aot_profile",
  "rea_firmware_handoff", // yolu okumaz, yalniz devir notu uretir
  "rea_firmware_caps", // yalniz platform kontrolu
  "rea_process_caps", // surec kosmaz, sabit yetenek kaydi doner
  "rea_evidence_bundle",
  "rea_evidence_verify",
  "rea_obligation_advance",
  "rea_obligation_verify",
  "rea_obligation_close",
  "rea_managed_import", // path argumani JSON metnidir, dosya okunmaz
  "rea_fs_diff", // iki snapshot JSON'unu karsilastirir, fs'e cikmaz
  "rea_behavior_full",
  // Dalga E/1: her zaman kapidan donen sablonlar. process_compare girdiyi yok
  // sayar, pwn_elf_layout dosyayi acmadan REA_PYTHON_BIN yoklamasiyla eler;
  // ikisi de yazmaz/surec kosmaz/aga cikmaz (readOnly durusttur). ok:true
  // uretmedikleri icin outputSchema almazlar (ustteki OUTPUT_SCHEMAS notu).
  "rea_process_compare",
  "rea_pwn_elf_layout",
]);

// Salt dosya/dizin okuyan kume (dalga 3): handler yalniz readFile/readdir/
// stat kullanir; yazmaz, alt surec calistirmaz, aga cikmaz. Degerler
// READ_ONLY_ANNOTATIONS ile aynidir ama kume ayri tutulur: denetimde "dosya
// yolundan okur" bilgisi kaybolmasin ve bu araclar httpPolicy allowlist'ine
// (ayri, acik liste) kendiliginden girmesin diye. Istisna notlari:
// - rea_jadx_*: jadx kosmaz, onceki decompile ciktisini tarar.
// - rea_hopper_tara / rea_ida_flirt: saglayici ikilisini yoklamaz, salt tarama.
// - rea_crash_kayit_parse/ozet: girdi tek satirlik mevcut yolsa dosyayi acar,
//   degilse ham metin parse eder; iki dal da salt okumadir.
// - rea_scan_repo: surec-ici mtime onbellegi yazar (dis etki degil, memo).
// - rea_investigate: hedefin ilk 4096 baytini okuyup plan uretir.
const FILE_READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "rea_jadx_methods",
  "rea_jadx_xrefs",
  "rea_jadx_read",
  "rea_flutter_scan",
  "rea_flutter_payload",
  "rea_apple_macho",
  "rea_apple_plist",
  "rea_apple_bundle",
  "rea_hap_liste",
  "rea_hap_manifest",
  "rea_pe_info",
  "rea_pe_imports",
  "rea_pe_sections",
  "rea_dos_com",
  "rea_hopper_tara",
  "rea_ida_flirt",
  "rea_crash_kayit_parse",
  "rea_crash_ozet",
  "rea_fs_snapshot",
  "rea_js_require",
  "rea_js_export_shape",
  "rea_investigate",
  "rea_pdb_yolu",
  "rea_dwarf_ozet",
  "rea_scan_repo",
]);

// Yikici kume (salt-okunur degil): dosya/cikti yazan, cihaza kuran ya da hedef
// sureci degistiren araclar. Her biri handler govdesindeki acik yazma/
// kurulum/suspend/bp cagrisiyla dogrulanmistir; supheli araclar kumeye alinmaz.
const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set([
  "rea_jadx_decompile",
  "rea_jadx_full",
  "rea_apktool_decode",
  "rea_apktool_build",
  "rea_apktool_framework",
  "rea_adb_install",
  "rea_adb_screencap",
  "rea_upx_unpack",
  "rea_ilspy_decompile",
  "rea_unpack_try", // upx sikisiksa <yol>.unpacked yazar
  "rea_browser_shot",
  "rea_browser_scenario",
  "rea_firmware_extract",
  "rea_ghidra_analyze",
  "rea_ghidra_trace",
  "rea_ida_idb",
  "rea_hopper_istek", // istek dosyasini writeFileSync ile yazar
  "rea_frida_pause",
  "rea_frida_resume",
  "rea_frida_step",
  "rea_frida_cond",
  "rea_process_run", // verilen komutu gercekten calistirir
  "rea_r2_debug", // hedefi r2 -d ile calistirir
  "rea_net_capture",
  "rea_pdb_indir", // önbelleğe PDB yazar
]);

// Dis dunya kume (salt-okunur degil): ag/browser/cihaz/hedef surec ile
// konusur veya harici arac (ghidra/rizin/jadx/apktool/upx/wabt...) calistirir.
// Dalga 3 ayrimi: yalniz dosya okuyan kopruler (jadx_methods, ida_flirt gibi)
// FILE_READ_ONLY_TOOLS'tadir; ama dosya okumadan once alt surecle yetenek
// yoklayanlar (dotnet_metadata: dotnet/monodis/ikdasm --version;
// browser_har_import: npx playwright --version kapisi) buradadir. Kapida
// kalan sablonlar (process_compare, pwn_elf_layout) hicbir kumede degil.
const OPEN_WORLD_TOOLS: ReadonlySet<string> = new Set([
  // Ag + browser + uzak MCP ucu
  "rea_browser_nav",
  "rea_browser_click",
  "rea_browser_shot",
  "rea_browser_scenario",
  "rea_browser_caps",
  "rea_storage_dump",
  "rea_console_yakala",
  "rea_net_capture",
  "rea_jeb_sorgu",
  // Cihaz (adb)
  "rea_adb_devices",
  "rea_adb_packages",
  "rea_adb_install",
  "rea_adb_logcat",
  "rea_adb_screencap",
  // Hedef surec (frida) + serbest komut
  "rea_frida_pause",
  "rea_frida_resume",
  "rea_frida_step",
  "rea_frida_cond",
  "rea_frida_stalker",
  "rea_frida_api",
  "rea_process_run",
  // Harici arac calistiran kopruler
  "rea_ghidra_analyze",
  "rea_ghidra_funcs",
  "rea_ghidra_decompile",
  "rea_ghidra_xrefs",
  "rea_ghidra_strings",
  "rea_ghidra_disasm",
  "rea_ghidra_vt",
  "rea_ghidra_trace",
  "rea_cutter_funcs",
  "rea_cutter_disasm",
  "rea_cutter_xrefs",
  "rea_cutter_strings",
  "rea_cutter_decompile",
  "rea_cutter_caps",
  "rea_jadx_manifest",
  "rea_jadx_classes",
  "rea_jadx_decompile",
  "rea_jadx_full",
  "rea_apktool_decode",
  "rea_apktool_info",
  "rea_apktool_build",
  "rea_apktool_framework",
  "rea_apktool_caps",
  "rea_dotnet_cil",
  "rea_r2_callgraph",
  "rea_r2_esil",
  "rea_r2_debug",
  "rea_upx_info",
  "rea_upx_unpack",
  "rea_ilspy_decompile",
  "rea_unpack_try",
  "rea_unpack_hunt",
  "rea_wasm_decode",
  "rea_wasm_validate",
  "rea_firmware_extract",
  "rea_ida_idb",
  // Dalga 3: alt surec yetenek yoklamasi yapan okuyucular
  "rea_dotnet_metadata",
  "rea_browser_har_import",
  // PDB indirici: ağa çıkar (sembol sunucusu)
  "rea_pdb_indir",
]);

const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

// rea_obligation_ledger saftir ama varsayilan ledger_id Date.now()'dan
// turetildigi icin ayni girdi tekrarli cagrida yeni kimlik uretir.
const OBLIGATION_LEDGER_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

// Acik kumelerden annotations turetir; bilinmeyen arac icin tahmin yok.
// Yikici/dis-dunya araclarda idempotent ve (yikici degilse) destructive
// alanlari bilerek bos birakilir: yanlis guvence vermek yokluktan kotudur.
function annotationsFor(ad: string): ToolAnnotations | undefined {
  if (READ_ONLY_TOOLS.has(ad) || FILE_READ_ONLY_TOOLS.has(ad)) return READ_ONLY_ANNOTATIONS;
  if (ad === "rea_obligation_ledger") return OBLIGATION_LEDGER_ANNOTATIONS;
  const destructive = DESTRUCTIVE_TOOLS.has(ad);
  const openWorld = OPEN_WORLD_TOOLS.has(ad);
  if (!destructive && !openWorld) return undefined;
  return {
    readOnlyHint: false,
    ...(destructive ? { destructiveHint: true } : {}),
    ...(openWorld ? { openWorldHint: true } : {}),
  };
}

// Arac adina metadata; siniflandirilmamis arac icin undefined.
export function reaToolMetadata(ad: string): ReaToolMetadata | undefined {
  const outputSchema = OUTPUT_SCHEMAS[ad];
  const annotations = annotationsFor(ad);
  if (!outputSchema && !annotations) return undefined;
  return {
    ...(outputSchema ? { outputSchema } : {}),
    ...(annotations ? { annotations } : {}),
  };
}
