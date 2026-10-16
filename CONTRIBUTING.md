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
   Ölçütler ve form için bkz. §6.

## 4) TDD kuralı

Yeni davranış ve hata düzeltmesi test-önce (test-first) yazılır:
önce başarısız test (kırmızı), sonra en küçük implementasyon (yeşil),
sonra temizlik (refactor). Testi gevşeterek yeşile dönmek yasaktır.

```bash
node --test tests/<alan>.test.mjs   # tek dosya koşusu, örn. tests/corpus-manifest.test.mjs
npm run typecheck                     # tsc --noEmit, PR öncesi zorunlu
npm test                              # varsayılan küme (node scripts/run-tests.mjs)
```

- Yeni örnek/çıktı sayılarını gerçek koşudan alın, uydurmayın;
  `docs/EXAMPLES.md` + `tests/docs-examples.test.mjs` desenini izleyin.
- Her dosya 90 sn tavanla koşar; asılı süreç/timer bırakmayın.
- Test ve docs'ta kişisel yol/ev dizini sızdırmayın (`tmpdir()`
  kullanın, mutlak yolları assert etmeyin).

## 5) Korpus kuralları (`tests/corpus/`)

Kanon: `tests/corpus/README.md`. Özet:

1. Dosyayı bu dizine koy.
2. sha256 özetini hesapla.
3. `HASHES.json` içine `kaynak` + `lisans` alanlarıyla yeni girdi ekle
   (bilinmiyorsa `"bilinmiyor"` yaz, uydurma lisans yazılmaz).
4. `node scripts/verify-corpus.mjs` ile doğrula — başarıda exit `0`;
   eksik/uyuşmaz/manifest-dışı dosyada dosya adıyla rapor + exit `1`
   (`HASHES.json` ve `README.md` fixture sayılmaz).
5. Manifest'e eklenmeyen dosya testleri geçirmez
   (`tests/corpus-manifest.test.mjs`).

Notlar:

- `tests/corpus/ornek.js` metin dosyasıdır: LF/CRLF churn'u normaldir,
  test bitince `git restore -- tests/corpus/ornek.js` ile döndürün.
- `tests/corpus/*` içine el ile oynanmış ya da manifestsiz dosya
  bırakmayın.

## 6) `good-first-issue` etiketi + ilk PR

Etiketin anlamı: bakımcıların yeni başlayanlara uygun gördüğü küçük,
tek konulu iş. Bulmak için Issues sekmesinde `good-first-issue`
etiket filtresini kullanın.

Uygun iş ölçütleri:

- Tek PR boyutunda, tek konulu.
- Canlı enjeksiyon/debugger, paket yakalama, tarayıcı, ağ indirmesi
  gerektirmez; yeni araç adı eklemez (Conduit çekirdek 30 araç adı
  dondurulmuştur — `src/facade/toolNamespace.ts`).
- Korpus fixture'ı ekliyorsa §5 kurallarına uyar.
- Klasik örnekler: README/ROADMAP sayı senkronu, corpus köken tablosu
  tamamlama, docs yazım tutarlılığı.

Öneri formu: `.github/ISSUE_TEMPLATE/good-first-issue.yml` — görev
tanımı, kabul kriteri, alan, ilgili dosya ve "yeni başlayan uygunluğu"
kutularını doldurun; bakımcılar etiketi forma göre takar.

İlk PR adımları:

1. Yerde `npm run typecheck` + `npm test` yeşil olmalı.
2. Küçük, tek konulu PR + açıklama + test kanıtı (`npm test` çıktısı).
3. Dokunulmazlar: `docs/TOOLS.md` (üretim:
   `node scripts/generate-tool-reference.mjs`), conduit araç adları,
   mevcut CI workflow'ları (`.github/workflows/`).
