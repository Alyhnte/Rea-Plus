// conduit 30 araci icin SDK yuzeyi metadata'si (annotations + sinirli
// outputSchema) ve bileşim kokunde calisan structuredContent sarmalayicisi.
// Kurallar toolMetadata.ts ile ayni cizgidedir: acik isim listeleri, tahminle
// siniflandirma yok; listede olmayan (yeni) conduit adi metadata almaz.
// Kaynak: src/conduit-core/{tools,debug_tools,dynamic_tools,guide_tools}.ts
// handler govdeleri. Sarmalayici conduit kayit dosyalarina dokunmaz;
// server.ts'de yalniz registerTools(server) cagrisi cevresinde kurulur ve
// toolset filtresi + audit sarmalayicilariyla ayni golge-ozellik desenini
// kullanir (gercek registerTool, server `this` baglamiyla cagrilir).
import type { JSONObject, McpServer, StandardSchemaWithJSON, ToolAnnotations } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

export interface ConduitToolMetadata {
  outputSchema?: StandardSchemaWithJSON;
  annotations?: ToolAnnotations;
}

// Dondurulmus 30 conduit adi; siniflandirma kumeleri yalniz bunlardan olusur.
// Yeni arac buraya eklenmedikce annotations/outputSchema almaz (fail-closed).
export const CONDUIT_TOOL_NAMES: readonly string[] = [
  "health", "session_open", "session_close", "session_list", "events_pull",
  "static_info", "open_target", "close_target", "disassemble", "get_cfg",
  "xrefs", "strings", "dump",
  "debug_open", "debug_attach", "debug_close", "debug_state",
  "debug_breakpoint", "debug_continue", "debug_step", "debug_pause",
  "debug_registers", "debug_callstack",
  "debug_memory", "debug_code", "debug_thread", "debug_plugin", "debug_time",
  "explain", "prerequisites",
];

