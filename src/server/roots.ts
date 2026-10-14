// MCP Roots pilotu (legacy push): istemci kokleri REA_WORKSPACE_ROOT sinirini yalniz daraltir.
//
// SDK 2.3.1 ile tip + runtime govdesinden yeniden dogrulanan sinir (2026-10-13):
// - Legacy (2025) yolda dusuk seviyeli Server.listRoots(params?, options?) calisir:
//   govde dogrudan `roots/list` istegi gonderir; Root semasi uri'nin "file://" ile
//   baslamasini sart kosar, istemci yetenegi `capabilities.roots` ({listChanged?}) ister.
// - Modern 2026-07-28 yolunda ayni cagri, tel trafigi olmadan SdkError
//   MethodNotSupportedByProtocolVersion firlatir ve inputRequired({...}) cok turlu
//   (MRTR) akisa yonlendirir: handler `inputRequired({ inputRequests: { kokler:
//   inputRequired.listRoots() } })` donmeli, istemci ListRootsResult'i inputResponses
//   ile geri tasimali, requestState butunlugu ayrica korunmalidir.
// Bu dilim MRTR akisini ZORLAMAZ: modern cagri sahte basari uretmez, yapilandirilmis
// "modern-mrtr-required" durumu doner; tam MRTR entegrasyonu ayri istir. Kanit:
// tests/roots.test.mjs (legacy InMemoryTransport ile gercek roots/list + modern dal).
//
// Guvenlik sozlesmesi:
// - Varsayilan KAPALI: yalniz REA_ROOTS=1 VE fabrika opsiyonu roots:true birlikte etkin
//   (server.ts bunu yalniz startStdio'da gecirir; HTTP stateless fabrikasi gecirmez,
//   surec geneli kok sizintisi olmaz).
// - file:// disi semalar ve host'lu file URI'leri (UNC) reddedilir; donusum fileURLToPath iledir.
// - REA_WORKSPACE_ROOT sert sinirdir: istemci koku yalniz kesisim/daraltma yapar,
//   genisletme denemesi env kokune kirpilir, ayrik kok reddedilir (bkz. intersectRoots).
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOTS_OPT_IN_ENV = "REA_ROOTS";

/** Acik opt-in: yalniz birebir "1" etkinlestirir; her baska deger varsayilan kapali davranistir. */
export function isRootsOptIn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.REA_ROOTS === "1";
}

/** Etkinlesme = fabrika opsiyonu VE env opt-in'i; biri eksikse mevcut davranis birebir korunur. */
export function resolveRootsEnabled(factoryOpt: boolean | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return factoryOpt === true && isRootsOptIn(env);
}

function kanonikYol(p: string): string {
  try {
    return realpathSync.native(p);
  } catch {
    return resolve(p);
  }
}

export type RootUriResult =
  | { ok: true; path: string }
  | { ok: false; uri: unknown; reason: string };

/**
 * file:// URI -> yerel yol. Non-file sema, host (UNC) ve gecersiz bicim reddedilir;
 * "localhost" host'u file semasinin yerel karsiligi olarak kabul edilir.
 */
export function fileUriToLocalPath(uri: unknown): RootUriResult {
  if (typeof uri !== "string" || uri.length === 0 || uri.includes("\0")) {
    return { ok: false, uri, reason: "uri bos ya da metin degil" };
  }
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return { ok: false, uri, reason: "uri cozulemedi" };
  }
  if (u.protocol !== "file:") return { ok: false, uri, reason: `file:// disi sema reddedildi: ${u.protocol}` };
  if (u.hostname !== "" && u.hostname.toLowerCase() !== "localhost") {
    return { ok: false, uri, reason: `host'lu file URI reddedildi (UNC): ${u.hostname}` };
  }
  let yol: string;
  try {
    yol = fileURLToPath(u);
  } catch {
    return { ok: false, uri, reason: "file URI yerel yola cevrilemedi" };
  }
  if (yol.startsWith("\\\\")) return { ok: false, uri, reason: "UNC yolu reddedildi" };
  return { ok: true, path: kanonikYol(yol) };
}

export function rootUriToPath(uri: unknown): string | null {
  const r = fileUriToLocalPath(uri);
  return r.ok ? r.path : null;
}

/** Prefix kardesini kabul etmeyen icerme (workspaceRoot ile ayni kural). */
export function isPathWithinRoot(kok: string, aday: string): boolean {
  const fark = relative(kok, aday);
  return fark === "" || (fark !== ".." && !fark.startsWith(".." + sep) && !isAbsolute(fark));
}

export interface RootsIntersection {
  effective: string[];
  rejected: { path: string; reason: string }[];
  clamped: { client: string; env: string }[];
}

/**
 * Env kokleri sert sinir: istemci koku env icindeyse daraltir, env kokunu kapsiyorsa
 * env kokune kirpilir (genisletme yok), ayriksa reddedilir. Env yoksa istemci kokleri
 * etkin koktur. Cagiran, env varken bos kesisimi nasil yorumlayacagina karar verir
 * (workspaceRoot sert siniri korumak icin env koklerine doner).
 */
