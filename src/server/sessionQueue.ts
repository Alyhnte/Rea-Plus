// ReaPlus oturum komut kuyrugu (Dalga A/1).
// Hedef: debugger oturumlarina gelen eszamanli tools/call istekleri yarismasin.
// Ince katman: mevcut conduit session modeline dokunulmaz (registry aynen);
// yalniz session_id tasiyan tool handler'lari oturum bazinda FIFO'ya alinir.
// Kurallar:
// - Ayni oturumun cagrilari sirayla islenir; farkli oturumlar birbirini beklemez.
// - Kuyruk derinligi sinirli (varsayilan 32); tasmada acik hata (session_queue_full).
// - notifications/cancelled SDK'da AbortSignal'e donusur; kuyruktaki bekleyen is duser.
// - Kuyruk durumu session_queue_status araciyla okunur (pending + running).
// - Bekleyen is timeoutMs icinde baslayamazsa acik hatayla duser (session_queue_timeout); kuyruk kilitlenmez.
// - Opt-in: REA_SESSION_QUEUE=1 veya REA_SESSION_SERIALIZE=1 (Dalga I/1) ile
//   etkinlesir (asyncJobs pilotuyla ayni desen); ikisi de yoksa kayit ve
//   davranis birebir korunur (status araci yok).
// - Tum hata zarflari durusttur: isError:true + structuredContent, sahte ok:true YOK.
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

export const SESSION_QUEUE_STATUS_TOOL = "session_queue_status";
export const DEFAULT_SESSION_QUEUE_MAX = 32;
export const DEFAULT_SESSION_QUEUE_TIMEOUT_MS = 30_000;

export function sessionQueueEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env?.REA_SESSION_QUEUE === "1" || sessionSerializeEnabled(env);
}

// Dalga I/1: oturum basina TAM serilestirme anahtari. Tek basina kuyrugu acar:
// ayni oturumun isleri kesinlikle seri kosar, farkli oturumlar paralel ilerler.
export function sessionSerializeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env?.REA_SESSION_SERIALIZE === "1";
}