// Output semalari (30/30; dalga E/1 ile 20 eklendi): donus sekli handler
// govdesinde kelimesi kelimesine sabit ve motor cevabini ...spread ile
// tasiyanlarda bile yayilan tipin paylasilan arayuzde sabit oldugu araclar.
// Diger hicbir arac kalmadi: 20'lik eski "degisken" kumedeki her maddenin ya
// handler-dosyasinda yerel yardimcisi (dynamic_tools.ts: MemoryView,
// Insn/StopView/ThreadRow/PluginRow; snapshots.ts: Checkpoint) ya da uc
// motorun ortak ithal ettigi arayuzu (x64dbg.ts: DebugTargetInfo/DebugState/
// ContinueResult/StepResult/RegisterSet/CallStack; radare2.ts:
// DisassemblyResult/CfgResult/XrefsResult/StringsResult/DumpResult/
// TargetInfo) vardir. Dort rea araci (best_motor/fallback: string/dizi sonuc;
// process_compare/pwn_elf_layout: ok:true dali yok) nesne semasi alamaz --
// gerekce toolMetadata.ts'tedir. SDK isError sonuclarini semayla dogrulamaz.
const OUTPUT_SCHEMAS: Readonly<Record<string, StandardSchemaWithJSON>> = {
  // tools.ts: {status:"ok", name, protocol, sessions} -- dort alan her zaman dolu.
  health: z.object({
    status: z.literal("ok"),
    name: z.string(),
    protocol: z.string(),
    sessions: z.number(),
  }),
  // tools.ts: {session_id, engine, createdAt} -- registry.open'in birebir yansisi.
  session_open: z.object({
    session_id: z.string(),
    engine: z.string(),
    createdAt: z.string(),
  }),
  // tools.ts: {sessions:[{session_id, engine, createdAt}]} -- bosken bos dizi.
  session_list: z.object({
    sessions: z.array(
      z.object({ session_id: z.string(), engine: z.string(), createdAt: z.string() }),
    ),
  }),
  // Dalga D/2: kapatma araclari ayni sabit zarfi doner (closed her zaman boolean;
  // kapaliyken false, acikken true -- iki dal da semaya uyar).
  // Kaynak: tools.ts session_close/close_target, debug_tools.ts debug_close.
  session_close: z.object({ closed: z.boolean(), session_id: z.string() }),
  close_target: z.object({ closed: z.boolean(), session_id: z.string() }),
  debug_close: z.object({ closed: z.boolean(), session_id: z.string() }),
  // tools.ts open_target: kapidan gecen basarida mode her zaman "static"tir
  // (farkli mode capability_unsupported doner); engine sabitiyle birlikte
  // dizgi olarak sabitlenir, sahte literal kesinligi yapilmaz.
  open_target: z.object({
    opened: z.literal(true),
    session_id: z.string(),
    engine: z.string(),
    mode: z.string(),
    path: z.string(),
  }),
  // tools.ts events_pull: registry.ts BridgeEvent sekli sabittir
  // ({seq, at, kind, data}); data tasiyici yuk degiskendir, unknown kalir.
  // retainedFrom bos tamponda null'dur.
  events_pull: z.object({
    session_id: z.string(),
    retainedFrom: z.number().nullable(),
    events: z.array(
      z.object({ seq: z.number(), at: z.string(), kind: z.string(), data: z.unknown() }),
    ),
  }),
  // guide_tools.ts prerequisites: prereq.ts checkPrerequisites + ToolStatus
  // arayuzu; durum iki literaldan biri, yol yokken null, oneri/indir/nereye
  // yalniz eksik satirlarda vardir.
  prerequisites: z.object({
    ozet: z.string(),
    araclar: z.array(
      z.object({
        id: z.string(),
        ad: z.string(),
        zorunlu: z.boolean(),
        durum: z.enum(["var", "yok"]),
        yol: z.string().nullable(),
        oneri: z.string().optional(),
        indir: z.string().optional(),
        nereye: z.string().optional(),
      }),
    ),
  }),
  // guide_tools.ts explain: kaynak cagiran girdisine gore degisir (verilen
  // komutlar/radare2/motor id) ama explain.ts ExplainResult govdesi her
  // basarida aynidir; satir/atlama/cagri/bildirim cekirdek alanlari sabittir.
  explain: z.object({
    kaynak: z.string(),
    dil: z.literal("tr"),
    ozet: z.string(),
    satirlar: z.array(z.object({ adres: z.string(), kod: z.string(), anlam: z.string() })),
    atlamalar: z.array(z.object({ adres: z.string(), hedef: z.string(), kosul: z.string(), anlam: z.string() })),
    cagrilar: z.array(z.object({ adres: z.string(), hedef: z.string(), anlam: z.string() })),
    bildirimler: z.array(z.object({ adres: z.string(), ad: z.string(), anlam: z.string() })),
    komut_sayisi: z.number(),
    gosterilen: z.number(),
  }),
  // Dalga E/1: canli/statik motor araclarinin sabit basari sekilleri. Asagidaki
  // her sekil yalniz handler govdesindeki ok:true literalinden ve su sabit
  // tiplerden turetilmistir: tools.ts/static_info'da r2Version {binary, version}
  // + TargetInfo {path, openedAt, binary} ve radare2Capabilities (kind "static");
  // radare2.ts DisassemblyResult/CfgResult/XrefsResult/StringsResult/DumpResult;
  // debug_tools.ts'te uc motorun ortak DebugTargetInfo/DebugState/ContinueResult
  // arayuzleri (cdb.ts/frida.ts x64dbg.ts'ten ithal eder; attachRemote de
  // DebugTargetInfo doner); dynamic_tools.ts'te yerel MemoryView/Insn/StopView/
  // ThreadRow/PluginRow + snapshots.ts Checkpoint. ok:false/error dallari
  // semaya zorlanmaz (hata zarfi semasiz kalir -- mevcut desen).
  // Ortak kucuk sekiller (her basarida ayni anahtarlar, motor cevabi yayilmaz).
  static_info: z.object({
    session_id: z.string(),
    engine: z.literal("radare2"),
    capabilities: z.object({
      kind: z.literal("static"),
      disassembly: z.boolean(),
      symbols: z.boolean(),
      readMemory: z.boolean(),
      writeMemory: z.boolean(),
      breakpoints: z.boolean(),
      registers: z.boolean(),
      modules: z.boolean(),
      threads: z.boolean(),
    }),
    // r2 yokken {available:false, detail}; varken {available:true, binary, version}.
    r2: z.union([
      z.object({ available: z.literal(true), binary: z.string(), version: z.string() }),
      z.object({ available: z.literal(false), detail: z.string() }),
    ]),
    // Hedef acik degilken null; acikken TargetInfo yayilimi; hata dalinda
    // path/error/detail (openPath yokken path null'dur).
    target: z.union([
      z.null(),
      z.object({
        open: z.literal(true),
        path: z.string(),
        openedAt: z.string(),
        binary: z.object({
          arch: z.string().optional(),
          bits: z.number().optional(),
          os: z.string().optional(),
          bintype: z.string().optional(),
          format: z.string().optional(),
        }),
      }),
      z.object({
        open: z.literal(true),
        path: z.string().nullable(),
        error: z.string(),
        detail: z.string(),
      }),
    ]),
  }),
  // tools.ts: {session_id + DisassemblyResult} (location/count/ops/text).
  disassemble: z.object({
    session_id: z.string(),
    location: z.string(),
    count: z.number(),
    ops: z.array(
      z.object({
        address: z.string(),
        size: z.number(),
        bytes: z.string(),
        opcode: z.string(),
        type: z.string(),
        jump: z.string().optional(),
        fail: z.string().optional(),
      }),
    ),
    text: z.string(),
  }),
  // tools.ts: {session_id + CfgResult}; json/dot girdi formatina gore duser.
  get_cfg: z.object({
    session_id: z.string(),
    location: z.string(),
    function: z.object({ name: z.string(), address: z.string(), size: z.number(), blocks: z.number() }).nullable(),
    json: z.array(z.unknown()).optional(),
    dot: z.string().optional(),
  }),
  // tools.ts: {session_id + XrefsResult}; giris yonu ne olursa olsun iki dizi
  // her zaman vardir (biri bos kalabilir).
  xrefs: z.object({
    session_id: z.string(),
    address: z.string(),
    to: z.array(
      z.object({
        from: z.string(),
        to: z.string().optional(),
        type: z.string(),
        opcode: z.string().optional(),
        function: z.string().optional(),
      }),
    ),
    from: z.array(
      z.object({
        from: z.string(),
        to: z.string().optional(),
        type: z.string(),
        opcode: z.string().optional(),
        function: z.string().optional(),
      }),
    ),
  }),
  // tools.ts: {session_id + StringsResult} (total/offset/strings).
  strings: z.object({
    session_id: z.string(),
    total: z.number(),
    offset: z.number(),
    strings: z.array(
      z.object({
        vaddr: z.string(),
        paddr: z.string(),
        section: z.string(),
        type: z.string(),
        length: z.number(),
        string: z.string(),
      }),
    ),
  }),
  // tools.ts: {session_id + DumpResult}; hex formatinda text, json'da bytes
  // doner (diger anahtar her dalda yoktur).
  dump: z.object({
    session_id: z.string(),
    address: z.string(),
    length: z.number(),
    format: z.enum(["hex", "json"]),
    text: z.string().optional(),
    bytes: z.array(z.number()).optional(),
  }),
  // debug_tools.ts debug_open: opened/mode/attached handler'da sabittir
  // (info.attached degil); engine uc debug motorundan biri, kalan alanlar
  // DebugTargetInfo'nun birebir yansisidir.
  debug_open: z.object({
    opened: z.literal(true),
    session_id: z.string(),
    engine: z.enum(["x64dbg", "cdb", "frida"]),
    mode: z.literal("debug"),
    attached: z.literal(false),
    path: z.string(),
    pid: z.number(),
    architecture: z.string(),
    entry_point: z.string(),
    module_base: z.string().nullable(),
    module_entry: z.string().nullable(),
  }),
  // debug_tools.ts debug_attach: pid ve uzak (gadget/usb) iki dal da ayni
  // zarfi doner (attach/attachRemote ikisi de DebugTargetInfo).
  debug_attach: z.object({
    attached: z.literal(true),
    session_id: z.string(),
    engine: z.enum(["x64dbg", "cdb", "frida"]),
    mode: z.literal("debug"),
    path: z.string(),
    pid: z.number(),
    architecture: z.string(),
    entry_point: z.string(),
    module_base: z.string().nullable(),
    module_entry: z.string().nullable(),
  }),
  // debug_tools.ts debug_state: hedef acik degilken dort alanlik kapali zarf;
  // acikken DebugState + capabilities yayilimi (kind debug motorlarinda "debug").
  debug_state: z.union([
    z.object({
      session_id: z.string(),
      engine: z.enum(["x64dbg", "cdb", "frida"]),
      open: z.literal(false),
      target: z.null(),
    }),
    z.object({
      session_id: z.string(),
      engine: z.enum(["x64dbg", "cdb", "frida"]),
      capabilities: z.object({
        kind: z.literal("debug"),
        disassembly: z.boolean(),
        symbols: z.boolean(),
        readMemory: z.boolean(),
        writeMemory: z.boolean(),
        breakpoints: z.boolean(),
        registers: z.boolean(),
        modules: z.boolean(),
        threads: z.boolean(),
      }),
      open: z.boolean(),
      target: z.string().nullable(),
      arch: z.enum(["x86", "x64"]).nullable(),
      pid: z.number().nullable(),
      attached: z.boolean(),
      entry_point: z.string().nullable(),
      module_base: z.string().nullable(),
      module_entry: z.string().nullable(),
      opened_at: z.string().nullable(),
      state: z.string(),
      pause_reason: z.string().nullable(),
      termination_reason: z.string().nullable(),
    }),
  ]),
  // debug_tools.ts debug_breakpoint: list dali action tasimaz; set dali girdi
  // type'ini (8 literal) ve motorun {address, resolved} donusunu; remove dali
  // String(address) ile motorun {status} donusunu tasir. Uc motorun imzalari aynidir.
  debug_breakpoint: z.union([
    z.object({ session_id: z.string(), breakpoints: z.array(z.unknown()) }),
    z.object({
      session_id: z.string(),
      action: z.literal("set"),
      type: z.enum([
        "software",
        "hardware_execute",
        "hardware_read",
        "hardware_write",
        "hardware_access",
        "memory_read",
        "memory_write",
        "memory_access",
      ]),
      address: z.string(),
      resolved: z.boolean(),
    }),
    z.object({
      session_id: z.string(),
      action: z.literal("remove"),
      address: z.string(),
      status: z.string(),
    }),
  ]),
  // debug_tools.ts debug_continue/debug_pause: uc motorda da ContinueResult.
  debug_continue: z.object({ session_id: z.string(), reason: z.string(), address: z.string() }),
  debug_pause: z.object({ session_id: z.string(), reason: z.string(), address: z.string() }),
  // debug_tools.ts debug_step: kind girdiden (varsayilan "into"), gerisi
  // StepResult; disassembly/module/function/registers motorun doldurdugu
  // dalda vardir (frida count'u yoksayar ama sekil aynidir).
  debug_step: z.object({
    session_id: z.string(),
    kind: z.enum(["into", "over"]),
    address: z.string(),
    disassembly: z.string().optional(),
    module: z.string().optional(),
    function: z.string().optional(),
    registers: z.record(z.string(), z.string()).optional(),
  }),
  // debug_tools.ts debug_registers: uc motorda da RegisterSet; segment/debug
  // bayrak acilmadikca yoktur.
  debug_registers: z.object({
    session_id: z.string(),
    general: z.record(z.string(), z.string()),
    flags: z.record(z.string(), z.boolean()),
    segment: z.record(z.string(), z.string()).optional(),
    debug: z.record(z.string(), z.string()).optional(),
  }),
  // debug_tools.ts debug_callstack: uc motorda da CallStack; threadId her
  // basarida vardir (listThreads'teki active_thread_id'den farkli: cagri
  // anindaki thread).
  debug_callstack: z.object({
    session_id: z.string(),
    threadId: z.number(),
    frames: z.array(
      z.object({
        index: z.number(),
        address: z.string(),
        returnAddress: z.string().optional(),
        module: z.string().optional(),
        function: z.string().optional(),
      }),
    ),
  }),
  // dynamic_tools.ts debug_memory: read/dump MemoryView, search eslesme
  // ozeti doner; live her basarida true, engine uc debug motorundan biridir.
  debug_memory: z.union([
    z.object({
      session_id: z.string(),
      engine: z.enum(["x64dbg", "cdb", "frida"]),
      action: z.enum(["read", "dump"]),
      live: z.literal(true),
      address: z.string(),
      size: z.number(),
      hex: z.string(),
      ascii: z.string(),
    }),
    z.object({
      session_id: z.string(),
      engine: z.enum(["x64dbg", "cdb", "frida"]),
      action: z.literal("search"),
      live: z.literal(true),
      matches: z.array(z.object({ address: z.string() })),
      total_found: z.number(),
      truncated: z.boolean(),
    }),
  ]),
  // dynamic_tools.ts debug_code: disassemble Insn dizisi, assemble bayt
  // sayimi, run_to StopView tasir (frida'da assemble/run_to capability
  // hatasidir, semaya girmez).
  debug_code: z.union([
    z.object({
      session_id: z.string(),
      engine: z.enum(["x64dbg", "cdb", "frida"]),
      action: z.literal("disassemble"),
      live: z.literal(true),
      address: z.string(),
      instructions: z.array(
        z.object({ address: z.string(), bytes: z.string(), mnemonic: z.string(), operands: z.string() }),
      ),
    }),
    z.object({
      session_id: z.string(),
      engine: z.enum(["x64dbg", "cdb", "frida"]),
      action: z.literal("assemble"),
      address: z.string(),
      bytes: z.string(),
      size: z.number(),
      bytes_written: z.number(),
    }),
    z.object({
      session_id: z.string(),
      engine: z.enum(["x64dbg", "cdb", "frida"]),
      action: z.literal("run_to"),
      run_to: z.string(),
      address: z.string(),
      reason: z.string(),
      reached: z.boolean(),
    }),
  ]),
  // dynamic_tools.ts debug_thread: list ThreadRow dizisi; select/context
  // dallarinda address (x64dbg) ve general (motor registerlari) gorunurlugu
  // dala gore degisir (ikisi de opsiyonel, en az biri vardir); freeze/thaw
  // thread listesini aynen tasir. frida select/freeze/thaw desteklemez
  // (capability hatasi, semaya girmez).
  debug_thread: z.union([
    z.object({
      session_id: z.string(),
      engine: z.enum(["x64dbg", "cdb", "frida"]),
      action: z.literal("list"),
      active_thread_id: z.number().nullable(),
      threads: z.array(
        z.object({
          id: z.number(),
          current: z.boolean(),
          state: z.string().nullable(),
          entry: z.string().nullable(),
        }),
      ),
    }),
    z.object({
      session_id: z.string(),
      engine: z.enum(["x64dbg", "cdb", "frida"]),
      action: z.enum(["select", "context"]),
      thread_id: z.number(),
      selected: z.boolean(),
      address: z.string().nullable().optional(),
      general: z.record(z.string(), z.unknown()).optional(),
    }),
    z.object({
      session_id: z.string(),
      engine: z.enum(["x64dbg", "cdb", "frida"]),
      action: z.enum(["freeze", "thaw"]),
      thread_id: z.number(),
      frozen: z.boolean(),
      active_thread_id: z.number().nullable(),
      threads: z.array(
        z.object({
          id: z.number(),
          current: z.boolean(),
          state: z.string().nullable(),
          entry: z.string().nullable(),
        }),
      ),
    }),
  ]),
  // dynamic_tools.ts debug_plugin: basari yalniz x64dbg'de (cdb/frida
  // capability hatasidir); status kurulu eklenti satirlarini (PluginRow),
  // dump/hide dosya listesini tasir; pencere hic acilmaz.
  debug_plugin: z.union([
    z.object({
      session_id: z.string(),
      engine: z.literal("x64dbg"),
      action: z.literal("status"),
      window_opened: z.literal(false),
      installs: z.array(
        z.object({
          arch: z.enum(["x64", "x86"]),
          debugger_dir: z.string(),
          plugins_dir: z.string(),
          gui_dll: z.string(),
          gui_dll_present: z.boolean(),
          hide_plugins: z.array(z.string()),
          dump_plugins: z.array(z.string()),
        }),
      ),
      limits: z.string(),
    }),
    z.object({
      session_id: z.string(),
      engine: z.literal("x64dbg"),
      action: z.literal("dump"),
      window_opened: z.literal(false),
      plugins: z.array(z.string()),
      detail: z.string(),
    }),
    z.object({
      session_id: z.string(),
      engine: z.literal("x64dbg"),
      action: z.literal("hide"),
      window_opened: z.literal(false),
      present: z.literal(true),
      plugins: z.array(z.string()),
      detail: z.string(),
    }),
  ]),
  // dynamic_tools.ts debug_time: timeline sinirlari + Checkpoint dizisi,
  // snapshot tek Checkpoint, rewind geri yazma ozeti doner (Checkpoint sekli
  // snapshots.ts'ten birebirdir; frida'da register geri yazma ayri ajan
  // cagrisidir, basarisizsa registers_restored false + register_detail dolar).
  debug_time: z.union([
    z.object({
      session_id: z.string(),
      engine: z.enum(["x64dbg", "cdb", "frida"]),
      action: z.literal("timeline"),
      limits: z.string(),
      checkpoints: z.array(
        z.object({
          id: z.string(),
          sessionId: z.string(),
          at: z.string(),
          engine: z.string(),
          address: z.string(),
          threadId: z.number().nullable(),
          registers: z.record(z.string(), z.string()),
          threads: z.array(
            z.object({
              id: z.number(),
              current: z.boolean(),
              state: z.string().nullable(),
              entry: z.string().nullable(),
            }),
          ),
          memoryAddress: z.string(),
          memoryHex: z.string(),
          limits: z.string(),
        }),
      ),
    }),
    z.object({
      session_id: z.string(),
      engine: z.enum(["x64dbg", "cdb", "frida"]),
      action: z.literal("snapshot"),
      checkpoint: z.object({
        id: z.string(),
        sessionId: z.string(),
        at: z.string(),
        engine: z.string(),
        address: z.string(),
        threadId: z.number().nullable(),
        registers: z.record(z.string(), z.string()),
        threads: z.array(
          z.object({
            id: z.number(),
            current: z.boolean(),
            state: z.string().nullable(),
            entry: z.string().nullable(),
          }),
        ),
        memoryAddress: z.string(),
        memoryHex: z.string(),
        limits: z.string(),
      }),
    }),
    z.object({
      session_id: z.string(),
      engine: z.enum(["x64dbg", "cdb", "frida"]),
      action: z.literal("rewind"),
      checkpoint_id: z.string(),
      memory_restored: z.literal(true),
      bytes_written: z.number(),
      registers_restored: z.boolean(),
      register_detail: z.string().nullable(),
      address: z.string(),
      limits: z.string(),
    }),
  ]),
};