export function intersectRoots(envRoots: readonly string[], clientRoots: readonly string[]): RootsIntersection {
  const env = [...new Set(envRoots.map(kanonikYol))];
  const istemci = [...new Set(clientRoots.map(kanonikYol))];
  if (env.length === 0) return { effective: istemci, rejected: [], clamped: [] };
  const effective: string[] = [];
  const rejected: RootsIntersection["rejected"] = [];
  const clamped: RootsIntersection["clamped"] = [];
  const ekle = (p: string) => { if (!effective.includes(p)) effective.push(p); };
  for (const c of istemci) {
    if (env.some((e) => isPathWithinRoot(e, c))) {
      ekle(c);
      continue;
    }
    const kapsanan = env.find((e) => isPathWithinRoot(c, e));
    if (kapsanan !== undefined) {
      clamped.push({ client: c, env: kapsanan });
      ekle(kapsanan);
      continue;
    }
    rejected.push({ path: c, reason: "REA_WORKSPACE_ROOT ile kesisim yok (genisletme reddedildi)" });
  }
  return { effective, rejected, clamped };
}

// Dinamik istemci kok deposu: ornek bazli yaratilabilir (test izolasyonu),
// surec geneli tekil ornek yalniz opt-in acikken server.ts tarafindan doldurulur.
export interface ClientRootsStore {
  get(): string[];
  set(paths: readonly string[]): string[];
  clear(): void;
}

export function createClientRootsStore(): ClientRootsStore {
  let kokler: string[] = [];
  return {
    get: () => [...kokler],
    set: (paths) => {
      kokler = [...new Set(paths.map(kanonikYol))];
      return [...kokler];
    },
    clear: () => { kokler = []; },
  };
}

export const clientRootsStore: ClientRootsStore = createClientRootsStore();
export const getClientRoots = (): string[] => clientRootsStore.get();
export const setClientRoots = (paths: readonly string[]): string[] => clientRootsStore.set(paths);
export const clearClientRoots = (): void => clientRootsStore.clear();

/** ListRootsResult bicimini dogrular; cevrilemeyen URI'ler rejected'a duser, bicim bozuksa firlatir. */
export function parseListRootsResult(result: unknown): { paths: string[]; rejected: { uri: unknown; reason: string }[] } {
  if (!result || typeof result !== "object" || !Array.isArray((result as { roots?: unknown }).roots)) {
    throw new TypeError("roots/list sonucu {roots: [...]} biciminde degil");
  }
  const paths: string[] = [];
  const rejected: { uri: unknown; reason: string }[] = [];
  for (const giris of (result as { roots: unknown[] }).roots) {
    const uri = giris && typeof giris === "object" ? (giris as { uri?: unknown }).uri : undefined;
    const r = fileUriToLocalPath(uri);
    if (r.ok) { if (!paths.includes(r.path)) paths.push(r.path); }
    else rejected.push({ uri: r.uri, reason: r.reason });
  }
  return { paths, rejected };
}

export type RootsRefreshStatus = "disabled" | "ok" | "unsupported" | "modern-mrtr-required" | "error";

export interface RootsRefreshResult {
  status: RootsRefreshStatus;
  detail: string;
  /** Islem sonrasinda depodaki kokler (hata dallarinda onceki deger aynen korunur). */
  roots: string[];
  rejected: { uri: unknown; reason: string }[];
}

/** Legacy dusuk seviye Server'in bu dilimde kullanilan yapisal yuzeyi (sahte sunucularla test edilebilir). */
export interface LegacyRootsServerLike {
  listRoots?: (params?: unknown, options?: unknown) => Promise<unknown>;
  getClientCapabilities?: () => { roots?: unknown } | undefined;
  oninitialized?: () => void;
  setNotificationHandler?: (method: string, handler: (notification: unknown) => void) => void;
  removeNotificationHandler?: (method: string) => void;
}

/** McpServer ise `.server` altindaki dusuk seviye Server'i, dogrudan verilmisse kendisini cozer. */
export function legacyServerOf(target: unknown): LegacyRootsServerLike | null {
  if (!target || typeof target !== "object") return null;
  const t = target as LegacyRootsServerLike & { server?: unknown };
  if (typeof t.listRoots === "function") return t;
  if (t.server && typeof t.server === "object") return legacyServerOf(t.server);
  // listRoots'suz ama bildirim yuzeyi tasiyan hedef de sunucudur (unsupported dalini uretir).
  if (typeof t.setNotificationHandler === "function" || typeof t.getClientCapabilities === "function") return t;
  return null;
}

