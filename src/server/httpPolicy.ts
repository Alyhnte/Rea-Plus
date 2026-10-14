// rea-plus HTTP guvenlik politikasi: tokensiz salt-okunur yuzey, audit JSONL,
// IP basina hiz limiti ve eszamanlilik kapisi.
// Kurallar:
// - DBG_BRIDGE_TOKEN yoksa HTTP fabrikasi yalniz HTTP_READ_ONLY_TOOLS'u kaydeder
//   (fail-closed: listede olmayan/yeni eklenen arac tokensiz HTTP'de gorunmez).
// - Token varken bu modul arac yuzeyini daraltmaz; REA_TOOLSETS aynen gecerlidir.
//   Tokensiz modda sonuc, toolset kumesi ile allowlist'in KESISIMIDIR.
// - Audit kaydi yalniz zaman/transport/tool/sure/isError tasir; arguman, token,
//   hedef icerigi veya yol ASLA yazilmaz. Yazma hatasi sunucuyu cokertmez.
import { appendFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/server";

// Allowlist olcutu (her uye handler'i kaynakta dogrulanmistir): girdi yalniz
// satir-ici veridir (metin/b64/hex/sayi/JSON); handler dosya okumaz/yazmaz, alt
// surec calistirmaz, aga/cihaza/tarayiciya cikmaz, session/surec durumu tutmaz
// veya degistirmez. YOL parametresi alan hicbir arac listede yoktur: tokensiz
// cagiran, host dosya sistemini okuma oraclegi olarak kullanamaz.
// Bilerek disarida birakilan yakin adaylar:
// - prerequisites: python alt sureci (spawnSync) + PATH/homedir taramasi yapar.
// - explain/session_*/events_pull/static_*: session durumu okur; explain canli
//   debug oturumundan disassembly cekebilir. open_target/debug_* zaten motor
//   sureci calistirir.
// - rea_crash_kayit_parse/rea_crash_ozet: metin girdisi mevcut bir yolsa dosyayi
//   okur (metniCoz) -- keyfi dosya okuma yuzeyidir.
// - rea_managed_verify/rea_managed_import: girdisi JSON metni olsa da parametresi
//   "path" adlidir; belirsiz yuzey fail-closed disarida kalir.
// - rea_investigate ve tum path'li statik okuyucular (pe_*, jadx_read, dwarf...):
//   host dosyasini okur. *_caps araclari alt surecle yetenek yoklar.
// - rea_evidence_bundle/rea_obligation_ledger/advance/close/rea_crash_append/
//   rea_recon_tag: durum kuran/ilerleten donusumlerdir, salt-okunur degildir.
// - Yazan (out'lu decompile/unpack/build/screencap/shot), surec calistiran
//   (rea_process_*, ghidra/cutter/r2/ilspy/upx kopruleri), debug/Frida, adb,
//   browser ve ag (net_capture, jeb_sorgu, storage/console) araclarinin tamami.
export const HTTP_READ_ONLY_TOOLS: readonly string[] = [
  // conduit: yalniz kopru canliligi + session SAYISI; motora/surece dokunmaz.
  "health",
  // toolMetadata.ts READ_ONLY kumesiyle ayni cekirdek: saf, surec-ici hesap.
  "rea_evm_selector", // imzadan keccak selector (offline)
  "rea_wasm_exports", // WAT metninde export taramasi
  "rea_evm_disasm", // hex bytecode cozumleme
  "rea_coverage", // iki sayidan oran
  "rea_sniff", // cagiranin verdigi b64 baytlarinda magic-byte (dosya yolu almaz)
  "rea_best_motor", // tip + aday listesinden skor
  "rea_fallback", // isim kumelerinden yedek zinciri
  "rea_missing_reason", // statik katalogdan neden + kurulum komutu metni
  "rea_config_suggest", // isim listesinden config snippet metni
  "rea_readiness", // metin girdiden hazirlik skoru
  // WASM/EVM: b64/hex girdiyi surec icinde cozer (WasmInfo/EvmInfo saf).
  "rea_wasm_sections",
  "rea_wasm_imports",
  "rea_evm_stats",
  "rea_evm_selectors",
  // DOS/MIPS: b64 baytlar uzerinde baslik/struct cozumleme.
  "rea_dos_mz",
  "rea_dos_int21",
  "rea_mips_funcs",
  "rea_mips_psp_profile",
  "rea_dos_psp",
  // AOT/Go/pwn ipuclari: b64/metin girdide imza ve kalip taramasi.
  "rea_aot_detect",
  "rea_aot_objc",
  "rea_aot_swift",
  "rea_aot_profile",
  "rea_go_module",
  "rea_go_version",
  "rea_pwn_gadgets", // metindeki "gadget:" satirlarini sayar; ELF okumaz
  // JS/diff/recon: metin/JSON girdiden ozet ve iskelet metni uretir, yazmaz.
  "rea_js_sourcemap",
  "rea_js_bundle",
  "rea_diff_match",
  "rea_diff_summary",
  "rea_recon_funcs",
  "rea_recon_harness",
  // Davranis/crash: cagiranin verdigi olay JSON'unu ozetler (kayit toplamaz).
  "rea_behavior_timeline",
  "rea_behavior_full",
  "rea_dosya_izi",
  "rea_registry_izi",
  "rea_crash_timeline",
  "rea_crash_hint",
  // Dogrulama/karsilastirma: girdiyi degistirmeden yalniz denetler/farklar.
  "rea_evidence_verify",
  "rea_obligation_verify",
  "rea_managed_compare", // iki uye JSON'unun farki (a/b metindir, yol degil)
  "rea_fs_diff", // iki snapshot JSON'unun farki; dizin tarayan snapshot disarida
  "rea_typedef_oner", // metinden arguman adi onerisi
];

export const HTTP_READ_ONLY_TOOL_SET: ReadonlySet<string> = new Set(HTTP_READ_ONLY_TOOLS);

/**
 * Toolset kumesiyle tokensiz-HTTP allowlist'ini birlestirir.
 * readOnlyOnly=false ise toolset sonucu aynen doner (null = tam yuzey).
 * readOnlyOnly=true ise sonuc her zaman bir kumedir: toolset yoksa allowlist,
 * varsa kesisim (hicbir arac allowlist disindan sizamaz).
 */
export function httpReadOnlyAllowed(
  toolsetAllowed: ReadonlySet<string> | null,
  readOnlyOnly: boolean,
): ReadonlySet<string> | null {
  if (!readOnlyOnly) return toolsetAllowed;
  if (toolsetAllowed === null) return HTTP_READ_ONLY_TOOL_SET;
  return new Set([...toolsetAllowed].filter((ad) => HTTP_READ_ONLY_TOOL_SET.has(ad)));
}

// --- HTTP limitleri (env) ----------------------------------------------------

export const DEFAULT_HTTP_RATE_LIMIT_PER_MIN = 120;
export const DEFAULT_HTTP_MAX_CONCURRENT = 16;

export interface HttpLimits {
  rateLimitPerMin: number;
  maxConcurrent: number;
}

/** Pozitif tam sayi env degeri; gecersizse sessiz varsayilana DUSMEZ, acik hata firlatir. */
export function parsePositiveIntEnv(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const metin = raw.trim();
  if (!/^[0-9]+$/.test(metin)) {
    throw new Error(`${name} gecersiz: "${raw}" pozitif tam sayi olmali (orn. ${fallback}).`);
  }
  const deger = Number(metin);
  if (!Number.isSafeInteger(deger) || deger < 1) {
    throw new Error(`${name} gecersiz: "${raw}" pozitif tam sayi olmali (orn. ${fallback}).`);
  }
  return deger;
}

export function parseHttpLimits(env: NodeJS.ProcessEnv = process.env): HttpLimits {
  return {
    rateLimitPerMin: parsePositiveIntEnv(
      "REA_HTTP_RATE_LIMIT_PER_MIN",
      env.REA_HTTP_RATE_LIMIT_PER_MIN,
      DEFAULT_HTTP_RATE_LIMIT_PER_MIN,
    ),
    maxConcurrent: parsePositiveIntEnv(
      "REA_HTTP_MAX_CONCURRENT",
      env.REA_HTTP_MAX_CONCURRENT,
      DEFAULT_HTTP_MAX_CONCURRENT,
    ),
  };
}

// --- Hiz limiti: anahtar (IP) basina sabit pencere -----------------------------

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
}