// Salt-okunur + kapali dunya: yalniz surec-ici registry okur; motora, alt
// surece veya hedef surece hic dokunmaz. events_pull tuketmez (EventBuffer.pull
// halka uzerinde sirf okur), o yuzden tekrarli cagri ek etki yapmaz.
const READ_ONLY_CLOSED: ReadonlySet<string> = new Set([
  "health", // yalniz registry.size sayisi; "motora dokunmaz" kayit aciklamasinda da sabit
  "session_list",
  "events_pull",
]);

// Yikici kume: mevcut oturum/hedef/surec durumunu sonlandirir, degistirir veya
// hedefin yurutulmesine/bellegine/koduna yazar. Gerekceler handler bazindadir:
// - session_close: oturumu siler, r2 + tum debug motor sureclerini kapatir,
//   checkpoint'lari temizler.
// - open_target: radare2Engine.open once ayni oturumdaki eski hedefi kapatir
//   (close cagrisi) ve yeni r2 sureci baslatir; close_target hedefi ve r2
//   surecini birakir.
// - debug_open/debug_attach: canli hedef baslatir/baglanir, eski checkpoint'lari
//   temizler (clearCheckpoints); attach calisan sureci duraklatir.
// - debug_close: baslatilan hedef durdurulur (eklenmis olan ayrilir),
//   checkpoint'lar temizlenir.
// - debug_breakpoint: set/remove; yazilim breakpoint'i hedef koduna kirilma
//   bayti yazar, donanim tipleri debug register'larini degistirir.
// - debug_continue/debug_step/debug_pause: debuggee yurutmesini surdurur,
//   adimlar veya keser -- hedef surecin durumu geri dondurulemez bicimde ilerler.
// - debug_code: assemble canli surece kod bayti yazar; run_to yurutur.
// - debug_thread: select/freeze/thaw is parcacigi secimini ve zamanlamayi degistirir.
// - debug_time: rewind checkpoint bellegini ve register'larini hedefe geri yazar (writeMemory).
// Bilerek disarida: debug_memory (action yalniz read/search/dump; yazma yok) ve
// debug_plugin (handler yalniz plugins dizinini tarar, dump/hide gercekte
// uygulanmaz) -- isimlerine degil handler etkilerine gore yikici degillerdir.
const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set([
  "session_close",
  "open_target",
  "close_target",
  "debug_open",
  "debug_attach",
  "debug_close",
  "debug_breakpoint",
  "debug_continue",
  "debug_step",
  "debug_pause",
  "debug_code",
  "debug_thread",
  "debug_time",
]);

