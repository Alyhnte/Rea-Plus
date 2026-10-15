// ReaPlus oturum TTL çekirdeği (Dalga E/3).
// Hedef: oturum registry'sindeki ölü oturumlar TTL dolunca temizlenir; sonraki
// çağrı dürüst "oturum yok/süresi doldu" döner, sahte ok:true YOK.
// Kurallar:
// - Env REA_SESSION_TTL_MS (ms): tanımsız/boş = varsayılan 30dk, etkin.
// - TTL=0 kapalı demektir: süpürme no-op, require yaşa bakmaz (mevcut davranış).
// - Geçersiz env sessiz varsayılana DÜŞMEZ: açık hata fırlatır.
// - Yaş, createdAt ISO'sundan hesaplanır; kayan vade isteyen entegrasyon
//   SessionTtlTracker.touch ile son-etkinliği işler (registry'ye dokunulmaz).
// - Entegrasyon (tools.ts/server.ts kancası) sonraki dalgada; burası saf çekirdek.
// Mevcut davranış korunur: TTL kapalıyken registry aynen yaşar.
export const REA_SESSION_TTL_ENV = "REA_SESSION_TTL_MS" as const;
export const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;

export interface SessionTtlConfig {
  enabled: boolean;
  ttlMs: number;
}

function ttlHatasi(ham: string): Error {
  return new Error(
    `${REA_SESSION_TTL_ENV} geçersiz: "${ham}" — 0 (kapalı) ya da pozitif tam sayı (ms) olmalı (örn. 1800000 = 30dk).`,
  );
}

export function parseSessionTtlConfig(env: NodeJS.ProcessEnv = process.env): SessionTtlConfig {
  const ham = env?.[REA_SESSION_TTL_ENV];
  if (ham === undefined || ham.trim() === "") {
    return { enabled: true, ttlMs: DEFAULT_SESSION_TTL_MS };
  }
  const metin = ham.trim();
  if (!/^[0-9]+$/.test(metin)) throw ttlHatasi(ham);
  const deger = Number(metin);
  if (!Number.isSafeInteger(deger)) throw ttlHatasi(ham);
  if (deger === 0) return { enabled: false, ttlMs: 0 };
  return { enabled: true, ttlMs: deger };
}

export function sessionTtlEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseSessionTtlConfig(env).enabled;
}

// --- Registry'ye dokunmayan yapısal tipler (gerçek SessionRegistry uyar) -----

export interface TtlSessionLike {
  id: string;
  createdAt: string;
}

export interface TtlRegistryLike<S extends TtlSessionLike = TtlSessionLike> {
  get(id: string): S | undefined;
  close(id: string): boolean;
  list(): S[];
}

export type LiveSessionResult<S extends TtlSessionLike> =
  | { ok: true; session: S }
  | { ok: false; error: "session_not_found" | "session_expired"; session_id: string; neden: string };

// Saf yaş hesabı: ttlMs<=0 (kapalı) iken hiçbir şey dolmaz. createdAt
// çözülemezse kayıt çürük sayılır ve dolmuş kabul edilir (sızıntıya izin yok).
export function isSessionExpired(createdAtIso: string, ttlMs: number, simdiMs: number = Date.now()): boolean {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return false;
  const baslangic = Date.parse(createdAtIso);
  if (!Number.isFinite(baslangic)) return true;
  return simdiMs - baslangic > ttlMs;
}

// TTL dolan her oturumu kapatır, kapatılan id'leri döner. Kapalıyken no-op.
export function sweepExpiredSessions<S extends TtlSessionLike>(
  kayit: TtlRegistryLike<S>,
  ttlMs: number,
  simdiMs: number = Date.now(),
): string[] {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return [];
  const kapanan: string[] = [];
  for (const oturum of kayit.list()) {
    if (isSessionExpired(oturum.createdAt, ttlMs, simdiMs)) {
      kayit.close(oturum.id);
      kapanan.push(oturum.id);
    }
  }
  return kapanan;
}

// Dürüst kapı: oturum yoksa session_not_found; süresi dolmuşsa önce temizler
// sonra session_expired döner; yaşıyorsa ok:true + oturum. Sahte ok:true YOK.
export function requireLiveSession<S extends TtlSessionLike>(
  kayit: TtlRegistryLike<S>,
  sessionId: string,
  ttlMs: number,
  simdiMs: number = Date.now(),
): LiveSessionResult<S> {
  const oturum = kayit.get(sessionId);
  if (oturum === undefined) {
    return { ok: false, error: "session_not_found", session_id: sessionId, neden: `oturum yok: ${sessionId}` };
  }
  if (isSessionExpired(oturum.createdAt, ttlMs, simdiMs)) {
    kayit.close(sessionId);
    return {
      ok: false,
      error: "session_expired",
      session_id: sessionId,
      neden: `oturumun süresi doldu ve temizlendi: ${sessionId}`,
    };
  }
  return { ok: true, session: oturum };
}

// Kayan (sliding) vade izleyici: entegrasyon her başarılı çağrıda touch çağırır;
// dokunulan oturum createdAt'i yaşlı olsa bile yaşar. forget kapatılanı düşürür.
export class SessionTtlTracker {
  private readonly goruldu = new Map<string, number>();

  constructor(private readonly ttlMs: number) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 0) {
      throw new Error(
        `${REA_SESSION_TTL_ENV} geçersiz: "${String(ttlMs)}" — 0 (kapalı) ya da pozitif tam sayı (ms) olmalı.`,
      );
    }
  }

  get ttl(): number {
    return this.ttlMs;
  }

  get enabled(): boolean {
    return this.ttlMs > 0;
  }

  touch(sessionId: string, simdiMs: number = Date.now()): void {
    this.goruldu.set(sessionId, simdiMs);
  }

  forget(sessionId: string): void {
    this.goruldu.delete(sessionId);
  }

  lastSeen(sessionId: string): number | undefined {
    return this.goruldu.get(sessionId);
  }

  private yasiMs<S extends TtlSessionLike>(oturum: S, simdiMs: number): number {
    const gorulme = this.goruldu.get(oturum.id);
    const baslangic = gorulme ?? Date.parse(oturum.createdAt);
    if (!Number.isFinite(baslangic)) return Number.POSITIVE_INFINITY;
    return simdiMs - (baslangic as number);
  }

  sweep<S extends TtlSessionLike>(kayit: TtlRegistryLike<S>, simdiMs: number = Date.now()): string[] {
    if (!this.enabled) return [];
    const kapanan: string[] = [];
    for (const oturum of kayit.list()) {
      if (this.yasiMs(oturum, simdiMs) > this.ttlMs) {
        kayit.close(oturum.id);
        this.goruldu.delete(oturum.id);
        kapanan.push(oturum.id);
      }
    }
    return kapanan;
  }

  require<S extends TtlSessionLike>(
    kayit: TtlRegistryLike<S>,
    sessionId: string,
    simdiMs: number = Date.now(),
  ): LiveSessionResult<S> {
    const oturum = kayit.get(sessionId);
    if (oturum === undefined) {
      this.goruldu.delete(sessionId);
      return { ok: false, error: "session_not_found", session_id: sessionId, neden: `oturum yok: ${sessionId}` };
    }
    if (this.enabled && this.yasiMs(oturum, simdiMs) > this.ttlMs) {
      kayit.close(sessionId);
      this.goruldu.delete(sessionId);
      return {
        ok: false,
        error: "session_expired",
        session_id: sessionId,
        neden: `oturumun süresi doldu ve temizlendi: ${sessionId}`,
      };
    }
    return { ok: true, session: oturum };
  }
}