function pozitifTamSayi(name: string, deger: number): number {
  if (!Number.isSafeInteger(deger) || deger < 1) {
    throw new Error(`${name} pozitif tam sayi olmali; gelen: ${deger}.`);
  }
  return deger;
}

/**
 * Saf, test edilebilir sabit-pencere sinirlayici. Zaman enjekte edilebilir
 * (nowMs); pencere sinirinda sayac sifirlanir. Suresi dolmus anahtarlar
 * firsatci bicimde temizlenir, boylece harita sinirsiz buyumez.
 */
export class FixedWindowRateLimiter {
  readonly limitPerWindow: number;
  readonly windowMs: number;
  private readonly buckets = new Map<string, { windowStart: number; count: number }>();

  constructor(limitPerWindow: number, windowMs = 60_000) {
    this.limitPerWindow = pozitifTamSayi("limitPerWindow", limitPerWindow);
    this.windowMs = pozitifTamSayi("windowMs", windowMs);
  }

  get trackedKeys(): number {
    return this.buckets.size;
  }

  prune(nowMs: number = Date.now()): void {
    const pencere = Math.floor(nowMs / this.windowMs) * this.windowMs;
    for (const [anahtar, kova] of this.buckets) {
      if (kova.windowStart < pencere) this.buckets.delete(anahtar);
    }
  }

