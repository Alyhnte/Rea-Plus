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

// ---------------------------------------------------------------------------
// Genelleme (Dalga D/3): paced reporter + iptal temizligi baska uzun araclara
// da aynen uygulanabilir. Bu yardimcilar arac-bagimsizdir: rea_process_run
// pilotu degismez; baska uzun araclar (or. asamali isler) asagidaki iki parcayi
// kullanir:
//   1) createStageProgress: gercek asamalar -> monoton progress eslemesi.
//      SAHTE progress uretmez: timer/otomatik emit YOKTUR; bildirim yalniz
//      cagran, gercekten biten bir asamayi advance() ile isaretlediginde gider.
//      Gonderim yine paced reporter uzerinden olur (hiz tavani + monotonluk).
//   2) onAbort: AbortSignal -> temizlik geri cagrisi baglar; cocuk surec/is
//      oldurme her aracta ayni tek cagriyla kurulur. Timer uretmez, dinleyici
//      birakma (unsubscribe) ile sokulur.
// ---------------------------------------------------------------------------

export type ProgressStage = string | { name: string; weight?: number };

export interface StageProgress {
  // Toplam asama sayisi.
  readonly stageCount: number;
  // Simdiye dek tamamlanan asama sayisi (ileri-yonlu imlec).
  readonly reached: number;
  // Gerceklesen asamayi isaretler: sayisal indeks veya asama adi + opsiyonel mesaj.
  // Imlec yalniz ileri gider; donus degeri imlecin ilerledigini soyler
  // (pacing yuzunden atilan gonderimi degil: true donen bir asama gercekten bitmistir).
  // Ayni/geri/bilinmeyen adim false doner ve HICBIR bildirim uretmez.
  advance(step: number | string, message?: string): Promise<boolean>;
  // Verilen asama indeksinin progress karsiligi (0-tabanli).
  progressOf(index: number): number;
}

export function createStageProgress(
  reporter: ProgressReporter,
  stages: readonly ProgressStage[],
  total?: number,
): StageProgress {
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new Error("createStageProgress: en az bir asama gerekir");
  }
  const names: string[] = [];
  const weights: number[] = [];
  const gorulen = new Set<string>();
  for (const s of stages) {
    const name = typeof s === "string" ? s : s?.name;
    const weight = typeof s === "string" ? 1 : (s?.weight ?? 1);
    if (typeof name !== "string" || name.length === 0) {
      throw new Error("createStageProgress: her asamanin adi olmalidir");
    }
    if (gorulen.has(name)) throw new Error(`createStageProgress: yinelenen asama adi: ${name}`);
    gorulen.add(name);
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
      throw new Error(`createStageProgress: agirlik pozitif sonlu sayi olmali: ${name}`);
    }
    names.push(name);
    weights.push(weight);
  }
  const n = names.length;
  const sum = weights.reduce((a, b) => a + b, 0);
  const grandTotal = total === undefined ? n : total;
  if (typeof grandTotal !== "number" || !Number.isFinite(grandTotal) || grandTotal <= 0) {
    throw new Error("createStageProgress: total pozitif sonlu sayi olmali");
  }
  const progressOf = (index: number): number => {
    if (!Number.isInteger(index) || index < 0 || index >= n) {
      throw new Error(`createStageProgress: asama indeksi aralik disi: ${String(index)}`);
    }
    let cum = 0;
    for (let i = 0; i <= index; i += 1) cum += weights[i] as number;
    return (grandTotal * cum) / sum;
  };

  let reached = 0;
  return {
    get stageCount() {
      return n;
    },
    get reached() {
      return reached;
    },
    progressOf,
    advance: async (step: number | string, message?: string): Promise<boolean> => {
      let index = -1;
      if (typeof step === "number" && Number.isInteger(step) && step >= 0 && step < n) {
        index = step;
      } else if (typeof step === "string") {
        index = names.indexOf(step);
      }
      // Bilinmeyen/ayni/geri adim: imlec oynamaz, bildirim uretilmez.
      if (index < 0 || index < reached) return false;
      reached = index + 1;
      const update: ProgressUpdate = { progress: progressOf(index), total: grandTotal };
      if (typeof message === "string" && message.length > 0) update.message = message;
      await reporter(update);
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// Dalga E/2: uzun araclarin gercek asama tablosu.
// Her girdi, aracin disaridan gozlenebilen GERCEK kilometre tasidir; SAHTE
// progress YOKTUR: bildirim yalniz cagran, gercekten biten bir asamayi
// advance() ile isaretlediginde paced reporter uzerinden gider.
//   - rea_scan_repo: girdi dogrulandi -> tarama cozumlendi -> rapor sekli dogrulandi.
//   - rea_jadx_full: apk girdisi dogrulandi -> decompile cagrisi dondu ->
//     sonuc seklin dogrulandi (bloklayan senkron kosu; asmasi kabaca gercek,
//     ara-ilerleme uretmez).
// Elenen: rea_behavior_run kayitli arac degildir (yeni kayit yuzeyi oynatirdi);
// rea_behavior_full saf senkron birlestirmedir (uzun degil).
// ---------------------------------------------------------------------------

export const LONG_TOOL_STAGES = {
  rea_scan_repo: ["girdi", "tarama", "rapor"],
  rea_jadx_full: ["girdi", "decompile", "dogrula"],
} as const;

export type LongToolName = keyof typeof LONG_TOOL_STAGES;

// Kayitli uzun arac icin asama ilerlemesi kurar (total = asama sayisi).
// Bilinmeyen ad hizli patlar (sessiz yanlis kurulum yok).
export function toolStageProgress(reporter: ProgressReporter, tool: string): StageProgress {
  const stages = (LONG_TOOL_STAGES as Record<string, readonly string[]>)[tool];
  if (!stages) throw new Error(`toolStageProgress: bilinmeyen uzun arac: ${String(tool)}`);
  return createStageProgress(reporter, stages, stages.length);
}

// AbortSignal'e tek-seferlik temizlik baglar; donen fonksiyon dinleyiciyi sokup
// atar (birakma sonrasi abort temizligi cagirmaz). Timer uretmez.
// - Sinyal zaten iptalse temizlik HEMEN (senkron) calisir, noop doner.
// - Sinyal tanımsızsa veya temizlik fonksiyon degilse noop doner, atmaz.
// - Temizlik icinden firlayan hata yutulur: iptal yolu hicbir zaman cokertmez.
export function onAbort(
  signal: AbortSignal | undefined | null,
  cleanup: () => void,
): () => void {
  const noop = (): void => {};
  if (typeof cleanup !== "function") return noop;
  if (!signal || typeof signal !== "object" || typeof (signal as AbortSignal).aborted !== "boolean") {
    return noop;
  }
  if (signal.aborted) {
    try {
      cleanup();
    } catch {
      // Temizlik hatasi iptal akisini bozmaz.
    }
    return noop;
  }
  let done = false;
  const handler = (): void => {
    if (done) return;
    done = true;
    try {
      cleanup();
    } catch {
      // Temizlik hatasi iptal akisini bozmaz.
    }
  };
  signal.addEventListener("abort", handler, { once: true });
  return () => {
    if (done) return;
    done = true;
    try {
      signal.removeEventListener("abort", handler);
    } catch {
      // Dinleyici sokumu en iyi caba kanalidir.
    }
  };
}