function hataSinifi(e: unknown): RootsRefreshStatus {
  const kod = e && typeof e === "object" ? String((e as { code?: unknown }).code ?? "") : "";
  const mesaj = e instanceof Error ? e.message : String(e);
  const birlesik = `${kod} ${mesaj}`;
  if (/MethodNotSupportedByProtocolVersion|METHOD_NOT_SUPPORTED_BY_PROTOCOL_VERSION|inputRequired|multi round-trip/i.test(birlesik)) {
    return "modern-mrtr-required";
  }
  if (/CapabilityNotSupported|CAPABILITY_NOT_SUPPORTED|does not support listing roots|Method not found|-32601/i.test(birlesik)) {
    return "unsupported";
  }
  return "error";
}

export interface RefreshRootsOptions {
  /** Verilmezse env opt-in'ine bakilir; attach katmani resolveRootsEnabled sonucunu acikca gecirir. */
  enabled?: boolean;
  env?: NodeJS.ProcessEnv;
  store?: ClientRootsStore;
}

/**
 * Legacy listRoots'u bir kez ceker ve depoyu gunceller. Destek yoksa/modern cagda
 * sahte basari uretmez: status alani durumu acikca soyler, depo degismez.
 */
export async function refreshClientRoots(target: unknown, options: RefreshRootsOptions = {}): Promise<RootsRefreshResult> {
  const store = options.store ?? clientRootsStore;
  const etkin = options.enabled ?? isRootsOptIn(options.env);
  if (!etkin) {
    return { status: "disabled", detail: "REA_ROOTS opt-in kapali; listRoots cagrilmadi", roots: store.get(), rejected: [] };
  }
  const srv = legacyServerOf(target);
  if (!srv || typeof srv.listRoots !== "function") {
    return { status: "unsupported", detail: "dusuk seviye sunucuda listRoots yok", roots: store.get(), rejected: [] };
  }
  try {
    const caps = typeof srv.getClientCapabilities === "function" ? srv.getClientCapabilities() : undefined;
    if (caps !== undefined && caps !== null && !caps.roots) {
      return { status: "unsupported", detail: "istemci capabilities.roots ilan etmedi; listRoots cagrilmadi", roots: store.get(), rejected: [] };
    }
  } catch {
    // Yetenek okunamazsa cagri yine denenir; gercek hata asagida siniflanir.
  }
  try {
    const sonuc = await srv.listRoots();
    const { paths, rejected } = parseListRootsResult(sonuc);
    store.set(paths);
    return { status: "ok", detail: `${paths.length} istemci koku alindi`, roots: store.get(), rejected };
  } catch (e) {
    const status = hataSinifi(e);
    const mesaj = e instanceof Error ? e.message : String(e);
    const detail = status === "modern-mrtr-required"
      ? `modern protokol push listRoots desteklemez; MRTR (inputRequired) ayri is: ${mesaj}`
      : mesaj;
    return { status, detail, roots: store.get(), rejected: [] };
  }
}

export interface RootsAttachment {
  enabled: boolean;
  /** notifications/roots/list_changed baglanabildiyse true; SDK reddederse false (acilis yine calisir). */
  listChangedBound: boolean;
  refresh(): Promise<RootsRefreshResult>;
  lastResult(): RootsRefreshResult | null;
  detach(): void;
  clear(): void;
}

export interface AttachRootsOptions extends RefreshRootsOptions {
  onResult?: (r: RootsRefreshResult) => void;
}

/**
 * Legacy baglanti omru: initialized sonrasi bir kez ceker, list_changed'de yeniler.
 * Onceki oninitialized zincirlenir; detach ikisini de geri alir, clear depoyu bosaltir.
 * Kapaliyken hicbir handler degismez (varsayilan davranis birebir).
 */
export function attachLegacyRoots(target: unknown, options: AttachRootsOptions = {}): RootsAttachment {
  const store = options.store ?? clientRootsStore;
  const etkin = options.enabled ?? isRootsOptIn(options.env);
  let son: RootsRefreshResult | null = null;
  const refresh = async (): Promise<RootsRefreshResult> => {
    son = await refreshClientRoots(target, { enabled: etkin, store });
    options.onResult?.(son);
    return son;
  };
  const srv = etkin ? legacyServerOf(target) : null;
  if (!etkin || !srv) {
    return { enabled: false, listChangedBound: false, refresh, lastResult: () => son, detach: () => {}, clear: () => store.clear() };
  }
  const oncekiInit = srv.oninitialized;
  const bizimInit = (): void => {
    oncekiInit?.();
    void refresh();
  };
  srv.oninitialized = bizimInit;
  let listChangedBound = false;
  try {
    if (typeof srv.setNotificationHandler === "function") {
      srv.setNotificationHandler("notifications/roots/list_changed", () => { void refresh(); });
      listChangedBound = true;
    }
  } catch {
    listChangedBound = false; // Bildirim baglanamazsa ilk cekis yine gecerli; sahte baglandi denmez.
  }
  return {
    enabled: true,
    listChangedBound,
    refresh,
    lastResult: () => son,
    detach: () => {
      if (srv.oninitialized === bizimInit) srv.oninitialized = oncekiInit;
      try { srv.removeNotificationHandler?.("notifications/roots/list_changed"); } catch { /* zaten yok */ }
    },
    clear: () => store.clear(),
  };
}


