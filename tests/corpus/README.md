# Golden korpus

Bu dizin, offline testlerin kanonik fixture'larını tutar.

## Dosyalar

| Dosya | Kaynak | Lisans |
|---|---|---|
| `mini_branch.elf` | bilinmiyor | bilinmiyor |
| `mini_pe_x64.exe` | bilinmiyor | bilinmiyor |
| `ornek.js` | `scripts/korpus-kur.mjs` ile üretilir (deterministik) | bilinmiyor |
| `ornek.wasm` | `scripts/korpus-kur.mjs` ile üretilir (deterministik) | bilinmiyor |
| `sahte.apk` | `scripts/korpus-kur.mjs` ile üretilir (deterministik) | bilinmiyor |

Bilinmeyen kaynak/lisans alanları bilerek `bilinmiyor` bırakıldı; uydurma
lisans yazılmaz. Kökeni bilinen bir fixture eklendiğinde `HASHES.json`
güncellenir.

## Doğrulama

```sh
node scripts/verify-corpus.mjs
```

Başarıda exit kodu `0`; eksik/uyuşmaz/manifest-dışı dosyada dosya adıyla
rapor + exit kodu `1`. `HASHES.json` ve bu `README.md` fixture sayılmaz.

## Satır sonu notu (`ornek.js`)

`ornek.js` metin dosyasıdır. `scripts/korpus-kur.mjs` onu LF ile yazar;
`core.autocrlf=true` olan makinede `git checkout`/`git restore` ise CRLF
verir. `HASHES.json` referansı **restore/checkout sonrası** haline göredir
(bu worktree'de CRLF). `tests/corpus.test.mjs` koşusu dosyayı LF'ye çevirir;
bu beklenen churn'dür, test bitince `git restore -- tests/corpus/ornek.js`
ile dönülür.

## Yeni fixture ekleme

1. Dosyayı bu dizine koy.
2. sha256 özetini hesapla.
3. `HASHES.json` içine `kaynak` + `lisans` alanlarıyla yeni girdi ekle
   (bilinmiyorsa `"bilinmiyor"` yaz, uydurma).
4. `node scripts/verify-corpus.mjs` ile doğrula.
5. Manifest'e eklenmeyen dosya testleri geçirmez
   (`tests/corpus-manifest.test.mjs`).
