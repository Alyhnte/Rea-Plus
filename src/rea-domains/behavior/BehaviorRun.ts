// rea-domains/behavior: tek çağrıda uçtan uca davranış koşusu (spawn+api+net birleşimi).
// rea_behavior_full hazır olay listelerini birleştirir; bu koşucu olayları kendisi toplar:
// hedef süreç gerçekten koşar (spawn), api/net katmanları enjekte toplayıcıdan ya da netUrl
// ile gerçek yakalamadan gelir, hepsi tek profilde birleşir. Kayıt dosyası yazılmaz.
// Kurallar: zaman aşımı zorunlu (varsayılan 30sn) → kısmi profil + işaret (sahte tam yok);
// hedef çökerse crash işareti + kanıt (sahte başarı yok); backend eksikse katman adı + kısmi.
import { spawn, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_behavior_full } from "./BehaviorFull.js";
import { rea_behavior_timeline, type DavranışOlay } from "./BehaviorTimeline.js";
import type { ApiOlay } from "./FileRegProfiles.js";
import { rea_net_capture } from "./NetCapture.js";

// Tek koşu kaydı: komut + pid + süre + çıkış (sinyal ölüm dahil).
export interface BehaviorRunKaydı {
  komut: string;
  args: string[];
  pid: number | null;
  süre_ms: number;
  çıkış_kodu: number | null;
  sinyal: string | null;
}
// Kısmi profil: tam iddia yokken dönen toplanmış kanıt.
export interface BehaviorRunKısmi {
  cizelge: DavranışOlay[];
  bulgular: string[];
  ozet: string;
  kayıt: BehaviorRunKaydı;
}
// Sonuç: tam profilde ok:true; zaman aşımı/çöküş/eksik backend ok:false + işaret + kısmi.
export type BehaviorRunSonucu =
  | { ok: true; tool: "rea_behavior_run"; cizelge: DavranışOlay[]; ozet: string; bulgular: string[]; kayıt: BehaviorRunKaydı; eksik_katmanlar: string[]; zaman_aşımı: false; crash: false }
  | { ok: false; code: "zaman_aşımı" | "crash" | "capability_unsupported"; reason: string; tool: "rea_behavior_run"; zaman_aşımı: boolean; crash: boolean; eksik_katmanlar: string[]; kismi: BehaviorRunKısmi };

// Canlı hedefe kanca atan api toplayıcı (pid ile çağrılır); null = backend yok.
export type ApiToplayıcı = (pid: number) => Promise<ApiOlay[] | null>;
// Net olayı toplayıcı; null = backend yok.
export type NetToplayıcı = () => Promise<DavranışOlay[] | null>;
export interface BehaviorRunSeçenek {
  args?: string[];
  timeout_ms?: number; // Zorunlu üst sınır; verilmezse 30sn (200ms..120sn aralığına kırpılır).
  apiOlaylari?: ApiOlay[] | ApiToplayıcı; // Verilmezse api katmanı eksik sayılır (sahte iz yok).
  netOlaylari?: DavranışOlay[] | NetToplayıcı; // Verilmezse net eksik; netUrl varsa gerçek yakalama denenir.
  netUrl?: string; // Yalnız localhost/data: (NetCapture kapısı dışını reddeder).
  dosyaProfili?: boolean; // rea_behavior_full'a geçirilir (varsayılan true).
}

// Zaman aşımı üst sınırı (varsayılan 30sn); kırpma payı ve öldürme bekleme payı.
export const VARSAYILAN_KOŞU_ZAMAN_AŞIMI_MS = 30_000;
const EN_KISA_MS = 200;
const EN_UZUN_MS = 120_000;
const ÖLDÜRME_PAYI_MS = 3000;
const ARAÇ = "rea_behavior_run";

