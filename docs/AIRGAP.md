# AIRGAP — Offline Paket Yol Haritası (rea-plus WP6)

> Tamamen çevrimdışı çalışır; ağ çağrısı yok, telemetri yok.
> Her modül `capability_unsupported` kapısı döner, asla sessizce uydurmaz.

## 1. Kapsam

- `wasm-evm`: DOS/MIPS, NativeAOT, crash timeline iskeletleri.
- `javascript`: sürüm diff ve recon harness iskeletleri.
- `skill-pack`: soruşturma akışı başvuruları (native/js/apk/web).

## 2. Paket İçeriği

| Paket | İçerik | Ağ gereksinimi |
|---|---|---|
| `core` | saf TS köprüler | yok |
| `docs` | AIRGAP + ÖNERİLER | yok |
| `skill` | SKILL.md başvuruları | yok |

## 3. Kurulum (Airgap)

1. Paketi USB ile taşı, hash doğrula (`sha256sum`).
2. `npm ci --offline` ile bağımlılıkları kur.
3. `REA_WABT_BIN` yoksa wasm decode kapısı kapalı kalır.
4. Testleri çevrimdışı koş: `npm test -- --offline`.

## 4. Capability Kapıları

- `REA_WABT_BIN` tanımsızsa `rea_wasm_decode` kapalıdır.
- Ham bayt < 64 ise DOS/MIPS kapıları `capability_unsupported` döner.
- PE imzasız girdide AOT kapıları `capability_unsupported` döner.
- Crash kaydı boşsa timeline kapısı `capability_unsupported` döner.
- Fonksiyon listesi boşsa diff kapısı `capability_unsupported` döner.

## 5. Doğrulama

- [ ] `DosMipsBridge` 40-60 satır aralığında.
- [ ] `NativeAotBridge` 40-60 satır aralığında.
- [ ] `CrashTimeline` 40-60 satır aralığında.
- [ ] `BinaryDiff` ve `ReconHarness` 40-60 satır aralığında.
- [ ] Hiçbir dosyada ağ importu yok (`fetch`, `axios` yasak).
- [ ] Tüm Türkçe yorumlar yerinde.

## 6. Sınırlamalar

- Keccak/selector gerçek hash değil, yer tutucu FNV kullanır.
- VLQ decode ve CLR header parse WP4d sonrasına bırakıldı.
- Harness taslağı derlenebilirlik garantisi vermez.
