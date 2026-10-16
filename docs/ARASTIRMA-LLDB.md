# ARAŞTIRMA — LLDB motoru (Linux/macOS canlı debug)

> Etiket anahtarı: her madde sonunda **[repo-içi]** (bu repoda dosyayla doğrulanabilir)
> ya da **[doğrulanmadı]** (repo + eğitim verisinden; resmî belgede teyit edilmedi).
> Uydurma API/URL yok; emin olunmayan resmî adres yazılmadı.

## 1. Bugünkü durum

- Canlı debug yalnız Windows: conduit motorları `src/conduit-core/engines/` altında
  `cdb.ts`, `x64dbg.ts`, `frida.ts` (+ `radare2.ts` statik) **[repo-içi]**.
- Oturum yönlendirici: `CONDUIT_ENGINES = { radare2, x64dbg, cdb, frida }` → `"conduit"`;
  geri kalan her şey `"rea-domains"` **[repo-içi]** (`docs/DETECTION.md` §4).
- ROADMAP D satırı: "LLDB motoru (Linux/macOS) | Canlı debug yalnız Windows |
  Platform kapsamı genişler | L | P3" **[repo-içi]** (`docs/ROADMAP.md` D).
- LLDB'ye dair mevcut kod/kapı yok (engines/ altında `lldb.ts` yok, `REA_LLDB_*`
  env yok) **[repo-içi]**.

## 2. Resmî kaynak / API

- LLDB, LLVM projesinin hata ayıklayıcısıdır; betiklenebilir bir SB API
  (`SBDebugger`, `SBTarget`, `SBProcess` ailesi) sunar ve Python modülü üzerinden
  headless sürülebilir **[doğrulanmadı]**.
- SB API'nin kararlı ve belgeli olması, bu başlığı Hopper'dan ayırır: Hopper'da
  headless API YOK hükmü verilmişti **[repo-içi]** (`docs/ROADMAP.md` E);
  LLDB'de kapı (betiklenebilir headless API) VAR görünüyor **[doğrulanmadı]**.
- Lisans/dağıtım koşulları (hangi LLVM sürümü, Python eşleşmesi, macOS imza
  gereksinimleri) teyit edilmedi **[doğrulanmadı]**.

## 3. Gereken arayüz (öneri, kod yok)

- `src/conduit-core/engines/lldb.ts` (yeni motor: spawn+oturum+olay, mevcut
  `cdb.ts`/`x64dbg.ts` ile aynı soyutlama) + `engines/registry.ts` kaydı +
  oturum yönlendiriciye conduit motoru olarak ekleme **[repo-içi]** (dosya adları
  mevcut yapıdan; içerik öneri).
- Kurulum kapısı: `doctor`/`prerequisites` yoklaması (LLDB + Python modülü) +
  eksikte `capability_unsupported`, Hopper/IDA/JEB desenindeki gibi **[repo-içi]**
  (desen `docs/DETECTION.md` §5, `docs/MCP-CONTRACTS.md`).
- Platform kapısı: yalnız Linux/macOS'ta etkin; Windows'ta kapalı dal
  (binwalk'un linux-only + handoff deseni gibi) **[repo-içi]** (desen
  `docs/TOOL-COVERAGE.md` binwalk satırı).

## 4. Efor tahmini

- **L** (ay+) — ROADMAP zaten L diyor **[repo-içi]**; yeni canlı motor =
  oturum + olay + timeout + serileştirme (cdb async pause işi M idi) **[repo-içi]**.

## 5. Öneri

- **BEKLE** — Gerekçe: teknik kapı açık görünüyor (headless betiklenebilir API
  var) **[doğrulanmadı]**, ama efor L ve P3'te doğru sırada; P0 (Frida canlı VM
  onayı) ve P2'ler (Pages deployu, şema bütçesi CI) önce gelir **[repo-içi]**
  (`docs/ROADMAP.md` "Önerilen sıra"). P3 açıldığında ilk prototip: salt-okunur
  `lldbDurumu` kapısı + `capability_unsupported`, analiz sonra.
