# SEA Fizibilite (Dalga J/1) — Node'suz dağıtım mümkün mü?

## KARAR: Yapılabilir (hello-world düzeyinde kanıtlandı) — rea-plus'ın tamamı için 3 engel var

Node 24 win-x64 ile hello-world SEA üretildi ve çalıştırıldı. rea-plus'ın tamamını
tek exe yapma yolu açık ama Frida native binding'i, Playwright dinamik yükü ve
~230MB+ boyut pratik engeldir. Engeller aşılmadan "rea-plus.exe" sözü verilmemeli.

## Kanıtlar (2026-10-16, Node v24.19.0 win-x64, geçici dizinde)

| # | Deney | Sonuç | Değer |
|---|-------|-------|-------|
| 1 | `node --experimental-sea-config` blob üretimi | BAŞARILI | blob 63 bayt |
| 2 | postject ile node.exe kopyasına enjeksiyon | BAŞARILI | `sea-hello.exe` 92.952.064 bayt |
| 3 | Üretilen exe'yi çalıştırma | BAŞARILI | çıktı `SEA-HELLO-OK` (exit 0) |
| 4 | Güncel sentinel fuse binary'de mevcut | DOĞRULANDI | `NODE_SEA_FUSE_...5df1996b2` @89987191 |
| 5 | Eski sentinel (`...ac052938`) bu derlemede yok | DOĞRULANDI | bulunamadı (yanlış fuse = enjeksiyon hatası) |
| 6 | `--build-sea` (tek adımda exe) | YOK | v25.5+ gerektirir; v24'te postject şart |

Tuzak: eski dokümantasyondaki sentinel ile enjeksiyon
`Could not find the sentinel` hatası verir. Doğru fuse güncel Node docs'tadır.

## rea-plus engelleri

1. **Frida native binding (en büyük engel).** `node_modules/frida/build/frida_binding.node`
   135.663.104 bayt (~129,4 MiB), `.node` dosyası SEA blob'una gömülemez.
   Node docs yöntemi: asset olarak göm + ilk çalışmada geçici dizine yaz + `process.dlopen`.
   Sonuç: "tek dosya" ilk çalışmada yanına dosya çıkarır; imzasız exe + tmp'ye `.node`
   yazma, AV/EDR false-positive'e davetiye çıkarır. Boyut: 93MB (node) + 129MiB (frida) + dist ≈ 230MB+.
2. **Playwright dinamik yükü.** `BrowserDepth.ts:8`, `BrowserBridge.ts:12`
   `await import("playwright")` yapar; playwright `devDependencies`'tedir ve ayrıca
   harici tarayıcı binary'leri indirir. SEA'ya gömülemez; ya dışlanmalı ya da opsiyonel kalmalı.
   (`node:fs/promises` gibi builtin dinamik importlar sorunsuzdur.)
3. **Boyut + araç zinciri.** Taban exe ~93MB; CI'da postject adımı gerekir
   (repoda yok, `npx postject` ağ ister); dağıtım için kod imzalama gerekir
   (imzasız exe Windows SmartScreen'e takılır).

Kolaylaştırıcılar: `dist/` yalnızca ~2MB (328 dosya); `frida.ts`/`FridaPlus.ts`/`ApiTracer.ts`
statik `import "frida"` kullanır (bundle'lanabilir); MCP stdio SEA içinde çalışır.

## Yol haritası (rea-plus.exe için)

1. `dist/` + saf JS bağımlılıklarını esbuild/benzeri ile tek bundle yap (dinamik `import("playwright")` dışlanır).
2. `frida_binding.node` → `assets` + tmp'ye yaz + `process.dlopen` (docs yöntemi); ilk-çalışma davranışını belgele.
3. Playwright gerektiren domain'leri SEA dışında bırak (opsiyonel profil) ya da harici bağımlılık olarak belgele.
4. CI'ya postject adımı ekle (veya Node ≥25.5 `--build-sea`); exe'yi imzala.
5. Alternatif (daha ucuz): **portable node bundle** — resmi `node.exe` + `dist/` + `node_modules` zip'i;
   tek dosya değil ama imza/AV sorunu yok, Frida olduğu gibi çalışır.

## Dosyalar

- `scripts/sea-build.mjs` (yeni): hello-world SEA pilotu — temp dizinde üret + enjekte et + çalıştırıp doğrular.
- `tests/sea-fizibilite.test.mjs` (yeni): 5 assert — node≥20, blob üretimi (<10KB), güncel sentinel var,
  eski sentinel yok, frida binding >100MB. Ağ yok, büyük binary yok.
- Bu rapor: `docs/SEA-FIZIBILITE.md` (yeni).

## Test sonucu

- Yeni test: 5/5 PASS (`node --test tests/sea-fizibilite.test.mjs`, ~0,15 sn).
- Tam küme (`npm test`): **87/87 PASS, 0 FAIL** (önce `npm run build` ile `dist/` üretildi; baseline build'siz 5/86 idi).