// Dis dunya kume: harici motor sureciyle (radare2/x64dbg/cdb/frida) veya canli
// hedef surecle konusur, ya da host ortamina cikar (prerequisites). Salt-okunur
// bile gorunse (disassemble, debug_registers...) cagri motor oturumunun
// durumundan gecer; rea tarafindaki "motor/surec etkileyen readOnly olmaz"
// cizgisi burada da korunur. Yalniz su dort arac kapalidir: health,
// session_list, events_pull (surec-ici registry) ve session_open (henuz motor
// sureci baslatmaz, yalniz registry kaydi acar).
const OPEN_WORLD_TOOLS: ReadonlySet<string> = new Set([
  "session_close", // motor sureclerini kapatir
  "static_info", // r2 varligini yoklar + motordan hedef bilgisi okur
  "open_target", "close_target", "disassemble", "get_cfg", "xrefs", "strings", "dump",
  "debug_open", "debug_attach", "debug_close", "debug_state", "debug_breakpoint",
  "debug_continue", "debug_step", "debug_pause", "debug_registers", "debug_callstack",
  "debug_memory", "debug_code", "debug_thread", "debug_plugin", "debug_time",
  "explain", // instructions verilirse saftir ama session_id dalinda radare2/canli debug okur
  "prerequisites", // PATH/homedir tarar, python alt sureciyle bit yoklamasi yapar
]);

