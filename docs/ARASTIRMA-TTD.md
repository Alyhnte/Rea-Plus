# ARAŞTIRMA — WinDbg TTD (Time Travel Debugging) kayıtlarını okuma

> Etiket anahtarı: her madde sonunda **[repo-içi]** (bu repoda dosyayla doğrulanabilir)
> ya da **[doğrulanmadı]** (repo + eğitim verisinden; resmî belgede teyit edilmedi).
> Uydurma API/URL yok; emin olunmayan resmî adres yazılmadı.

## 1. Bugünkü durum

- TTD'ye dair mevcut kod/kapı yok (engines/ altında TTD dosyası yok, TTD env yok) **[repo-içi]**.
- En yakın mevcut motor `cdb.ts`: konsol hata ayıklayıcıyı stdio üzerinden sürer,
  v0.10.0'da async pause + gerçek push olayları kapandı **[repo-içi]**
  (`docs/ROADMAP.md` D).
- ROADMAP D satırı: "WinDbg TTD kayıtlarını okuma | Yok | Zaman yolculuğu
  analizi | L | P3" **[repo-içi]** (`docs/ROADMAP.md` D).

## 2. Resmî kaynak / API

- TTD, WinDbg (Windows'a özel) ile hedefi kayda alıp geriye/ileriye sorgulamaya
  izin veren zaman-yolculuğu kaydıdır; kayıtlar WinDbg üzerinden oynatılır ve
  nesne-modeli/betik yüzeyinden sorgulanır **[doğrulanmadı]**.
- Temiz, kararlı, headless bir "kayıt-oku" API'si (cdb stdio karşılığı)
  doğrulanmadı; bilinen sorgu yolu WinDbg'in kendi komut/betik yüzeyinden
  geçiyor **[doğrulanmadı]**.
- Kayıt üretimi hedefi TTD altında çalıştırmayı gerektirir (ağır kayıtlar,
  büyük iz dosyaları) **[doğrulanmadı]**; bu, "hazır kayıt varsa oku" senaryosunu
  "kaydı da biz üretelim" senaryosundan ayırır.
- Sonuç: kapı **YARIM** — oynatma/sorgu WinDbg içinde mümkün görünüyor ama
  bağımsız headless okuma API'si yok hükmünde **[doğrulanmadı]**; Hopper
  (headless YOK → gate-only) desenine yakın **[repo-içi]**.

## 3. Gereken arayüz (öneri, kod yok)

- Aşama 1 (ucuz, dürüst): TTD iz dosyası verilirse WinDbg/cdb üzerinden
  oynat-sorgula; mevcut `cdb.ts` soyutlamasının arkasına TTD-replay dalı
  (öneri) **[repo-içi]** (motor `src/conduit-core/engines/cdb.ts`).
- Aşama 2 (pahalı): kayıt üretimi + iz indeksleme; ayrı motor dosyası gerekir
  (öneri).
- Her aşamada eksik bağlama = `capability_unsupported`, stub yok
  **[repo-içi]** (kural `docs/MCP-CONTRACTS.md`, desen `docs/DETECTION.md` §5).
- Windows-kilitli: Windows dışı platformda kapalı dal + handoff notu
  (binwalk linux-only deseni gibi) **[repo-içi]**.

## 4. Efor tahmini

- **L** (ay+) — ROADMAP zaten L diyor **[repo-içi]**; Aşama 1 tek başına M
  olabilir ama kayıt-format oynaklığı + Windows kilidi L'yi korur (değerlendirme).

## 5. Öneri

- **BEKLE** — Gerekçe: bağımsız headless okuma kapısı doğrulanmadı
  **[doğrulanmadı]**; Windows-kilitli, efor L, P3'te doğru sırada **[repo-içi]**.
  P3 açıldığında Aşama 1 prototipi (hazır iz + WinDbg replay sorgusu) denenir,
  kayıt-üretimi Aşama 2'ye bırakılır.
