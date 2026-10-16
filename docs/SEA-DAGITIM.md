# SEA / Portable Dağıtım (Dalga 4e) — Node'suz Windows dağıtımı

## KARAR: portable node bundle (tek-dosya SEA değil)

Fizibilite (`docs/SEA-FIZIBILITE.md`): hello-world SEA üretildi ve çalıştı, ama
rea-plus'ın tamamını tek exe yapmanın **3 engeli açık**. Bu dalgada gerçekçi
olan üretilir, gerçekçi olmayan dürüstçe kayda geçirilir — uydurma `ok:true` yok.

## 3 engelin durumu (değişmedi — hepsi AÇIK)

| # | Engel | Durum | Ölçüm / gerekçe |
|---|-------|-------|-----------------|
| 1 | Frida native binding gömülemez | AÇIK | `frida_binding.node` **135.663.104 bayt** (~129,4 MiB); SEA blob'una `.node` gömülemez. Göm-yaz-`dlopen` yolu imzasız exe + tmp'ye `.node` yazma = AV/EDR davetiyesi |
| 2 | Playwright dinamik yükü | AÇIK | `await import("playwright")` + harici tarayıcı binary'leri; pakete gömülemez. Portable'da paket **dışında** bırakıldı → browser domainleri `capability_unsupported` döner |
| 3 | Araç zinciri + imzalama | AÇIK | `postject` bu ortamda yok ve ağ indirmesi yasak; kod imzalama yok (imzasız exe SmartScreen'e takılır) |

Sonuç: `MANIFEST.json` içinde `sea.tekDosya = { ok: false, neden: ... }` kayıtlıdır;
`tests/sea-paket.test.mjs` (f) maddesi bu dürüstlüğü kilitler.

## Üretilen: portable bundle

`node scripts/sea-portable.mjs` (önce `npm run build`):

- Çıktı: `dist-release/rea-plus-portable-<platform>-<arch>/` (+ aynı adlı `.zip`)
- İçerik: sistem `node.exe`'sinin **kopyası** (indirme yok) + `dist/` + prod
  `node_modules` + `package.json`/`server.json`/`configs/` + `rea-plus*.cmd` + `KULLANIM.txt` + `MANIFEST.json`
- Budanan (devDeps): `playwright`, `typescript`, `@types` (+ `.bin`, `.package-lock.json`)

### Ölçülen boyutlar (v0.10.1, win32-x64, node v24.19.0)

| Parça | Boyut |
|-------|-------|
| `node.exe` (kopya) | 92.825.416 bayt (~88,5 MiB) |
| `frida_binding.node` (dosya olarak) | 135.663.104 bayt (~129,4 MiB) |
| `dist/` (322 dosya) | ~1,95 MiB |
| Dizin toplamı (2852 dosya) | 266.264.159 bayt (~253,9 MiB) |
| `.zip` | 95.105.704 bayt (~90,7 MiB) |

## Adımlar (kullanıcı / release)

1. `npm run build && node scripts/sea-portable.mjs`
2. `dist-release/rea-plus-portable-win32-x64.zip`'i release'e yükle
3. Kullanıcı: zip'i aç → `rea-plus-cli.cmd doctor` (ortam raporu)
4. Duman kanıtı: paketteki node ile
   `analyze-evm transfer(address,uint256) --json` → `0xa9059cbb` (exit 0)

## Sınırlar (söz verilmeyen)

- Tek dosya `rea-plus.exe` YOK (3 engel yukarıda).
- Başka OS/mimariye taşınmaz (`frida_binding.node` platforma özeldir; her platform kendi makinesinde derler).
- İmza YOK: ilk çalıştırmada SmartScreen sorabilir.
- Playwright YOK: browser domainleri `capability_unsupported` + kurulum ipucu döner.
- Test: `node --test tests/sea-paket.test.mjs` (6 assert) + tam küme `npm test`.