const READ_ONLY_CLOSED_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

// prerequisites hicbir seyi degistirmez (salt host yoklamasi) ama alt surec
// calistirip dosya sistemi taradigi icin kapali dunya degildir. Bu yalniz MCP
// isaretidir; httpPolicy.ts'nin tokensiz-HTTP allowlist'i ayri politikadir ve
// prerequisites orada bilerek disaridadir.
const PREREQUISITES_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

// session_open her cagrida yeni bir oturum ekler: yazan ama yikici olmayan,
// tekrarlaninca ek kayit acan (idempotent degil), motor baslatmayan kapali etki.
const SESSION_OPEN_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

// Acik kumelerden annotations turetir; kumelerin disindaki bilinen arac
// yalniz acik readOnlyHint:false alir. Yikici/dis-dunya araclarda idempotent
// ve (yikici degilse) destructive alanlari bilerek bos birakilir; yanlis
// guvence vermek yokluktan kotudur (toolMetadata.ts ile ayni kural).
function annotationsFor(ad: string): ToolAnnotations | undefined {
  if (!CONDUIT_TOOL_NAMES.includes(ad)) return undefined;
  if (READ_ONLY_CLOSED.has(ad)) return READ_ONLY_CLOSED_ANNOTATIONS;
  if (ad === "prerequisites") return PREREQUISITES_ANNOTATIONS;
  if (ad === "session_open") return SESSION_OPEN_ANNOTATIONS;
  return {
    readOnlyHint: false,
    ...(DESTRUCTIVE_TOOLS.has(ad) ? { destructiveHint: true } : {}),
    ...(OPEN_WORLD_TOOLS.has(ad) ? { openWorldHint: true } : {}),
  };
}

