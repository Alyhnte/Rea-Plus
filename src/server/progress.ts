// rea-plus pilot ilerleme yardimcisi: MCP notifications/progress gonderimini
// token yoklugunda susturur, ilk bildirimi geciktirmez, sonrakileri en fazla
// ~20/sn (en az 50ms ara) gonderir, progress degerini monoton tutar ve notify
// hatasinin handler'i cokertmesine izin vermez.
// SDK v2 baglami (ServerContext): sinyal ctx.mcpReq.signal, token
// ctx.mcpReq._meta.progressToken, gonderim ctx.mcpReq.notify(notification).
import type { Notification, ProgressToken, ServerContext } from "@modelcontextprotocol/server";

export const PROGRESS_MIN_INTERVAL_MS = 50;

export type ProgressNotify = (notification: Notification) => Promise<void> | void;

export interface ProgressUpdate {
  progress: number;
  total?: number;
  message?: string;
}

// Handler'a verilen sade geri cagri: sayisal ilerleme + istege bagli total/mesaj.
export type ProgressReporter = (update: ProgressUpdate) => Promise<void>;

export interface PacedProgressOptions {
  // Gonderimler arasi en kisa sure (ms); varsayilan 50 (~20/sn tavani).
  intervalMs?: number;
  // Testte sahte saat enjeksiyonu; varsayilan Date.now.
  now?: () => number;
}

/**
 * Paced progress reporter kurar.
 * - progressToken yoksa (undefined/null) reporter tamamen sessizdir: notify hic cagrilmaz.
 * - Ilk gecerli bildirim gecikmeden gider; sonrakiler intervalMs dolmadan ATILIR (kuyruga girmez).
 * - progress monotonlugu: son gonderilen degerden buyuk olmayan guncelleme gonderilmez.
 * - notify senkron firlatsa da reddetse de hata yutulur; reporter asla reject etmez.
 */
export function createPacedProgress(
  notify: ProgressNotify | undefined,
  progressToken: ProgressToken | undefined | null,
  options: PacedProgressOptions = {},
): ProgressReporter {
  const intervalMs = Math.max(0, options.intervalMs ?? PROGRESS_MIN_INTERVAL_MS);
  const now = options.now ?? Date.now;
  let lastSentAt: number | undefined;
  let lastProgress: number | undefined;
  // Gonderimler tek zincirde siralanir; pes pese cagrilar ust uste binmez.
  let tail: Promise<void> = Promise.resolve();

  return (update: ProgressUpdate): Promise<void> => {
    if (!notify || progressToken === undefined || progressToken === null) return Promise.resolve();
    if (!update || typeof update.progress !== "number" || !Number.isFinite(update.progress)) {
      return Promise.resolve();
    }
    // Monotonluk: artmayan progress protokolce gecersizdir, sessizce atilir.
    if (lastProgress !== undefined && update.progress <= lastProgress) return Promise.resolve();
    const t = now();
    // Pacing: ilk bildirim beklemez; erken gelen sonrakiler atilir.
    if (lastSentAt !== undefined && t - lastSentAt < intervalMs) return Promise.resolve();
    lastSentAt = t;
    lastProgress = update.progress;

    const params: { progressToken: ProgressToken; progress: number; total?: number; message?: string } = {
      progressToken,
      progress: update.progress,
    };
    if (typeof update.total === "number" && Number.isFinite(update.total)) params.total = update.total;
    if (typeof update.message === "string" && update.message.length > 0) params.message = update.message;
    const notification = { method: "notifications/progress", params } as Notification;

    tail = tail.then(async () => {
      try {
        await notify(notification);
      } catch {
        // Bildirim hatasi handler'i cokertmez: ilerleme en iyi caba kanalidir.
      }
    });
    return tail;
  };
}

export interface PilotRequestContext {
  signal: AbortSignal | undefined;
  onProgress: ProgressReporter;
}

// SDK ctx'sinden pilot araca gecirilecek sinyal + paced reporter cikarir.
// ctx eksik/bozuksa sessiz reporter ve tanımsız sinyal doner (birim cagrilar guvenli).
export function pilotContextFromCtx(ctx: ServerContext | undefined | null): PilotRequestContext {
  const mcpReq = ctx?.mcpReq as
    | {
        signal?: AbortSignal;
        _meta?: { progressToken?: ProgressToken };
        notify?: ProgressNotify;
      }
    | undefined;
  const token = mcpReq?._meta?.progressToken;
  const signal =
    mcpReq?.signal && typeof mcpReq.signal === "object" && "aborted" in mcpReq.signal
      ? mcpReq.signal
      : undefined;
  return {
    signal,
    onProgress: createPacedProgress(
      typeof mcpReq?.notify === "function" ? mcpReq.notify : undefined,
      token ?? undefined,
    ),
  };
}