// Çocuk süreç ağacını öldürür (Windows: taskkill /T /F, POSIX: grup SIGKILL); hatayı yutar.
function ağacıÖldür(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (pid === undefined || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  if (process.platform === "win32") {
    return new Promise((çöz) => {
      let bitti = false;
      const bitir = (): void => {
        if (bitti) return;
        bitti = true;
        try { child.kill("SIGKILL"); } catch { /* zaten ölü */ }
        çöz();
      };
      try {
        const tk = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        tk.once("error", bitir);
        tk.once("close", bitir);
        setTimeout(bitir, ÖLDÜRME_PAYI_MS).unref();
      } catch {
        bitir();
      }
    });
  }
  try { process.kill(-pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch { /* zaten ölü */ } }
  return Promise.resolve();
}

// Sözü süreyle sınırla; aşımda ya da hatada yedek dön (asılı toplayıcı koşuyu tutmaz).
function sınırla<T>(söz: Promise<T>, ms: number, yedek: T): Promise<T> {
  if (ms <= 0) return Promise.resolve(yedek);
  return new Promise<T>((çöz) => {
    const t = setTimeout(() => çöz(yedek), ms);
    t.unref();
    söz.then(
      (v) => { clearTimeout(t); çöz(v); },
      () => { clearTimeout(t); çöz(yedek); },
    );
  });
}

// netUrl ile gerçek yakalama denemesi (HAR tmp'de, sonra silinir); başarısızsa null.
async function netUrlYakala(url: string, ms: number): Promise<DavranışOlay[] | null> {
  const har = join(tmpdir(), `rea-davranis-${process.pid}-${Date.now()}.har`);
  try {
    const sn = Math.min(Math.max(Math.ceil(ms / 1000), 3), 15);
    const r = await rea_net_capture(url, sn, har);
    if (!r.ok) return null;
    return [{ kaynak: "net", zaman: Date.now(), detay: r.summary }];
  } catch {
    return null;
  } finally {
    try { rmSync(har, { force: true }); } catch { /* geçici HAR temizliği */ }
  }
}

// Tek çağrıda uçtan uca koşu: spawn + api/net toplama + birleşik profil.
export async function rea_behavior_run(komut: string, seçenek: BehaviorRunSeçenek = {}): Promise<BehaviorRunSonucu> {
  const args = [...(seçenek.args ?? [])];
  const boşKayıt = (pid: number | null, süre_ms = 0): BehaviorRunKaydı => ({ komut: String(komut ?? ""), args, pid, süre_ms, çıkış_kodu: null, sinyal: null });
  const boşKısmi = (neden: string, kayıt: BehaviorRunKaydı): BehaviorRunKısmi => ({ cizelge: [], bulgular: [neden], ozet: `koşu yok: ${neden}`, kayıt });
  if (!komut || typeof komut !== "string" || !komut.trim()) {
    const kayıt = boşKayıt(null);
    return { ok: false, code: "capability_unsupported", reason: "komut boş", tool: ARAÇ, zaman_aşımı: false, crash: false, eksik_katmanlar: ["process"], kismi: boşKısmi("komut boş", kayıt) };
  }
  const ham = seçenek.timeout_ms ?? VARSAYILAN_KOŞU_ZAMAN_AŞIMI_MS;
  const süre = Number.isFinite(ham) ? Math.min(Math.max(Math.floor(ham as number), EN_KISA_MS), EN_UZUN_MS) : VARSAYILAN_KOŞU_ZAMAN_AŞIMI_MS;
  const baş = Date.now();
  const kalan = (): number => Math.max(0, süre - (Date.now() - baş));

  // Spawn (gerçek toplama: süreç yaşam döngüsü kanıtı). shell:false, girdi kapalı.
  let child: ChildProcess;
  try {
    child = spawn(komut, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
  } catch (e) {
    const kayıt = boşKayıt(null, Date.now() - baş);
    const neden = `başlatılamadı: ${e instanceof Error ? e.message : String(e)}`;
    return { ok: false, code: "capability_unsupported", reason: neden, tool: ARAÇ, zaman_aşımı: false, crash: false, eksik_katmanlar: ["process"], kismi: boşKısmi(neden, kayıt) };
  }
  const pid = child.pid ?? null;
  // Boru geri basıncı hedefi kilitlemesin: çıktı akıtılır (kayda girmez, salt izleme).
  child.stdout?.resume();
  child.stderr?.resume();
  const olaylar: DavranışOlay[] = [{ kaynak: "process", zaman: 0, detay: `spawn:${komut}` }];

  // Katman toplama çocuk yaşarken paralel başlar (statik diziler anında, toplayıcılar süreyle sınırlı).
  const apiVeri = seçenek.apiOlaylari;
  const apiSözü: Promise<ApiOlay[] | null> = Array.isArray(apiVeri)
    ? Promise.resolve(apiVeri)
    : typeof apiVeri === "function"
      ? sınırla(Promise.resolve().then(() => (apiVeri as ApiToplayıcı)(pid ?? -1)), süre, null).then((v) => (Array.isArray(v) ? v : null))
      : Promise.resolve(null);
  const netVeri = seçenek.netOlaylari;
  const netSözü: Promise<DavranışOlay[] | null> = Array.isArray(netVeri)
    ? Promise.resolve(netVeri)
    : typeof netVeri === "function"
      ? sınırla(Promise.resolve().then(() => (netVeri as NetToplayıcı)()), süre, null).then((v) => (Array.isArray(v) ? v : null))
      : typeof seçenek.netUrl === "string" && seçenek.netUrl
        ? sınırla(netUrlYakala(seçenek.netUrl, süre), süre, null)
        : Promise.resolve(null);

  // Kapanış ya da zorunlu zaman aşımı (süre dolunca ağaç öldürülür, kısmiyle dönülür).
  let zamanAşıldı = false;
  const kapanış = new Promise<{ kod: number | null; sinyal: string | null }>((çöz) => {
    child.once("error", () => çöz({ kod: null, sinyal: child.signalCode ?? null }));
    child.once("close", (kod, sinyal) => çöz({ kod: typeof kod === "number" ? kod : null, sinyal: typeof sinyal === "string" ? sinyal : null }));
  });
  const bekle = await new Promise<{ kod: number | null; sinyal: string | null; aşıldı: boolean }>((çöz) => {
    const t = setTimeout(() => {
      zamanAşıldı = true;
      void ağacıÖldür(child).then(() => {
        // Öldürmeden sonra kapanışı kısa payla bekle, gelmezse kısmiyle ilerle.
        const g = setTimeout(() => çöz({ kod: null, sinyal: child.signalCode ?? "SIGKILL", aşıldı: true }), ÖLDÜRME_PAYI_MS);
        g.unref();
        void kapanış.then((k) => { clearTimeout(g); çöz({ ...k, aşıldı: true }); });
      });
    }, süre);
    t.unref();
    void kapanış.then((k) => { clearTimeout(t); çöz({ ...k, aşıldı: false }); });
  });
  const süre_ms = Date.now() - baş;
  const sinyal = bekle.sinyal ?? child.signalCode ?? (zamanAşıldı ? "SIGKILL" : null);
  const kod = zamanAşıldı ? null : bekle.kod;

  // Katmanlar kalan sürede sonlanır (statik diziler zaten hazır; asılan toplayıcı eksik sayılır).
  const apiOlaylar = (await sınırla(apiSözü, kalan(), null)) ?? [];
  const netOlaylar = ((await sınırla(netSözü, kalan(), null)) ?? []).filter((o) => o && (o as DavranışOlay).kaynak && (o as DavranışOlay).detay !== undefined);
  const eksik_katmanlar: string[] = [];
  if (apiOlaylar.length === 0) eksik_katmanlar.push("api");
  if (netOlaylar.length === 0) eksik_katmanlar.push("net");

  // Çıkış kanıtı her kısmi/tam profile girer (sinyal ya da kod).
  olaylar.push(zamanAşıldı
    ? { kaynak: "process", zaman: süre_ms, detay: `zaman_aşımı:öldürüldü:${sinyal ?? "?"}` }
    : { kaynak: "process", zaman: süre_ms, detay: sinyal ? `öldü:sinyal=${sinyal}` : `exit:kod=${kod}` });

  // Birleşim: önce api+net raporu (mevcut saf mantık), üstüne process kanıtı eklenip yeniden dizilir.
  const dosyaProfili = seçenek.dosyaProfili ?? true;
  const rapor = apiOlaylar.length > 0 ? rea_behavior_full(apiOlaylar, netOlaylar.length > 0 ? netOlaylar : undefined, dosyaProfili) : null;
  const tabanCizelge: DavranışOlay[] = rapor && rapor.ok ? rapor.cizelge : [];
  const tabanBulgular: string[] = rapor && rapor.ok ? [...rapor.bulgular] : [`olay=${olaylar.length + netOlaylar.length}`];
  const tabanÖzet = rapor && rapor.ok ? rapor.ozet : "";
  const hepsi = [...tabanCizelge, ...olaylar];
  const dizili = rea_behavior_timeline(hepsi);
  const cizelge = dizili.ok ? dizili.details.sıralı : hepsi;
  const kayıt: BehaviorRunKaydı = { komut, args, pid, süre_ms, çıkış_kodu: kod, sinyal };
  const damga = `komut=${komut}`, sonuç = `çıkış=${sinyal ?? kod}`;
  const bulgular = [...tabanBulgular, damga, sonuç];
  const ozet = `${tabanÖzet ? `${tabanÖzet} | ` : ""}${dizili.ok ? dizili.summary : `${cizelge.length} olay`} | ${damga} ${sonuç} süre=${süre_ms}ms`;

  // Zaman aşımı: kısmi + işaret (sahte tam profil YOK).
  if (zamanAşıldı || bekle.aşıldı) {
    const işaretli = [...bulgular, "zaman_aşımı:kısmi"];
    return { ok: false, code: "zaman_aşımı", reason: `zaman aşımı (${süre}ms): kısmi profil`, tool: ARAÇ, zaman_aşımı: true, crash: false, eksik_katmanlar, kismi: { cizelge, bulgular: işaretli, ozet: `${ozet} | zaman_aşımı:kısmi`, kayıt } };
  }
  // Çöküş (sinyal ya da sıfır-dışı çıkış): crash işareti + kanıt (sahte başarı YOK).
  const çöktü = sinyal !== null || (kod !== null && kod !== 0);
  if (çöktü) {
    const işaretli = [...bulgular, `crash:${sinyal ?? `kod=${kod}`}`];
    return { ok: false, code: "crash", reason: `hedef anormal bitti (${sinyal ?? `kod=${kod}`})`, tool: ARAÇ, zaman_aşımı: false, crash: true, eksik_katmanlar, kismi: { cizelge, bulgular: işaretli, ozet: `${ozet} | crash:kısmi`, kayıt } };
  }
  // Ağır izleme eksikse hangi katman + kısmi (tam iddia yok).
  if (eksik_katmanlar.length > 0) {
    const işaretli = [...bulgular, ...eksik_katmanlar.map((k) => `eksik:${k}`)];
    return { ok: false, code: "capability_unsupported", reason: `eksik katman (${eksik_katmanlar.join(",")}): kısmi profil`, tool: ARAÇ, zaman_aşımı: false, crash: false, eksik_katmanlar, kismi: { cizelge, bulgular: işaretli, ozet: `${ozet} | eksik:${eksik_katmanlar.join(",")}`, kayıt } };
  }
  return { ok: true, tool: ARAÇ, cizelge, ozet, bulgular, kayıt, eksik_katmanlar, zaman_aşımı: false, crash: false };
}
