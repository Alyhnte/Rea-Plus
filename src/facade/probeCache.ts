// facade/probeCache: doctor probe sonuçları için TTL'li önbellek.
// doctor.ts surumDene desenini tamamlar: pahalı PATH yoklamaları bir kez koşar.
export class ProbeCache {
  // Kayıt: değer + son geçerlilik anı (ms).
  private yazma = new Map<string, { deger: unknown; olum: number }>();
  // ttlMs varsayılan 60sn; now enjekte edilebilir (testte sahte saat).
  constructor(
    private ttlMs = 60_000,
    private now: () => number = Date.now,
  ) {}
  // Taze ise değeri döner, bayatsa siler ve undefined verir.
  get(anahtar: string): unknown | undefined {
    const k = this.yazma.get(anahtar);
    if (!k) return undefined;
    if (this.now() > k.olum) {
      this.yazma.delete(anahtar);
      return undefined;
    }
    return k.deger;
  }
  // Değeri şimdi + TTL son geçerlilikle saklar.
  set(anahtar: string, deger: unknown): void {
    this.yazma.set(anahtar, { deger, olum: this.now() + this.ttlMs });
  }
  // Bayat kaydı düşerek tazelik bildirir (undefined değerde de doğru).
  has(anahtar: string): boolean {
    const k = this.yazma.get(anahtar);
    if (!k) return false;
    if (this.now() > k.olum) {
      this.yazma.delete(anahtar);
      return false;
    }
    return true;
  }
  // Tüm kayıtları atar.
  clear(): void {
    this.yazma.clear();
  }
  // Tek anahtarı atar.
  invalidate(anahtar: string): void {
    this.yazma.delete(anahtar);
  }
}
// Taze kayıt varsa probeFn koşmadan döner, yoksa koşup saklar.
export async function withCache<T>(
  cache: ProbeCache,
  anahtar: string,
  probeFn: () => T | Promise<T>,
): Promise<T> {
  if (cache.has(anahtar)) return cache.get(anahtar) as T;
  const deger = await probeFn();
  cache.set(anahtar, deger);
  return deger;
}
