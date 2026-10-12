// rea-plus facade: opt-in telemetri, varsayılan KAPALI
// Gizlilik: yol/token tutulmaz; yalnız hedef tipi + araç adı + sonuç.
import { appendFileSync } from "node:fs";
// Kayıt şeması: üç alan da kısa etikettir, serbest metin yol yasaktır.
export interface TelemetriOlay {
  hedef_tip: string; // Örn. "apk", "elf", "wasm"
  eksik_arac: string; // Örn. "jadx", "ghidra"
  sonuc: string; // Örn. "tamam", "eksik-arac"
}
// Özet şeması: toplam + en sık eksik araç + hedef dağılımı.
export interface TelemetriOzet {
  toplam: number;
  en_cok_eksik: string | null;
  hedef_dagilimi: Record<string, number>;
}
// Bellek içi kayıt; dosya yazımı yalnız appendJsonl ile olur.
export class Telemetry {
  private acik = false; // Opt-in: açılmadan kayıt yok.
  private olaylar: TelemetriOlay[] = [];
  // Kaydı açar; kapalı Telemetri record çağrılarını yutar.
  enable(): void {
    this.acik = true;
  }
  // Kaydı kapatır; biriken özet korunur, yeni kayıt durur.
  disable(): void {
    this.acik = false;
  }
  // Olayı belleğe alır; kapalıyken yok sayar (yan etki yok).
  record(olay: TelemetriOlay): void {
    if (!this.acik) return;
    // Yalnız izinli üç alanı kopyalar; fazla alan (yol/token) düşer.
    this.olaylar.push({ hedef_tip: olay.hedef_tip, eksik_arac: olay.eksik_arac, sonuc: olay.sonuc });
  }
  // Özeti hesaplar: toplam, en sık eksik araç, hedef dağılımı.
  summary(): TelemetriOzet {
    const hedef_dagilimi: Record<string, number> = {};
    const aracSayim: Record<string, number> = {};
    for (const o of this.olaylar) {
      hedef_dagilimi[o.hedef_tip] = (hedef_dagilimi[o.hedef_tip] ?? 0) + 1;
      aracSayim[o.eksik_arac] = (aracSayim[o.eksik_arac] ?? 0) + 1;
    }
    let en_cok_eksik: string | null = null;
    for (const [arac, sayi] of Object.entries(aracSayim)) {
      if (en_cok_eksik === null || (aracSayim[en_cok_eksik] ?? 0) < sayi) en_cok_eksik = arac;
    }
    return { toplam: this.olaylar.length, en_cok_eksik, hedef_dagilimi };
  }
  // Belleği JSONL olarak dosyaya ekler (append); kayıt yoksa yazmaz.
  appendJsonl(yol: string): void {
    if (this.olaylar.length === 0) return;
    appendFileSync(yol, this.olaylar.map((o) => JSON.stringify(o)).join("\n") + "\n", "utf8");
  }
}
