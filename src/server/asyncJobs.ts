// rea-plus async job pilotu (REA_ASYNC_JOBS=1 opt-in): uzun kosularin
// senkron tools/call yerine kuyruklu, iptal edilebilir isler olarak kosulmasi.
// Yalniz gercek AbortSignal alan pilot arac whitelist'tedir; diger araclar
// tahminle asenkron sayilmaz. Sonuclar surec-ici bellekte sinirli tutulur;
// kalicilik/dagitim bu pilotun kapsami disidir.
import { randomUUID } from "node:crypto";

export const ASYNC_JOB_TOOLS: ReadonlySet<string> = new Set(["rea_process_run"]);

export type AsyncJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface AsyncJobSnapshot {
  id: string;
  tool: string;
  status: AsyncJobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export type AsyncJobRunner = (signal: AbortSignal) => Promise<unknown>;

interface Kayit {
  snapshot: AsyncJobSnapshot;
  controller: AbortController;
  run: AsyncJobRunner;
  result?: unknown;
  settled: Promise<void>;
  settle: () => void;
}

export interface AsyncJobManagerOptions {
  maxConcurrent?: number;
  maxRetained?: number;
}

export class AsyncJobManager {
  private readonly azamiEsZamanli: number;
  private readonly azamiKayit: number;
  private readonly isler = new Map<string, Kayit>();
  private readonly kuyruk: Kayit[] = [];
  private calisan = 0;

  constructor(options: AsyncJobManagerOptions = {}) {
    this.azamiEsZamanli = Math.max(1, Math.trunc(options.maxConcurrent ?? 2) || 1);
    this.azamiKayit = Math.max(1, Math.trunc(options.maxRetained ?? 50) || 1);
  }

  start(tool: string, run: AsyncJobRunner): AsyncJobSnapshot {
    let settle!: () => void;
    const settled = new Promise<void>((r) => { settle = r; });
    const kayit: Kayit = {
      snapshot: { id: `job_${randomUUID()}`, tool, status: "queued", createdAt: new Date().toISOString() },
      controller: new AbortController(),
      run,
      settled,
      settle,
    };
    this.isler.set(kayit.snapshot.id, kayit);
    this.kuyruk.push(kayit);
    this.kayitlariKirp();
    this.pump();
    return { ...kayit.snapshot };
  }

  status(id: string): AsyncJobSnapshot | undefined {
    const k = this.isler.get(id);
    return k ? { ...k.snapshot } : undefined;
  }

  result(id: string): { snapshot: AsyncJobSnapshot; ready: boolean; result?: unknown } | undefined {
    const k = this.isler.get(id);
    if (!k) return undefined;
    const ready = k.snapshot.status === "succeeded" || k.snapshot.status === "failed" || k.snapshot.status === "cancelled";
    return { snapshot: { ...k.snapshot }, ready, ...(ready && k.result !== undefined ? { result: k.result } : {}) };
  }

  list(limit = 20): AsyncJobSnapshot[] {
    const sinir = Math.min(100, Math.max(1, Math.trunc(limit) || 20));
    return [...this.isler.values()].slice(-sinir).reverse().map((k) => ({ ...k.snapshot }));
  }

  // Kuyruktaki is hic baslamadan, calisan is AbortSignal ile iptal edilir.
  // Donus: is bulundu mu + iptal sonrasi anlik durum.
  cancel(id: string): AsyncJobSnapshot | undefined {
    const k = this.isler.get(id);
    if (!k) return undefined;
    if (k.snapshot.status === "queued") {
      const i = this.kuyruk.indexOf(k);
      if (i >= 0) this.kuyruk.splice(i, 1);
      k.snapshot.status = "cancelled";
      k.snapshot.finishedAt = new Date().toISOString();
      k.result = { ok: false, code: "cancelled", reason: "kuyruktayken iptal edildi" };
      k.settle();
    } else if (k.snapshot.status === "running") {
      k.controller.abort();
    }
    return { ...k.snapshot };
  }

  // Test/yerlestirme: is terminal duruma ulasana kadar bekler.
  async wait(id: string): Promise<AsyncJobSnapshot | undefined> {
    const k = this.isler.get(id);
    if (!k) return undefined;
    await k.settled;
    return { ...k.snapshot };
  }

  private pump(): void {
    while (this.calisan < this.azamiEsZamanli && this.kuyruk.length > 0) {
      const k = this.kuyruk.shift() as Kayit;
      if (k.snapshot.status !== "queued") continue;
      k.snapshot.status = "running";
      k.snapshot.startedAt = new Date().toISOString();
      this.calisan += 1;
      void (async () => {
        try {
          const sonuc = await k.run(k.controller.signal);
          k.result = sonuc;
          if (k.controller.signal.aborted) {
            k.snapshot.status = "cancelled";
          } else if (sonuc && typeof sonuc === "object" && (sonuc as Record<string, unknown>).ok === false) {
            // Handler zarfi isError'a cevrilecek ok:false govdesi tasiyabilir;
            // MCP zarfi (content) donerse isError bayragina bakilir.
            const zarf = sonuc as Record<string, unknown>;
            const icerik = Array.isArray(zarf.content)
              ? (zarf.content as Array<Record<string, unknown>>).find((c) => c.type === "text")
              : undefined;
            let govde: Record<string, unknown> | undefined;
            if (typeof icerik?.text === "string") {
              try { govde = JSON.parse(icerik.text) as Record<string, unknown>; } catch { govde = undefined; }
            }
            k.snapshot.status = govde?.code === "cancelled" ? "cancelled" : "failed";
            if (typeof govde?.reason === "string") k.snapshot.error = govde.reason;
          } else {
            k.snapshot.status = "succeeded";
          }
        } catch (e) {
          k.snapshot.status = k.controller.signal.aborted ? "cancelled" : "failed";
          k.snapshot.error = e instanceof Error ? e.message : String(e);
        } finally {
          k.snapshot.finishedAt = new Date().toISOString();
          this.calisan -= 1;
          k.settle();
          this.kayitlariKirp();
          this.pump();
        }
      })();
    }
  }

  // Terminal kayitlar en eskiden kirpilir; aktif/kuyruktaki is asla silinmez.
  private kayitlariKirp(): void {
    if (this.isler.size <= this.azamiKayit) return;
    for (const [id, k] of this.isler) {
      if (this.isler.size <= this.azamiKayit) break;
      if (k.snapshot.status === "queued" || k.snapshot.status === "running") continue;
      this.isler.delete(id);
    }
  }
}

// Ortam opt-in'i: yalniz tam "1" etkinlestirir; sessiz tahmin yok.
export function asyncJobsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.REA_ASYNC_JOBS === "1";
}
