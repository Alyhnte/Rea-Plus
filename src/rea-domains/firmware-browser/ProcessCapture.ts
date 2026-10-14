// rea-domains/firmware-browser: süreç yakalama (process capture)
// Koşu çıktısı boru (pipe) ile alınır. Gerçek PTY uygulanmadı; PTY etiketiyle
// sahte fark raporlanmaz — kanal her zaman "pipe", karşılaştırma kapıdan döner.
// Pilot (progress/cancel): MCP rea_process_run araci asenkron cekirdegi
// (rea_process_run_async) kullanir; iptalde cocuk surec agaci oldurulur ve
// sonuc ok:false/code:"cancelled" doner (kayit katmaninda isError zarfina cevrilir).
// Senkron rea_process_run, mevcut senkron cagiranlar/testler icin aynen korunur.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";

export type ReaProcSonuç =
  | { ok: true; tool: string; summary: string; kayıt: ProcKaydı }
  | { ok: false; code: "capability_unsupported"; reason: string }
  | { ok: false; code: "cancelled"; reason: string; kayıt: ProcKaydı };

// Tek koşu kaydı: komut + süre + çıkış + kullanılan kanal (şimdilik yalnız pipe).
export interface ProcKaydı {
  komut: string;
  args: string[];
  kanal: "pty" | "pipe";
  süre_ms: number;
  çıkış_kodu: number | null;
  stdout_sha256_kısa: string;
}

// İlerleme geri çağrısı: paced katman (server/progress.ts) bunu MCP bildirimine çevirir.
export type ProcProgress = (update: { progress: number; total?: number; message?: string }) => Promise<void> | void;

// Koşu seçenekleri: pty bayrağı ileride gerçek PTY gelirse diye durur (bugün etkisiz), zaman aşımı 15sn.
// signal/onProgress yalniz asenkron cekirdekte etkilidir; senkron cekirdek onlari yoksayar.
export interface ProcKoşuSeçenek {
  args?: string[];
  pty?: boolean;
  zaman_aşımı_ms?: number;
  signal?: AbortSignal;
  onProgress?: ProcProgress;
}

// spawnSync varsayilan maxBuffer'i (1 MiB): asenkron cekirdek ayni siniri akis basina korur.
const MAX_BUFFER_BYTES = 1024 * 1024;
const VARSAYILAN_ZAMAN_AŞIMI_MS = 15000;
// Kalp atisi: paced katman zaten ~20/sn tavani uygular; domain daha seyrek uretir.
const İLERLEME_ARALIĞI_MS = 200;

// Kısa özet hash'i: gerçek SHA-256'nın ilk 16 hanesi kanıta girer (alan adı bunu vaat eder).
function kısaHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

// Süreç koşusu (senkron uyumluluk): spawnSync boru kanalı; pty istense bile kanal pipe raporlanır.
// NOT: Event-loop'u blokladigi icin calisirken iptal/progress isleyemez; pilot arac
// asenkron cekirdegi kullanir. Bu senkron yol yalniz eski dogrudan cagiranlar icin kalir.
export function rea_process_run(komut: string, opts: ProcKoşuSeçenek = {}): ReaProcSonuç {
  if (!komut) return { ok: false, code: "capability_unsupported", reason: "komut boş" };
  const args = opts.args ?? [];
  const kanal: "pty" | "pipe" = "pipe";
  const baş = Date.now();
  const r = spawnSync(komut, args, { timeout: opts.zaman_aşımı_ms ?? VARSAYILAN_ZAMAN_AŞIMI_MS, encoding: "utf8", shell: false });
  const kayıt: ProcKaydı = {
    komut, args, kanal, süre_ms: Date.now() - baş,
    çıkış_kodu: r.status, stdout_sha256_kısa: kısaHash(String(r.stdout ?? "")),
  };
  return { ok: true, tool: "rea_process_run", summary: `${komut} [${kanal}] kod=${r.status}`, kayıt };
}

