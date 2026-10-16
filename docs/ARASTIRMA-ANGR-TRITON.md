# ARAŞTIRMA — Sembolik yürütme (angr / Triton, WSL)

> Etiket anahtarı: her madde sonunda **[repo-içi]** (bu repoda dosyayla doğrulanabilir)
> ya da **[doğrulanmadı]** (repo + eğitim verisinden; resmî belgede teyit edilmedi).
> Uydurma API/URL yok; emin olunmayan resmî adres yazılmadı.

## 1. Bugünkü durum

- Sembolik yürütmeye dair mevcut kod/kapı yok **[repo-içi]**.
- ROADMAP F satırı: "Sembolik yürütme (angr/Triton, WSL) | Yok | VMProtect
  sınıfında tek gerçek yol | L | P3" **[repo-içi]** (`docs/ROADMAP.md` F).
- Yol gösterici not: "angr/Triton sembolik yürütme (VMProtect sınıfı için tek
  gerçek yol; WSL+conda)" **[repo-içi]** (`docs/ROADMAP-NEXT.md` §6).
- En yakın mevcut desen: Android dinamik reçetesi — 5 adımlı üretim +
  kuru-doğrulama, eksik araç işaretli (motor değil, reçete) **[repo-içi]**
  (`docs/ROADMAP.md` F).

## 2. Resmî kaynak / API

- angr: Python tabanlı, headless betik API'si sunan sembolik yürütme çerçevesidir
  (proje/durum/simülasyon-yöneticisi kavramları); pip/conda ile kurulur
  **[doğrulanmadı]**.
- Triton: dinamik sembolik yürütme kütüphanesidir (C++/Python bağlaması);
  enstrümantasyon altyapısı gerektirir **[doğrulanmadı]**.
- Her ikisi de bu repodan (Node/MCP, Windows-ağırlıklı) doğrudan değil, WSL
  üzerinden köprülenmek zorundadır (`wsl.exe` üretimi + WSL-içi conda ortamı)
  **[doğrulanmadı]** (köprü gereksinimi); WSL yolu repo için yeni değil:
  binwalk/unblob linux-only + handoff deseni mevcut **[repo-içi]**
  (`docs/TOOL-COVERAGE.md`).
- Bilinen gerçekler (sınırlayıcılar): durum-patlaması (state explosion) gerçek
  hedeflerde kapsamı sınırlar; lisans/dağıtım koşulları teyit edilmedi
  **[doğrulanmadı]**.
- Sonuç: kapı **VAR** (her ikisi de headless betiklenebilir) ama köprü
  (WSL+conda) ve ölçek sınırlarıyla **[doğrulanmadı]**.

## 3. Gereken arayüz (öneri, kod yok)

- Aşama 1 (ucuz, dürüst): `src/rea-domains/` altında yeni alan (örn. `symbolic/`),
  Hopper/IDA/JEB deseninde kapı-sağlayıcı: WSL + conda-ortamı yoklaması, eksikte
  `capability_unsupported` + reçete/handoff (Android dinamik reçetesi gibi)
  **[repo-içi]** (desenler: `docs/DETECTION.md` §5, `docs/ROADMAP.md` F).
- Aşama 2 (pahalı): gerçek motor köprüsü — WSL'ye iş gönderme, iz/state
  serileştirme, timeout + iptal (job modeli gibi) **[repo-içi]** (job deseni
  `docs/ROADMAP.md` B).
- Yeni provider `rea_` öneki + çakışma kuralına uyar (`qualifyReaTool`,
  `assertNoCollision`) **[repo-içi]** (`docs/MCP-CONTRACTS.md`).

## 4. Efor tahmini

- **L** (ay+) — ROADMAP zaten L diyor **[repo-içi]**; Aşama 1 (reçete+kapı) tek
  başına S/M olabilir, tam motor L (değerlendirme).

## 5. Öneri

- **BEKLE** (Aşama 1 reçetesi P3'te ilk iş) — Gerekçe: kapı teknik olarak açık
  **[doğrulanmadı]** ama WSL+conda zinciri kurulum yükü + durum-patlaması,
  dar hedeflerde değer; önce reçete/handoff (araç yoksa dürüst dal — IL2CPP/Go/
  Flutter deseni **[repo-içi]**), motoru kanıtlanmış talepten sonra yap.
