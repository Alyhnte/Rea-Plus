# Fuzz kılavuzu

Parser'ları hedefleyen tekrarlanabilir fuzz katmanı (ROADMAP P3).
Node-tabanlıdır; AFL++/WSL gerekmez, bu makinede koşar.

## Önkoşul

```sh
npm run build   # testler dist parser'larını ister
```

## Hızlı koşu (CI dostu, <60sn)

```sh
node scripts/fuzz-harness.mjs --seed 1 --adet 50
```

Varsayılan bütçe: hedef başına 50 girdi, tekil çağrı tavanı 2000ms,
toplam tavan 45000ms. Çıkış kodu: bulgu yoksa `0`, crash/hang/atlanan
varsa `1`, çalışma hatasında `2`. Özet stdout'ta JSON'dur; ayrıntılı
rapor `--rapor-dir` altındadır (varsayılan: tmpdir).

Uzun koşu örneği:

```sh
node scripts/fuzz-harness.mjs --seed 7 --adet 500 --toplam-tavan 300000 --rapor-dir ./tmp-fuzz-7
```

## Rapor

`--rapor-dir` altında iki dosya üretilir:

- `ozet.json` — seed/adet/tavanlar, toplam/crash/hang/atlanan, sınıf
  dağılımı, imza grupları, tohum sha256'ları (tekrarlanabilirlik).
- `rapor.md` — insan özeti + grup tablosu + tekrar komutu.
- `repro/` — crash/hang veren girdiler (`.bin` + `.json` meta).

## Crash sınıfları

| Sınıf | Anlam |
|---|---|
| `tip` | `TypeError` |
| `aralik` | `RangeError` |
| `sozdizimi` | `SyntaxError` |
| `yigin-tasmasi` | çağrı yığını taşması (mesaj eşleşmesi) |
| `bellek` | bellek tükenmesi (mesaj eşleşmesi) |
| `genel` | diğer `Error`'lar |
| `bilinmeyen` | `Error` dışı fırlatma (string/sayı/...) |

Aynı `sınıf:ad:mesaj` imzası tek grupta toplanır.

## Tohum kuralları

- Tohumlar `tests/corpus`'tan salt-okunur okunur; **asla yazılmaz**.
- Kirlenme şüphesinde: `git restore -- tests/corpus/<dosya>` ve
  `node scripts/verify-corpus.mjs` ile doğrula.
- Çalışma dosyaları ve repro'lar yalnız tmpdir/`--rapor-dir` altındadır;
  gerçek kullanıcı dizinine yazılmaz.

## CI

`ci.yml`'deki `fuzz-parsers.mjs` smoke'u durur; bu harness hedefli
katmandır: `node --test tests/fuzz-harness.test.mjs` ile doğrulanır.

## AFL++ notu

AFL++ kuruluysa `repro/*.bin` dosyaları AFL++ corpus tohumu olarak
yeniden kullanılabilir; indirme/kurulum bu harness'in işi değildir
(ağ indirmesi yok).