// Arac adina metadata; dondurulmus 30 disindaki ad icin undefined.
export function conduitToolMetadata(ad: string): ConduitToolMetadata | undefined {
  const outputSchema = OUTPUT_SCHEMAS[ad];
  const annotations = annotationsFor(ad);
  if (!outputSchema && !annotations) return undefined;
  return {
    ...(outputSchema ? { outputSchema } : {}),
    ...(annotations ? { annotations } : {}),
  };
}

// Duz JSON nesnesi: dizi/sinif ornegi degil, yalin prototipli nesne
// (registerReaTools.ts'deki ayni olcut).
function duzNesne(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v) as unknown;
  return p === Object.prototype || p === null;
}

// Conduit handler sonucu zaten hazir MCP zarfidir ({content:[text], isError?}).
// text kanali AYNEN korunur; ilk text icerigi duz JSON nesnesiyse ayni deger
// structuredContent olarak eklenir, iki kanal birebir ayni JSON'u tasir.
// structuredContent zaten varsa dokunulmaz (cift uretim yok); dizi/sayi/metin
// JSON'i ve parse edilemeyen metin structuredContent almaz. Engel hicbir zaman
// hataya donusmez: supheli her sekil sonuc aynen gecer.
function structuredIle(sonuc: unknown): unknown {
  if (!duzNesne(sonuc)) return sonuc;
  if (sonuc.structuredContent !== undefined) return sonuc;
  const icerik = sonuc.content;
  if (!Array.isArray(icerik)) return sonuc;
  const ilk = icerik.find(
    (c): c is { type: "text"; text: string } =>
      duzNesne(c) && c.type === "text" && typeof c.text === "string",
  );
  if (!ilk) return sonuc;
  try {
    const v: unknown = JSON.parse(ilk.text);
    return duzNesne(v) ? { ...sonuc, structuredContent: v as JSONObject } : sonuc;
  } catch {
    return sonuc;
  }
}

