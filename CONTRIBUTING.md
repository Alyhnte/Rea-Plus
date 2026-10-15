# Katkı Rehberi (Contributing)

Issues ve PR'ler açık — hata raporu, özellik fikri, docs. Aşağıdaki akış
README'daki kısa bölümü genişletir; kurallar ihlal edilirse CI kızarır.

## 1) Kurulum

```bash
git clone https://github.com/Alyhnte/ReaPlus.git
cd ReaPlus
npm ci                 # temiz kurulum (CI ile aynı)
npm run build          # tsc + çalışma-zamanı asset'leri -> dist/
```

Gereksinim: Node.js ≥ 20. Ghidra/rizin/jadx/Frida araçları opsiyoneldir —
eksik backend `capability_unsupported` + kurulum ipucu verir; kurulu
olmayan araç için sahte sonuç yazmayın. Kendi makine haritanız için
`node dist/cli/index.js doctor` koşturun.

## 2) Test

```bash
npm run typecheck      # tsc --noEmit, PR öncesi zorunlu
npm test               # varsayılan küme (canlı enjeksiyon/debugger/paket
                       # yakalama/tarayıcı hariç; VM/CI işi için ayrı)
npm run test:live      # her şey dahil — yalnız VM/ayrı CI işinde
node --test tests/<alan>.test.mjs   # tek dosya koşusu
```

Kurallar:

- Her dosya 90 sn tavanla koşar; asılı süreç/timer bırakmayın (ağaç-kill
  sizi kurtarır ama bilinçli yazın).
- Yeni örnek/çıktı ekliyorsanız sayıları gerçek koşudan alın, uydurmayın;
  `docs/EXAMPLES.md` + `tests/docs-examples.test.mjs` desenini izleyin.
- `tests/corpus/ornek.js` metin dosyasıdır: LF/CRLF churn'u normaldir,
  test bitince `git restore -- tests/corpus/ornek.js` ile döndürün.
- Test ve docs'ta kişisel yol/ev dizini sızdırmayın (`tmpdir()` kullanın,
  mutlak yolları assert etmeyin).
- Yeni fixture: `tests/corpus/README.md` adımlarını izleyin (dosya +
  sha256 + `HASHES.json` + `verify-corpus`); manifest-dışı dosya
  `corpus-manifest` testini geçirmez.

## 3) PR akışı

1. Küçük, tek konulu PR açın; açıklama + test kanıtı (`npm test` çıktısı)
   ekleyin.
2. Göndermeden önce yerelde: `npm run typecheck` + `npm test` yeşil olmalı.
3. CI (`.github/workflows/ci.yml`, Ubuntu, Node 20 + 22) aynısını koşar:
   `npm ci` → `typecheck` → `build` → `test`.
4. Bunlara dokunmayın/kırmayın:
   - Conduit çekirdek 30 araç adı dondurulmuştur (`src/facade/toolNamespace.ts`);
     yeniden adlandırma yasaktır.
   - `docs/TOOLS.md` elle düzenlenmez — `node scripts/generate-tool-reference.mjs`
     ile üretilir; `tool-reference` testi sapmayı yakalar.
   - Yeni araç dürüst başarısız olur (`capability_unsupported`, asla sahte `ok`);
     canlı-mutasyon çağrıları `confirm:true` ister.
5. `good-first-issue` arıyorsanız: README/ROADMAP sayı senkronu, corpus
   fixture köken tablosu gibi küçük tutarlılık işleri ideal ilk PR'dır.
