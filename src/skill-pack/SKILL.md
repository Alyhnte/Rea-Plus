# rea-plus skill-pack — Soruşturma Akışı İskeleti

> Çevrimdışı ilk temas: önce yerel köprüleri çağır, yetmezse kapıyı raporla.
> Hiçbir adımda uydurma bulgu yazma; `capability_unsupported` dön ve dur.

## 0. Ortak Kapı

- Girdi boş/bozuksa ilgili `rea_*` kapısı `capability_unsupported` döner.
- Kapalı kapıyı atlama; üst akışa aynen taşı.
- Her bulguya `tool` + `summary` + ham kanıt ekle.

## 1. Native Akışı

1. `rea_dos_mz` ile MZ/e_lfanew doğrula (16-bit DOS şüphesi).
2. `rea_dos_int21` ile INT 21h sayımı yap.
3. `rea_aot_detect` ile NativeAOT sinyalini tara.
4. `rea_aot_objc` / `rea_aot_swift` ile dispatch tablosunu özetle.
5. Referans: `src/rea-domains/wasm-evm/DosMipsBridge.ts`.

## 2. JS Akışı

1. `rea_js_bundle` ile bundle özetini çıkar.
2. `rea_js_sourcemap` ile kaynak/mappings sayımı yap.
3. `rea_diff_match` ile sürümler arası fonksiyon eşle.
4. `rea_diff_summary` ile eklenen/silinen sayımı ver.
5. Referans: `src/rea-domains/javascript/BinaryDiff.ts`.

## 3. APK Akışı

1. `cargo apk` çıktısını ham bayt olarak al (dex/elf ayrımı).
2. Native taraf için `rea_mips_psp_profile` iskeletini koş.
3. JS tarafı (bundle) varsa JS akışına dallan.
4. Crash kaydı varsa `rea_crash_timeline` ile diz.
5. Referans: `src/rea-domains/android/*` + wasm-evm köprüleri.

## 4. Web Akışı

1. Bundle + source-map çiftini topla, map yoksa `rea_js_bundle`.
2. Şüpheli chunk için `rea_recon_funcs` ile aday çıkar.
3. `rea_recon_harness` ile 3205 vakasına C taslağı üret.
4. `rea_recon_tag` ile vaka etiketini bas.
5. Referans: `src/rea-domains/javascript/ReconHarness.ts`.

## 5. Kapanış

- Tüm kapılar kapalıysa: "kanıt yetersiz" yaz, dosyayı kapat.
- Bulguları `docs/AIRGAP.md` doğrulama listesine işle.
- Yeni sinyal görürsen skill-pack'e başvuru satırı ekle, kodu şişirme.