/**
 * Kayit sarmalayicisi: `register` icindeki registerTool cagrilarina (server.ts
 * bunu yalniz conduit registerTools cagrisi etrafinda kurar) sunlari uygular:
 * - Bilinen 30 aractan biriyse config'e annotations ve (varsa) outputSchema
 *   eklenir; kaydin kendi degeri varsa ezilmez. Bilinmeyen ad metadata almaz.
 * - Handler sonucu structuredIle() ile gecer: text korunarak, isError aynen
 *   kalacak sekilde structuredContent eklenir. Bu mekanik donusum tum conduit
 *   kayitlarina uygulanir; yeni arac annotations almadan da iki kanalli doner
 *   ve conduit-surface testi isimsiz kaydi sayiyla yakalar.
 * toolsets/httpPolicy sarmalayicilariyla ayni desen: gercek registerTool,
 * server `this` baglamiyla cagrilir, golge ozellik finally'de geri alinir.
 * Ic ice kurulumda (toolset -> audit -> bu) her katman bir disindaki golgeyi
 * "gercek" sayip ona devreder.
 */
export function registerWithConduitSurface(server: McpServer, register: () => void): void {
  const hedef = server as unknown as { registerTool: (...args: unknown[]) => unknown };
  const gercek = hedef.registerTool;
  const kendiOzelligi = Object.prototype.hasOwnProperty.call(server, "registerTool");
  hedef.registerTool = (...args: unknown[]): unknown => {
    const ad = args[0];
    const config = args[1];
    const handler = args[args.length - 1];
    if (typeof ad !== "string" || !duzNesne(config) || typeof handler !== "function" || args.length < 2) {
      return Reflect.apply(gercek, server, args) as unknown;
    }
    const meta = conduitToolMetadata(ad);
    const yeniConfig: Record<string, unknown> = { ...config };
    if (meta?.outputSchema && yeniConfig.outputSchema === undefined) {
      yeniConfig.outputSchema = meta.outputSchema;
    }
    if (meta?.annotations && yeniConfig.annotations === undefined) {
      yeniConfig.annotations = meta.annotations;
    }
    const sarilmis = async (...hargs: unknown[]): Promise<unknown> =>
      structuredIle(await Reflect.apply(handler as (...a: unknown[]) => unknown, undefined, hargs));
    return Reflect.apply(gercek, server, [ad, yeniConfig, ...args.slice(2, -1), sarilmis]) as unknown;
  };
  try {
    register();
  } finally {
    if (kendiOzelligi) hedef.registerTool = gercek;
    else delete (server as unknown as Record<string, unknown>).registerTool;
  }
}
