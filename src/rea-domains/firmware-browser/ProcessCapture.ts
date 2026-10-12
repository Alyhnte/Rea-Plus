// rea-domains/firmware-browser: PTY süreç yakalama (process capture)
// Koşu çıktısı boru (pipe) ile PTY yan yana karşılaştırılır; fark kanıta işlenir.
import { spawnSync } from "node:child_process";

export type ReaProcSonuç =
  | { ok: true; tool: string; summary: string; kayıt: ProcKaydı }
  | { ok: false; code: "capability_unsupported"; reason: string };

// Tek koşu kaydı: komut + süre + çıkış + kullanılan kanal (pty/pipe).
export interface ProcKaydı {
  komut: string;
  args: string[];
  kanal: "pty" | "pipe";
  süre_ms: number;
  çıkış_kodu: number | null;
  stdout_sha256_kısa: string;
}

// Koşu seçenekleri: pty varsayılan kapalı, zaman aşımı 15sn ile sınırlı.
export interface ProcKoşuSeçenek {
  args?: string[];
  pty?: boolean;
  zaman_aşımı_ms?: number;
}

// Kısa özet hash'i: çıktının tamamı değil ilk 16 hanesi kanıta girer.
function kısaHash(text: string): string {
  // Bağımlılıksız FNV-1a; kanıt karşılaştırmasına yetecek kadar ayırt edicidir.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0") + text.length.toString(16);
}

// PTY koşusu: pty bayrağı yalnız Linux'ta anlamlıdır, diğer hostta pipe'a düşer.
export function rea_process_run(komut: string, opts: ProcKoşuSeçenek = {}): ReaProcSonuç {
  if (!komut) return { ok: false, code: "capability_unsupported", reason: "komut boş" };
  const args = opts.args ?? [];
  // Windows/macOS'ta PTY taklidi yok; boru kanalı tek destektir.
  const kanal: "pty" | "pipe" = opts.pty && process.platform === "linux" ? "pty" : "pipe";
  const baş = Date.now();
  const r = spawnSync(komut, args, { timeout: opts.zaman_aşımı_ms ?? 15000, encoding: "utf8", shell: false });
  const kayıt: ProcKaydı = {
    komut, args, kanal, süre_ms: Date.now() - baş,
    çıkış_kodu: r.status, stdout_sha256_kısa: kısaHash(String(r.stdout ?? "")),
  };
  return { ok: true, tool: "rea_process_run", summary: `${komut} [${kanal}] kod=${r.status}`, kayıt };
}

// Karşılaştırma: aynı komut pipe + pty ile koşturulur, özet hash'ler yan yana konur.
export function rea_process_compare(komut: string, args: string[] = []): ReaProcSonuç {
  // Linux dışı hostta karşılaştırma anlamsızdır; handoff önerilir.
  if (process.platform !== "linux") {
    return { ok: false, code: "capability_unsupported", reason: `pty karşılaştırma yalnız Linux (platform=${process.platform})` };
  }
  const a = rea_process_run(komut, { args, pty: false });
  const b = rea_process_run(komut, { args, pty: true });
  if (!a.ok || !b.ok) return { ok: false, code: "capability_unsupported", reason: "koşu başarısız" };
  const aynı = a.kayıt.stdout_sha256_kısa === b.kayıt.stdout_sha256_kısa;
  const kayıt: ProcKaydı = { ...b.kayıt, komut: `${komut} (pipe=${a.kayıt.stdout_sha256_kısa} pty=${b.kayıt.stdout_sha256_kısa})` };
  return { ok: true, tool: "rea_process_compare", summary: aynı ? "çıktılar aynı" : "çıktılar FARKLI", kayıt };
}

// Yetenek sorgusu: pty desteği platforma göre tek satırda raporlanır.
export function rea_process_caps(): ReaProcSonuç {
  const kayıt: ProcKaydı = { komut: "caps", args: [], kanal: "pipe", süre_ms: 0, çıkış_kodu: 0, stdout_sha256_kısa: kısaHash(process.platform) };
  return { ok: true, tool: "rea_process_caps", summary: process.platform === "linux" ? "pty+pipe aday" : "yalnız pipe, pty handoff", kayıt };
}
