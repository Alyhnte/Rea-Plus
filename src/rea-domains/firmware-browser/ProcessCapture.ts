// rea-domains/firmware-browser: süreç yakalama (process capture)
// Koşu çıktısı boru (pipe) ile alınır. Gerçek PTY uygulanmadı; PTY etiketiyle
// sahte fark raporlanmaz — kanal her zaman "pipe", karşılaştırma kapıdan döner.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

export type ReaProcSonuç =
  | { ok: true; tool: string; summary: string; kayıt: ProcKaydı }
  | { ok: false; code: "capability_unsupported"; reason: string };

// Tek koşu kaydı: komut + süre + çıkış + kullanılan kanal (şimdilik yalnız pipe).
export interface ProcKaydı {
  komut: string;
  args: string[];
  kanal: "pty" | "pipe";
  süre_ms: number;
  çıkış_kodu: number | null;
  stdout_sha256_kısa: string;
}

// Koşu seçenekleri: pty bayrağı ileride gerçek PTY gelirse diye durur (bugün etkisiz), zaman aşımı 15sn.
export interface ProcKoşuSeçenek {
  args?: string[];
  pty?: boolean;
  zaman_aşımı_ms?: number;
}

// Kısa özet hash'i: gerçek SHA-256'nın ilk 16 hanesi kanıta girer (alan adı bunu vaat eder).
function kısaHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

// Süreç koşusu: spawnSync boru kanalı tek destektir; pty istense bile kanal pipe raporlanır.
export function rea_process_run(komut: string, opts: ProcKoşuSeçenek = {}): ReaProcSonuç {
  if (!komut) return { ok: false, code: "capability_unsupported", reason: "komut boş" };
  const args = opts.args ?? [];
  const kanal: "pty" | "pipe" = "pipe";
  const baş = Date.now();
  const r = spawnSync(komut, args, { timeout: opts.zaman_aşımı_ms ?? 15000, encoding: "utf8", shell: false });
  const kayıt: ProcKaydı = {
    komut, args, kanal, süre_ms: Date.now() - baş,
    çıkış_kodu: r.status, stdout_sha256_kısa: kısaHash(String(r.stdout ?? "")),
  };
  return { ok: true, tool: "rea_process_run", summary: `${komut} [${kanal}] kod=${r.status}`, kayıt };
}

// Karşılaştırma: gerçek PTY (node-pty vb.) yokken pipe'ı iki kez koşup fark uydurulmaz.
export function rea_process_compare(komut: string, args: string[] = []): ReaProcSonuç {
  void komut; void args;
  return { ok: false, code: "capability_unsupported", reason: `gerçek PTY uygulanmadı; pipe/pty karşılaştırması yapılamaz (platform=${process.platform})` };
}

// Yetenek sorgusu: yalnız pipe desteği tek satırda raporlanır.
export function rea_process_caps(): ReaProcSonuç {
  const kayıt: ProcKaydı = { komut: "caps", args: [], kanal: "pipe", süre_ms: 0, çıkış_kodu: 0, stdout_sha256_kısa: kısaHash(process.platform) };
  return { ok: true, tool: "rea_process_caps", summary: "yalnız pipe (gerçek PTY uygulanmadı)", kayıt };
}
