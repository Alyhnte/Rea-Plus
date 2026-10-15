// facade/sniff.ts: sihirli bayt -> hedef tip + önerilen motor.
// İlk 4KB okunur; saf karar sniffBytes içindedir.
// Büyük dosyalar: başlık + aralıklı pencere okuma (mmap yok, fs read + offset),
// sabit tampon (64KB), erken çıkış, iptal desteği (Dalga G/8).
import { closeSync, openSync, readSync, statSync } from "node:fs";
import type { ReaPlusEngine } from "./sessionRouter.js";

// sniffBytes ile aynı küme: dosya türü belirteci.
export type SniffTip = "elf" | "apk" | "dex" | "wasm" | "pe" | "macho" | "bilinmiyor";

// Tanı sonucu: tür + bu türe en uygun motor önerisi.
export interface SniffSonuc { tip: SniffTip; motor: ReaPlusEngine; }

// Tür bilinmeyince güvenli varsayılan: statik analiz motoru.
const VARSAYILAN: SniffSonuc = { tip: "bilinmiyor", motor: "radare2" };

// Saf imza eşleştirme: ELF, DEX, WASM, ZIP/APK, MZ/PE, Mach-O.
export function sniffBytes(buf: Uint8Array): SniffSonuc {
  const imza = [...buf.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (imza.startsWith("7f454c46")) return { tip: "elf", motor: "radare2" }; // ELF
  if (imza.startsWith("6465780a")) return { tip: "dex", motor: "jadx" }; // DEX ("dex\n")
  if (imza.startsWith("0061736d")) return { tip: "wasm", motor: "wasm" }; // WASM
  if (imza.startsWith("504b0304")) return { tip: "apk", motor: "jadx" }; // ZIP/APK/JAR
  if (imza.startsWith("4d5a")) return { tip: "pe", motor: "x64dbg" }; // MZ/PE
  if (imza === "feedfacf" || imza === "cefaedfe" || imza === "cafebabe") return { tip: "macho", motor: "hopper" };
  return { ...VARSAYILAN }; // tanınmayan imza
}

// Dosyadan ilk 4KB okur; yoksa/okunamazsa bilinmiyor döner (kapı kodu yok).
// KRİTİK: dosyanın tamamı belleğe alınmaz; yalnız başlık penceresi okunur.
export function sniffFile(yol: string): SniffSonuc {
  const bas = baslikOku(yol, 4096);
  if (!bas) return { ...VARSAYILAN };
  return sniffBytes(bas);
}

// İlk N baytı sabit tamponla okur (dosyanın tamamı belleğe alınmaz).
// Yoksa/okunamazsa null döner.
export function baslikOku(yol: string, baytSayisi = 4096): Buffer | null {
  if (!yol || baytSayisi <= 0) return null;
  let fd = -1;
  try {
    const boy = statSync(yol).size;
    if (boy === 0) return Buffer.alloc(0); // boş dosya: hata değil, boş başlık
    fd = openSync(yol, "r");
    const n = Math.min(baytSayisi, boy);
    const buf = Buffer.alloc(n);
    let doldu = 0;
    while (doldu < n) {
      const k = readSync(fd, buf, doldu, n - doldu, doldu);
      if (k <= 0) break;
      doldu += k;
    }
    return doldu > 0 ? buf.subarray(0, doldu) : null;
  } catch {
    return null;
  } finally {
    if (fd >= 0) { try { closeSync(fd); } catch { /* kapanmış */ } }
  }
}

// Sabit tampon: tek pencere üst sınırı (BinaryDiff PENCERE ile aynı).
export const STREAMING_PENCERE = 64 * 1024;

export interface PencereSecenek {
  pencereBoy?: number; // varsayılan 64KB; üst sınır 64KB (tavan garantisi)
  sinyal?: AbortSignal; // iptal: abort olursa üretim durur (AbortError)
}

// Sabit tamponlu pencere üretici: GB'lık dosyalarda OOM bitirir.
// - Tembel açılır: fd ilk next()'te açılır (tüketilmeyen akış okuma yapmaz).
// - İstemci break/return edince finally fd'yi kapatır (kaynak israfı yok).
// - Sinyal abort olursa AbortError fırlatır, fd kapanır (üretici durur).
// - Asılı süreç/timer yok: yalnız senkron fs okuma, kapatma garantili.
export class PencereAkis {
  readonly yol: string;
  readonly pencereBoy: number;
  readonly sinyal?: AbortSignal;
  readonly boy: number;
  okunan = 0; // toplam okunan bayt
  tavan = 0; // tek okuma azamisi (<= STREAMING_PENCERE)
  pencereSayisi = 0; // verilen pencere adedi
  kapatildi = false; // açık fd kalmadı mı
  private fd = -1;

  constructor(yol: string, sec: PencereSecenek = {}) {
    this.yol = yol;
    const istenen = sec.pencereBoy ?? STREAMING_PENCERE;
    this.pencereBoy = Math.min(Math.max(1, Math.floor(istenen)), STREAMING_PENCERE);
    this.sinyal = sec.sinyal;
    this.boy = statSync(yol).size; // yoksa fırlatır (çağıran yakalar)
  }

  kapat(): void {
    if (this.fd >= 0) { try { closeSync(this.fd); } catch { /* kapanmış */ } this.fd = -1; }
    this.kapatildi = true;
  }

  private iptalKontrol(): void {
    if (this.sinyal?.aborted) {
      const e = new Error("akış iptal edildi");
      e.name = "AbortError";
      throw e;
    }
  }

  *pencereler(baslangic = 0): Generator<{ ofset: number; veri: Buffer }, void, void> {
    try {
      this.iptalKontrol();
      this.fd = openSync(this.yol, "r");
      const tampon = Buffer.alloc(this.pencereBoy);
      let ofset = Math.max(0, Math.floor(baslangic));
      while (ofset < this.boy) {
        this.iptalKontrol();
        const k = readSync(this.fd, tampon, 0, Math.min(this.pencereBoy, this.boy - ofset), ofset);
        if (k <= 0) break;
        this.okunan += k;
        if (k > this.tavan) this.tavan = k;
        this.pencereSayisi++;
        yield { ofset, veri: Buffer.from(tampon.subarray(0, k)) };
        ofset += k;
      }
    } finally {
      this.kapat();
    }
  }
}