  check(key: string, nowMs: number = Date.now()): RateLimitDecision {
    if (this.buckets.size > 4096) this.prune(nowMs);
    const pencere = Math.floor(nowMs / this.windowMs) * this.windowMs;
    const bitis = pencere + this.windowMs;
    let kova = this.buckets.get(key);
    if (!kova || kova.windowStart !== pencere) {
      kova = { windowStart: pencere, count: 0 };
      this.buckets.set(key, kova);
    }
    if (kova.count >= this.limitPerWindow) {
      return { allowed: false, limit: this.limitPerWindow, remaining: 0, retryAfterMs: Math.max(0, bitis - nowMs) };
    }
    kova.count += 1;
    return {
      allowed: true,
      limit: this.limitPerWindow,
      remaining: this.limitPerWindow - kova.count,
      retryAfterMs: 0,
    };
  }
}

export function createRateLimiter(limitPerWindow: number, windowMs = 60_000): FixedWindowRateLimiter {
  return new FixedWindowRateLimiter(limitPerWindow, windowMs);
}

// --- Eszamanlilik kapisi --------------------------------------------------------

/**
 * Aktif istek tavani. acquire() basarida TEK seferlik (idempotent) bir release
 * fonksiyonu doner; response "finish" ve "close" ikisi de tetiklense bile
 * sayac bir kez duser ve asla eksiye inmez.
 */
export class ConcurrencyGate {
  readonly maxConcurrent: number;
  private activeCount = 0;

  constructor(maxConcurrent: number) {
    this.maxConcurrent = pozitifTamSayi("maxConcurrent", maxConcurrent);
  }

  get active(): number {
    return this.activeCount;
  }

  acquire(): (() => void) | null {
    if (this.activeCount >= this.maxConcurrent) return null;
    this.activeCount += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeCount = Math.max(0, this.activeCount - 1);
    };
  }
}

export function createConcurrencyGate(maxConcurrent: number): ConcurrencyGate {
  return new ConcurrencyGate(maxConcurrent);
}

// --- Audit JSONL ------------------------------------------------------------------

export type AuditTransport = "http" | "stdio";

export interface AuditEntry {
  transport: AuditTransport;
  tool: string;
  durationMs: number;
  isError: boolean;
  ts?: string;
}

export interface AuditLogger {
  readonly enabled: boolean;
  record(entry: AuditEntry): void;
}

const GUVENLI_ARAC_ADI = /^[A-Za-z0-9_.-]+$/;

