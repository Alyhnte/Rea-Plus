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

// Output semalari (yalniz 3): donus sekli handler govdesinde kelimesi kelimesine
// sabit ve motor/hedef cevabina yayilmayan (spread'siz) araclar. Diger 27 aracin
// basari sekli engine/action'a gore degisir veya motor sonucunu ...spread ile
// tasir; onlar icin sahte kesinlik yapilmaz, sema verilmez. SDK isError
// sonuclarini semayla dogrulamaz.
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
