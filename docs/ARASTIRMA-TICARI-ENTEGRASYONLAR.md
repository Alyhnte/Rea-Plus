# ARAŞTIRMA — Ticari entegrasyonlar (IDA / Hopper / JEB)

> Etiket anahtarı: her madde sonunda **[repo-içi]** (bu repoda dosyayla doğrulanabilir)
> ya da **[doğrulanmadı]** (repo + eğitim verisinden; resmî belgede teyit edilmedi).
> Uydurma API/URL yok; emin olunmayan resmî adres yazılmadı.

## 1. Bugünkü durum

- Üç ticari sağlayıcı da **gate-only** (kapı + `capability_unsupported`, analiz
  yok) **[repo-içi]** (`docs/TOOL-COVERAGE.md` satırları):
  - Hopper: `HopperProvider.ts` open/close + `hopperDurumu/hopperYolu`,
    `REA_HOPPER_PATH` + darwin/linux kapısı (exec yok) **[repo-içi]**.
  - IDA: `IdaProvider.ts` open/close + `idaYolu`, idat64/idat/ida64 `-h` yoklaması
    (yalnız exec-probe, analiz exec'i yok) **[repo-içi]**.
  - JEB: `JebProvider.ts` open/close + `jebDurumu/jebMcpUrl`,
    `REA_JEB_MCP_URL` doğrulaması (tasarım gereği spawn/fetch yok)
    **[repo-içi]**.
- Hopper hükmü verilmiş: "ARAŞTIRMA TAMAM: headless API YOK (resmî kaynaklı) →
  istek-hazırlama olarak dürüst; POSIX benzerlik kapısı eklendi" **[repo-içi]**
  (`docs/ROADMAP.md` E).
- Üst hüküm: "Ticari lisanslılar kapalı (Hopper/IDA/JEB)" **[repo-içi]**
  (`docs/ROADMAP-NEXT.md`).
- Katalog: 8 rea girdisinden 3'ü ticari (`hopper`, `ida`, `jeb` rea tarafında) **[repo-içi]**
  (`docs/DETECTION.md` §2, `docs/MCP-CONTRACTS.md`).

## 2. Resmî kaynak / API (satıcı bazında dürüst kapı)

- **Hopper: kapı YOK.** Headless sorgu API'si yok hükmü repo araştırmasıyla
  verilmiş **[repo-içi]**; bu dosya yeni kapı iddia etmiyor.
- **IDA: kapı YARIM.** Konsol çalıştırılabilir + toplu-betik (IDAPython) yolu
  görünüyor (idat probe repo-içi **[repo-içi]**; toplu-betik API ayrıntıları
  **[doğrulanmadı]**). Canlı köprü = lisans + toplu-iş hattı kurulumu gerektirir;
  temiz sorgu API'si doğrulanmadı **[doğrulanmadı]**.
- **JEB: kapı VAR (arayüzde).** JEB tarafı MCP URL'si sunar; repo `jebMcpUrl`
  doğrulaması yapar ama çağrıyı bilinçli olarak çağırana bırakır (caller-owned)
  **[repo-içi]** (`docs/TOOL-COVERAGE.md` JEB satırı). Sunucu tarafı iş =
  istemci-sahipli çağrıların düzenlenmesi, yeni protokol yok (değerlendirme).
- Ortak sınırlayıcı: üçü de lisanslıdır; lisans koşulları/fiyatları bu dosyada
  iddia edilmiyor **[doğrulanmadı]** (yazılmadı).

## 3. Gereken arayüz (öneri, kod yok)

- Mevcut gate-only desen korunur: `src/rea-domains/{hopper,ida,jeb}/`
  altında durum/yol/MCP-URL kapıları + eksikte `capability_unsupported`
  **[repo-içi]** (mevcut dosyalar + `docs/MCP-CONTRACTS.md`).
- Yeni iş yalnız IDA toplu-betik hattı için düşünülür (idb üretimi + döküm
  okuma, `rea_` araçları arkasında); Hopper için yeni arayüz yok (kapı yok),
  JEB için sunucu tarafı çağrı yok (caller-owned) — hepsi öneri.
- Fallback zinciri (`ghidra → hopper → ida`) zaten iyileştirme listesinde
  **[repo-içi]** (`docs/IMPROVEMENTS-DETAILED.md` §3): ticari kapı açılmadan
  zincir kapalı dalla çalışır.

## 4. Efor tahmini

- **L** (ay+) — Hopper satırı ROADMAP'te L **[repo-içi]**; IDA toplu-hattı +
  lisanslı CI doğrulaması (lisanslı ürün CI'da koşmaz) L'yi korur (değerlendirme).

## 5. Öneri

- **YAPMA** (yeni ticari köprü) — Gerekçe: Hopper'da kapı yok **[repo-içi]**,
  IDA'da temiz sorgu API'si doğrulanmadı **[doğrulanmadı]**, JEB'de sunucu
  tarafı iş yok (caller-owned) **[repo-içi]**; lisans maliyeti + efor L,
  P3'te bile getiri/ücret oranı düşük. Mevcut gate-only + handoff deseni
  korunur; ticari lisanslı ortamda ajan yine dürüst `capability_unsupported` +
  kurulum önerisi alır **[repo-içi]**.