function parsePozitifInt(name: string, raw: string | undefined, fallback: number): number {
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

export interface SessionQueueConfig {
  enabled: boolean;
  maxDepth: number;
  timeoutMs: number;
}

export function parseSessionQueueConfig(env: NodeJS.ProcessEnv = process.env): SessionQueueConfig {
  const enabled = sessionQueueEnabled(env);
  if (!enabled) {
    return { enabled: false, maxDepth: DEFAULT_SESSION_QUEUE_MAX, timeoutMs: DEFAULT_SESSION_QUEUE_TIMEOUT_MS };
  }
  return {
    enabled: true,
    maxDepth: parsePozitifInt("REA_SESSION_QUEUE_MAX", env?.REA_SESSION_QUEUE_MAX, DEFAULT_SESSION_QUEUE_MAX),
    timeoutMs: parsePozitifInt(
      "REA_SESSION_QUEUE_TIMEOUT_MS",
      env?.REA_SESSION_QUEUE_TIMEOUT_MS,
      DEFAULT_SESSION_QUEUE_TIMEOUT_MS,
    ),
  };
}

// --- Hata tipleri (birim testte code/error uzerinden okunur) -----------------

export class SessionQueueFullError extends Error {
  readonly code = "session_queue_full" as const;
  readonly error = "session_queue_full" as const;
  constructor(
    readonly sessionId: string,
    readonly tool: string | undefined,
    readonly requestId: string,
    readonly pending: number,
    readonly maxDepth: number,
  ) {
    super(`oturum kuyrugu dolu: session '${sessionId}' bekleyen=${pending} tavan=${maxDepth}`);
    this.name = "SessionQueueFullError";
  }
}

export class SessionQueueTimeoutError extends Error {
  readonly code = "session_queue_timeout" as const;
  readonly error = "session_queue_timeout" as const;
  constructor(
    readonly sessionId: string,
    readonly tool: string | undefined,
    readonly requestId: string,
    readonly timeoutMs: number,
  ) {
    super(`oturum kuyrugunda zaman asimi: session '${sessionId}' ${timeoutMs}ms icinde baslayamadi`);
    this.name = "SessionQueueTimeoutError";
  }
}

export class SessionQueueCancelledError extends Error {
  readonly code = "cancelled" as const;
  readonly error = "cancelled" as const;
  constructor(
    readonly sessionId: string,
    readonly tool: string | undefined,
    readonly requestId: string,
    reason?: string,
  ) {
    super(reason ?? `oturum kuyrugunda iptal: session '${sessionId}' request '${requestId}'`);
    this.name = "SessionQueueCancelledError";
  }
}

// --- FIFO kuyruk --------------------------------------------------------------

type Runner = () => Promise<unknown>;

interface Entry {
  requestId: string;
  tool: string | undefined;
  run: Runner;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  timer?: ReturnType<typeof setTimeout> | undefined;
  signal?: AbortSignal | undefined;
  onAbort?: (() => void) | undefined;
  started: boolean;
}

interface SessionState {
  running: boolean;
  queue: Entry[];
}

export interface EnqueueOptions {
  tool?: string | undefined;
  signal?: AbortSignal | undefined;
}

export class SessionQueue {
  private maxDepth: number;
  private timeoutMs: number;
  private readonly states = new Map<string, SessionState>();

  constructor(options: { maxDepth?: number; timeoutMs?: number } = {}) {
    this.maxDepth = Math.max(1, Math.trunc(options.maxDepth ?? DEFAULT_SESSION_QUEUE_MAX) || 1);
    this.timeoutMs = Math.max(1, Math.trunc(options.timeoutMs ?? DEFAULT_SESSION_QUEUE_TIMEOUT_MS) || 1);
  }

  get limits(): { maxDepth: number; timeoutMs: number } {
    return { maxDepth: this.maxDepth, timeoutMs: this.timeoutMs };
  }

  setLimits(limits: { maxDepth?: number; timeoutMs?: number }): void {
    if (limits.maxDepth !== undefined) {
      this.maxDepth = Math.max(1, Math.trunc(limits.maxDepth) || 1);
    }
    if (limits.timeoutMs !== undefined) {
      this.timeoutMs = Math.max(1, Math.trunc(limits.timeoutMs) || 1);
    }
  }

  private stateOf(sessionId: string): SessionState {
    let s = this.states.get(sessionId);
    if (!s) {
      s = { running: false, queue: [] };
      this.states.set(sessionId, s);
    }
    return s;
  }

  enqueue(sessionId: string, requestId: string, run: Runner, opts: EnqueueOptions = {}): Promise<unknown> {
    const signal = opts.signal;
    if (signal?.aborted) {
      return Promise.reject(
        new SessionQueueCancelledError(sessionId, opts.tool, requestId, String(signal.reason ?? "aborted")),
      );
    }
    const state = this.stateOf(sessionId);
    const toplam = (state.running ? 1 : 0) + state.queue.length;
    if (toplam >= this.maxDepth) {
      throw new SessionQueueFullError(sessionId, opts.tool, requestId, state.queue.length, this.maxDepth);
    }
    let resolve!: (v: unknown) => void;
    let reject!: (e: unknown) => void;
    const soz = new Promise<unknown>((res, rej) => { resolve = res; reject = rej; });
    // Reddedilmis sozun islenmemis kalmasi (unhandled rejection) test kosucusunu
    // kirletmesin: her enqueue sozune sessiz bir tutamac eklenir; gercek sonuc
    // yine ayni soz uzerinden okunur.
    soz.catch(() => undefined);
    const entry: Entry = {
      requestId, tool: opts.tool, run, resolve, reject, signal, started: false,
    };
    // Bekleme tavani: makul surede baslayamazsa acik hatayla duser.
    entry.timer = setTimeout(() => {
      if (entry.started) return;
      const i = state.queue.indexOf(entry);
      if (i < 0) return;
      state.queue.splice(i, 1);
      this.temizleAbort(entry);
      if (state.queue.length === 0 && !state.running) this.states.delete(sessionId);
      entry.reject(new SessionQueueTimeoutError(sessionId, entry.tool, requestId, this.timeoutMs));
    }, this.timeoutMs);
    // Iptal: kuyruktayken signal abort ederse bekleyen is duser (kosucu cagrilmaz).
    if (signal) {
      const onAbort = (): void => {
        if (entry.started) return;
        const i = state.queue.indexOf(entry);
        if (i < 0) return;
        state.queue.splice(i, 1);
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = undefined;
        if (state.queue.length === 0 && !state.running) this.states.delete(sessionId);
        entry.reject(
          new SessionQueueCancelledError(sessionId, entry.tool, requestId, String(signal.reason ?? "cancelled")),
        );
      };
      entry.onAbort = onAbort;
      signal.addEventListener("abort", onAbort, { once: true });
    }
    state.queue.push(entry);
    this.pump(sessionId);
    return soz;
  }

  /** Kuyruktaki bekleyen isi dusurur; kosan ise dokunmaz. Donus: bulundu mu. */
  cancel(requestId: string): boolean {
    for (const [sid, state] of this.states) {
      const i = state.queue.findIndex((e) => e.requestId === requestId);
      if (i >= 0) {
        const [entry] = state.queue.splice(i, 1);
        if (entry && entry.timer) clearTimeout(entry.timer);
        if (entry) {
          entry.timer = undefined;
          this.temizleAbort(entry);
          if (state.queue.length === 0 && !state.running) this.states.delete(sid);
          entry.reject(new SessionQueueCancelledError(sid, entry.tool, requestId, "cancelled"));
        }
        return true;
      }
    }
    return false;
  }

  status(sessionId?: string): unknown {
    if (sessionId !== undefined) {
      const s = this.states.get(sessionId);
      return {
        session_id: sessionId,
        pending: s?.queue.length ?? 0,
        running: s?.running ?? false,
        maxDepth: this.maxDepth,
        timeoutMs: this.timeoutMs,
      };
    }
    const sessions = [...this.states.entries()].map(([sid, s]) => ({
      session_id: sid,
      pending: s.queue.length,
      running: s.running,
    }));
    return {
      maxDepth: this.maxDepth,
      timeoutMs: this.timeoutMs,
      totalPending: sessions.reduce((n, s) => n + s.pending, 0),
      totalRunning: sessions.filter((s) => s.running).length,
      sessions,
    };
  }

  private temizleAbort(entry: Entry): void {
    if (entry.signal && entry.onAbort) {
      try { entry.signal.removeEventListener("abort", entry.onAbort); } catch { /* yoksay */ }
    }
    entry.onAbort = undefined;
  }

  private pump(sessionId: string): void {
    const state = this.states.get(sessionId);
    if (!state || state.running) return;
    const entry = state.queue.shift();
    if (!entry) {
      this.states.delete(sessionId);
      return;
    }
    entry.started = true;
    state.running = true;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = undefined;
    // Kosarken abort dinleyicisi kaldirilir: kosan isin iptali handler'in
    // kendi signal'inedir; kuyruk kosani disaridan oldurmez.
    this.temizleAbort(entry);
    void (async () => {
      try {
        entry.resolve(await entry.run());
      } catch (e) {
        entry.reject(e);
      } finally {
        state.running = false;
        this.pump(sessionId);
      }
    })();
  }
}

// --- Surec geneli tekil (stateless HTTP fabrikalari ayni kuyrugu paylasir) ----

let globalQueue: SessionQueue | undefined;

export function getSessionQueue(env: NodeJS.ProcessEnv = process.env): SessionQueue {
  const cfg = parseSessionQueueConfig(env);
  if (!globalQueue) {
    globalQueue = new SessionQueue({ maxDepth: cfg.maxDepth, timeoutMs: cfg.timeoutMs });
  } else {
    globalQueue.setLimits({ maxDepth: cfg.maxDepth, timeoutMs: cfg.timeoutMs });
  }
  return globalQueue;
}

/** Test/yerlestirme: surec tekilini sifirlar (bir sonraki get yeniden kurar). */
export function resetSessionQueueForTests(): void {
  globalQueue = undefined;
}

// --- Kayit sarmalayicisi -------------------------------------------------------
// audit/toolset sarmalayicilariyla ayni golge-ozellik deseni: gercek
// registerTool server `this` baglamiyla cagrilir, finally'de geri alinir.
// Devre disiyken hicbir seye dokunulmaz (mevcut davranis birebir).
export function registerWithSessionQueue(server: McpServer, register: () => void): void {
  if (!sessionQueueEnabled()) {
    register();
    return;
  }
  const cfg = parseSessionQueueConfig();
  const queue = getSessionQueue();
  queue.setLimits({ maxDepth: cfg.maxDepth, timeoutMs: cfg.timeoutMs });

  const hedef = server as unknown as { registerTool: (...args: unknown[]) => unknown };
  const gercek = hedef.registerTool;
  const kendiOzelligi = Object.prototype.hasOwnProperty.call(server, "registerTool");
  hedef.registerTool = (...args: unknown[]): unknown => {
    const ad = args[0];
    const handler = args[args.length - 1];
    if (typeof ad !== "string" || typeof handler !== "function" || args.length < 3) {
      return Reflect.apply(gercek, server, args) as unknown;
    }
    // Status araci kendini kuyruga almaz (kilitlenmeme kapisi).
    if (ad === SESSION_QUEUE_STATUS_TOOL) {
      return Reflect.apply(gercek, server, args) as unknown;
    }
    const sarilmis = async (...hargs: unknown[]): Promise<unknown> => {
      const toolArgs = hargs[0] as { session_id?: unknown } | undefined;
      const ctx = hargs[1] as { mcpReq?: { id?: unknown; signal?: unknown } } | undefined;
      const sid = toolArgs !== null && typeof toolArgs === "object"
        ? (toolArgs as Record<string, unknown>).session_id
        : undefined;
      if (typeof sid !== "string" || sid.length === 0) {
        return Reflect.apply(handler as (...a: unknown[]) => unknown, undefined, hargs);
      }
      const mcpReq = ctx?.mcpReq;
      const rawId = (mcpReq as { id?: unknown } | undefined)?.id;
      const requestId = rawId !== undefined && (typeof rawId === "string" || typeof rawId === "number")
        ? String(rawId)
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const signal = (mcpReq as { signal?: unknown } | undefined)?.signal;
      const abortSignal = signal instanceof AbortSignal ? signal : undefined;
      try {
        return await queue.enqueue(
          sid,
          requestId,
          async () => Reflect.apply(handler as (...a: unknown[]) => unknown, undefined, hargs),
          { tool: ad, ...(abortSignal ? { signal: abortSignal } : {}) },
        );
      } catch (e: unknown) {
        const code = (e as { code?: unknown })?.code ?? (e as { error?: unknown })?.error;
        if (code === "session_queue_full" || code === "session_queue_timeout" || code === "cancelled") {
          const payload: Record<string, unknown> = {
            error: code,
            tool: ad,
            session_id: sid,
            requestId,
            detail: e instanceof Error ? e.message : String(e),
          };
          const pend = (e as { pending?: unknown })?.pending;
          const maxD = (e as { maxDepth?: unknown })?.maxDepth;
          const tmo = (e as { timeoutMs?: unknown })?.timeoutMs;
          if (typeof pend === "number") payload.pending = pend;
          if (typeof maxD === "number") payload.maxDepth = maxD;
          if (typeof tmo === "number") payload.timeoutMs = tmo;
          const text = JSON.stringify(payload);
          return { content: [{ type: "text", text }], isError: true, structuredContent: payload };
        }
        throw e;
      }
    };
    const basilacak = [args[0], args[1], ...args.slice(2, -1), sarilmis];
    return Reflect.apply(gercek, server, basilacak) as unknown;
  };
  try {
    register();
  } finally {
    if (kendiOzelligi) hedef.registerTool = gercek;
    else delete (server as unknown as Record<string, unknown>).registerTool;
  }
  // Status araci: kuyruk disinda, her zaman gorunur (toolset filtresinin disinda).
  // Basari zarfi durusttur (ok:true); hata vermez.
  const statusSchema = z.object({
    session_id: z.uuid().optional().describe("Durumu okunacak oturum; bosken tum kuyruk ozeti."),
  });
  (gercek as (...a: unknown[]) => unknown).call(
    server,
    SESSION_QUEUE_STATUS_TOOL,
    {
      description: "Oturum komut kuyrugu durumu: bekleyen sayisi ve isleyen var mi. Kuyrugu degistirmez.",
      inputSchema: statusSchema,
    },
    async (args: unknown) => {
      const a = (args ?? {}) as { session_id?: unknown };
      const sid = typeof a.session_id === "string" ? a.session_id : undefined;
      const durum = queue.status(sid) as Record<string, unknown>;
      const govde = { ok: true, enabled: true, ...durum };
      const text = JSON.stringify(govde);
      return { content: [{ type: "text", text }], structuredContent: govde };
    },
  );
}