// Çocuk süreç ağacını öldürür: Windows'ta taskkill /T /F, POSIX'te detached grup (varsa -pid).
// Kendi hatasini yutar; son care dogrudan cocugu SIGKILL ile vurur.
function ağacıÖldür(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (pid === undefined || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  if (process.platform === "win32") {
    return new Promise((resolve) => {
      let bitti = false;
      const bitir = (): void => {
        if (bitti) return;
        bitti = true;
        try { child.kill("SIGKILL"); } catch { /* zaten ölü */ }
        resolve();
      };
      try {
        const tk = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        tk.once("error", bitir);
        tk.once("close", bitir);
        // taskkill asilirsa bile akış takılmaz.
        setTimeout(bitir, 3000).unref();
      } catch {
        bitir();
      }
    });
  }
  try { process.kill(-pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch { /* zaten ölü */ } }
  return Promise.resolve();
}

// Süreç koşusu (asenkron pilot çekirdek): spawnSync ile ayni dönüş şekli ve varsayılanlar
// (15sn zaman aşımı, akış başına 1 MiB tampon, shell:false, kanal pipe). Normal bitiş ve
// sifirdan farkli cikis, spawn hatasi ve zaman aşımı senkron sözleşmedeki gibi ok:true döner
// (çıkış_kodu null olabilir). AbortSignal tetiklenirse süreç ağacı öldürülür ve
// ok:false/code:"cancelled" döner. onProgress önce 0 ile, sonra kalp atışıyla beslenir.
export function rea_process_run_async(komut: string, opts: ProcKoşuSeçenek = {}): Promise<ReaProcSonuç> {
  if (!komut) return Promise.resolve({ ok: false, code: "capability_unsupported", reason: "komut boş" });
  const args = opts.args ?? [];
  const kanal: "pty" | "pipe" = "pipe";
  const zamanAşımı = opts.zaman_aşımı_ms ?? VARSAYILAN_ZAMAN_AŞIMI_MS;
  const signal = opts.signal;
  const baş = Date.now();

  const kayıtYap = (çıkışKodu: number | null, stdout: string): ProcKaydı => ({
    komut, args, kanal, süre_ms: Date.now() - baş,
    çıkış_kodu: çıkışKodu, stdout_sha256_kısa: kısaHash(stdout),
  });

  // Başlamadan iptal edilmiş sinyal: süreç hiç doğmadan cancelled zarfı.
  if (signal?.aborted) {
    return Promise.resolve({
      ok: false, code: "cancelled", reason: "iptal edildi (başlamadan önce)", kayıt: kayıtYap(null, ""),
    });
  }

  return new Promise<ReaProcSonuç>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(komut, args, {
        shell: false,
        // stdin EOF: spawnSync'in bos girdisiyle ayni davranis (girdi bekleyen program asilmaz).
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        // POSIX'te grup öldürme için yeni grup; Windows'ta taskkill /T ağacı gezer.
        detached: process.platform !== "win32",
      });
    } catch {
      // Senkron spawn hatasi (gecersiz arguman vb.): senkron yoldaki gibi ok:true/kod=null.
      resolve({ ok: true, tool: "rea_process_run", summary: `${komut} [${kanal}] kod=null`, kayıt: kayıtYap(null, "") });
      return;
    }

    const stdoutParçaları: Buffer[] = [];
    const stderrParçaları: Buffer[] = [];
    let stdoutBayt = 0;
    let stderrBayt = 0;
    let tamponAşıldı = false;
    let zamanAşıldı = false;
    let iptalEdildi = false;
    let bitti = false;
    let ilerlemeSayacı = 0;

    const ilerlemeGönder = (message: string): void => {
      if (!opts.onProgress) return;
      ilerlemeSayacı += 1;
      try {
        void Promise.resolve(opts.onProgress({ progress: ilerlemeSayacı, message })).catch(() => undefined);
      } catch { /* bildirim hatası koşuyu etkilemez */ }
    };

    const zamanlayıcı = setTimeout(() => {
      // Zaman aşımı: spawnSync gibi süreci bitir; sonuç ok:true/kod=null kalır.
      zamanAşıldı = true;
      void ağacıÖldür(child);
    }, Math.max(0, zamanAşımı));
    zamanlayıcı.unref();

    const kalp = setInterval(() => ilerlemeGönder(`çalışıyor (${Date.now() - baş}ms)`), İLERLEME_ARALIĞI_MS);
    kalp.unref();

    const iptalDinleyici = (): void => {
      iptalEdildi = true;
      void ağacıÖldür(child);
    };
    signal?.addEventListener("abort", iptalDinleyici, { once: true });

    const topla = (hangi: "stdout" | "stderr") => (parça: Buffer): void => {
      const parçalar = hangi === "stdout" ? stdoutParçaları : stderrParçaları;
      let toplam = hangi === "stdout" ? stdoutBayt : stderrBayt;
      if (toplam >= MAX_BUFFER_BYTES) {
        if (!tamponAşıldı) { tamponAşıldı = true; void ağacıÖldür(child); }
        return;
      }
      const kalan = MAX_BUFFER_BYTES - toplam;
      if (parça.length <= kalan) {
        parçalar.push(parça);
        toplam += parça.length;
      } else {
        // spawnSync ENOBUFS davranisi: ilk 1 MiB korunur, süreç öldürülür, kod=null.
        parçalar.push(parça.subarray(0, kalan));
        toplam += kalan;
        tamponAşıldı = true;
        void ağacıÖldür(child);
      }
      if (hangi === "stdout") stdoutBayt = toplam; else stderrBayt = toplam;
    };
    child.stdout?.on("data", topla("stdout"));
    child.stderr?.on("data", topla("stderr"));

    const bitir = (çıkışKodu: number | null): void => {
      if (bitti) return;
      bitti = true;
      clearTimeout(zamanlayıcı);
      clearInterval(kalp);
      signal?.removeEventListener("abort", iptalDinleyici);
      const stdout = Buffer.concat(stdoutParçaları, stdoutBayt).toString("utf8");
      void stderrParçaları; // stderr tamponu sinir icin tutulur; kayda yalniz stdout hash'i girer.
      if (iptalEdildi || signal?.aborted) {
        resolve({ ok: false, code: "cancelled", reason: "iptal edildi", kayıt: kayıtYap(null, stdout) });
        return;
      }
      // spawnSync, timeout/ENOBUFS'te status=null verir (sinyalle ölüm): aynı kod raporlanır.
      const kod = tamponAşıldı || zamanAşıldı ? null : çıkışKodu;
      resolve({ ok: true, tool: "rea_process_run", summary: `${komut} [${kanal}] kod=${kod}`, kayıt: kayıtYap(kod, stdout) });
    };

    // İlk ilerleme gecikmeden: süreç doğdu, koşu başladı.
    ilerlemeGönder("başladı");
    // Spawn hatasında (ENOENT vb.) close negatif/null kod verebilir: null'a normalize edilir.
    child.once("error", () => bitir(null));
    child.once("close", (code) => bitir(typeof code === "number" && code >= 0 ? code : null));
  });
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
