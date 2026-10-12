// facade/parallelProbe: doctor problarını limitli paralellikte koşar.
// doctor.ts prob listesi seridir; bu koşucu 4'erli grup + süre ölçer.
export interface ProbeSonuc {
  ok: boolean;
  deger?: unknown;
  hata?: string;
  sure_ms: number;
}
// Her probu dener: sonuç ya da Türkçe hata + geçen süreyle döner.
async function tekKos(ad: string, fn: () => unknown): Promise<[string, ProbeSonuc]> {
  const bas = Date.now();
  try {
    const deger = await fn(); // sync throw da burada yakalanır
    return [ad, { ok: true, deger, sure_ms: Date.now() - bas }];
  } catch (h) {
    return [ad, { ok: false, hata: h instanceof Error ? h.message : String(h), sure_ms: Date.now() - bas }];
  }
}
// Probları limit büyüklüğünde gruplar hâlinde paralel koşar.
export async function runProbes(
  probes: Record<string, () => unknown>,
  limit = 4,
): Promise<Record<string, ProbeSonuc>> {
  const giris = Object.entries(probes);
  const cikti: Record<string, ProbeSonuc> = {};
  const sinir = Math.max(1, Math.floor(limit));
  for (let i = 0; i < giris.length; i += sinir) {
    const grup = giris.slice(i, i + sinir);
    const sonuclar = await Promise.all(grup.map(([ad, fn]) => tekKos(ad, fn)));
    for (const [ad, s] of sonuclar) cikti[ad] = s;
  }
  return cikti;
}
