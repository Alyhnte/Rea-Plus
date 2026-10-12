// rea-domains/wasm-evm: kayıtlı crash register/signal timeline iskeleti (offline)
// rr/panda kaydı yoksa saf metin olay listesinden timeline kurulur.
export type ReaCrashResult =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string };

// Crash olayı: sinyal + program sayacı + register anlığı.
export interface CrashEvent {
  // SIGSEGV/SIGABRT gibi sinyal adı (boş olamaz).
  signal: string;
  // Program sayacı (pc/ep) 16'lık metin ya da sayı.
  pc: string | number;
  // Register anlığı: ad -> değer eşlemesi.
  regs: Record<string, string | number>;
  // İsteğe bağlı not (ör. "heap overflow şüphesi").
  note?: string;
}

// Kapı: olay listesi boş ya da kayıtsızsa timeline kurulamaz.
function needEvents(events: CrashEvent[]): ReaCrashResult | null {
  // Kayıtlı trace yoksa deterministik timeline üretilemez.
  if (!events || !events.length) {
    return { ok: false, code: "capability_unsupported", reason: "crash kaydı yok" };
  }
  return null;
}

// Olay ekleme: sinyal/pc doğrulanır, listeye eklenir (saf fonksiyon).
export function rea_crash_append(events: CrashEvent[], ev: CrashEvent): ReaCrashResult {
  const gate = needEvents([ev]);
  if (gate) return gate;
  // Sinyal ve pc zorunludur; eksikse kayıt tutarlılığı bozulur.
  if (!ev.signal || ev.pc === undefined || ev.pc === "") {
    return { ok: false, code: "capability_unsupported", reason: "sinyal/pc eksik" };
  }
  const next = [...events, ev];
  return { ok: true, tool: "rea_crash_append", summary: `${next.length} olay`, details: { count: next.length } };
}

// Timeline kurma: olayları sırayla dizip özet satırları üretir.
export function rea_crash_timeline(events: CrashEvent[]): ReaCrashResult {
  const gate = needEvents(events);
  if (gate) return gate;
  // Her olay "i: SİNYAL @ pc (reg=n)" satırına indirgenir.
  const lines = events.map((e, i) => `${i}: ${e.signal} @ ${e.pc} (${Object.keys(e.regs).length} reg)`);
  return { ok: true, tool: "rea_crash_timeline", summary: `${events.length} olaylı timeline`, details: { lines } };
}

// Kök-neden ipucu: tekrar eden sinyal+pc çifti baskınsa onu işaretler.
export function rea_crash_hint(events: CrashEvent[]): ReaCrashResult {
  const gate = needEvents(events);
  if (gate) return gate;
  // Aynı sinyal@pc tekrar ediyorsa deterministik crash şüphesi güçlenir.
  const freq = new Map<string, number>();
  for (const e of events) freq.set(`${e.signal}@${e.pc}`, (freq.get(`${e.signal}@${e.pc}`) ?? 0) + 1);
  let top = "", topN = 0;
  for (const [k, v] of freq) if (v > topN) { top = k; topN = v; }
  if (topN < 2) return { ok: false, code: "capability_unsupported", reason: "tekrar eden crash yok" };
  return { ok: true, tool: "rea_crash_hint", summary: `baskın: ${top} x${topN}`, details: { top, topN } };
}