/**
 * REA_AUDIT_LOG icin JSONL yazici. Kayit formati sabittir ve yalniz su alanlari
 * tasir: {ts, transport, tool, durationMs, isError}. Arguman/icerik/yol/token
 * hicbir kosulda satira girmez. Ilk yazma hatasinda stderr'e TEK uyari basilir
 * (yol sizdirmamak icin hata mesaji degil yalniz kodu) ve logger kendini kapatir;
 * record() asla firlatmaz.
 */
export function createAuditLogger(options: {
  path?: string | undefined;
  warn?: (mesaj: string) => void;
  append?: (path: string, satir: string) => void;
} = {}): AuditLogger {
  const yol = options.path?.trim() ? options.path : undefined;
  const warn = options.warn ?? ((m: string) => console.error(m));
  const append = options.append ?? ((p: string, s: string) => appendFileSync(p, s, "utf8"));
  let kapali = yol === undefined;
  return {
    get enabled() {
      return !kapali;
    },
    record(entry: AuditEntry): void {
      if (kapali || yol === undefined) return;
      const satir =
        JSON.stringify({
          ts: entry.ts ?? new Date().toISOString(),
          transport: entry.transport === "http" ? "http" : "stdio",
          tool: GUVENLI_ARAC_ADI.test(entry.tool) ? entry.tool : "unknown",
          durationMs: Number.isFinite(entry.durationMs) && entry.durationMs >= 0 ? Math.round(entry.durationMs) : 0,
          isError: entry.isError === true,
        }) + "\n";
      try {
        append(yol, satir);
      } catch (e) {
        kapali = true;
        const kod =
          e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string"
            ? (e as { code: string }).code
            : "yazma_hatasi";
        try {
          warn(`[rea-plus] UYARI: REA_AUDIT_LOG yazilamadi (${kod}); audit kaydi devre disi birakildi.`);
        } catch {
          // Uyarinin kendisi bile sunucuyu cokertemez.
        }
      }
    },
  };
}

export function auditLoggerFromEnv(env: NodeJS.ProcessEnv = process.env): AuditLogger {
  return createAuditLogger({ path: env.REA_AUDIT_LOG });
}

/**
 * Kayit sarmalayicisi: registerTool cagrilarindaki handler'i sure/isError olcen
 * ince bir katmanla sarar; sonuc ve firlatilan hata aynen gecer, yalniz audit
 * kaydi eklenir. Logger kapaliyken hicbir seye dokunulmaz. toolsets.ts'deki
 * filtreyle ayni desen: gercek registerTool, server `this` baglamiyla cagrilir
 * ve golge ozellik finally'de geri alinir.
 */
export function registerWithAudit(
  server: McpServer,
  logger: AuditLogger,
  transport: AuditTransport,
  register: () => void,
): void {
  if (!logger.enabled) {
    register();
    return;
  }
  const hedef = server as unknown as { registerTool: (...args: unknown[]) => unknown };
  const gercek = hedef.registerTool;
  const kendiOzelligi = Object.prototype.hasOwnProperty.call(server, "registerTool");
  hedef.registerTool = (...args: unknown[]): unknown => {
    const ad = args[0];
    const handler = args[args.length - 1];
    if (typeof ad !== "string" || typeof handler !== "function" || args.length < 2) {
      return Reflect.apply(gercek, server, args) as unknown;
    }
    const sarilmis = async (...hargs: unknown[]): Promise<unknown> => {
      const baslangic = new Date();
      const t0 = performance.now();
      let isError = false;
      try {
        const sonuc: unknown = await Reflect.apply(handler as (...a: unknown[]) => unknown, undefined, hargs);
        isError =
          sonuc !== null &&
          typeof sonuc === "object" &&
          (sonuc as { isError?: unknown }).isError === true;
        return sonuc;
      } catch (e) {
        isError = true;
        throw e;
      } finally {
        logger.record({
          ts: baslangic.toISOString(),
          transport,
          tool: ad,
          durationMs: performance.now() - t0,
          isError,
        });
      }
    };
    return Reflect.apply(gercek, server, [...args.slice(0, -1), sarilmis]) as unknown;
  };
  try {
    register();
  } finally {
    if (kendiOzelligi) hedef.registerTool = gercek;
    else delete (server as unknown as Record<string, unknown>).registerTool;
  }
}
