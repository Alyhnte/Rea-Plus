# ROADMAP — ReaPlus yol haritası

> Durum: v0.10.1 yayında (npm + MCP Registry + CI yeşil). Bu belge ilk
> 2026-10-12 incelemesinin bulgularıyla doğmuş, her dalga sonunda gerçekleşenle
> senkronlanmıştır. v0.10.1 P1 kod maddelerini kapattı (ölü facade temizliği +
> golden DEX fixture); araç yüzeyi değişmedi. Sayılar derlenmiş sunucunun gerçek yüzeyindendir
> ([`TOOLS.md`](TOOLS.md) üretim çıktısı).
>
> **Ölçütler:** Etki = kullanıcı/ajan değerine katkı · Efor = S (günler) / M (1-2 hafta) / L (ay+)
> · Öncelik = P0 (dış kapı) → P3 (uzun vade).

## v0.10.0 tabanıyla kapananlar (özet)

- MCP yüzeyi: 191 araç + 2 resource + 3 prompt; üretilmiş tam referans [`TOOLS.md`](TOOLS.md).
- `REA_TOOLSETS` profilleri: `all` 191 (varsayılan), `minimal` 8, `static` 98, `android` 27, `dotnet` 20, `web` 26, `debug` 50; virgüllü birleşim, bilinmeyen profil açılış hatası. Yeni araç yalnız `all`'da (fail-closed).
- `REA_WORKSPACE_ROOT`: `rea_*` + conduit yolları + kullanıcıya görünür türev yazmalar kök içinde; operatör temp/cache yüzeyleri bilinçli istisna. Roots (legacy + modern MRTR) yalnız daraltır.
- Tokensiz HTTP: 44 salt-okunur araçlık allowlist (toolset ile kesişim) + `REA_AUDIT_LOG` (argümansız JSONL) + rate limit (120/dk) + eşzamanlılık tavanı (16) + oturum TTL (30dk).
- Tip tabanı: 187 `outputSchema`, 191 annotations (sıfır işaretsiz; 4 araç kalıcı şemasız).
- Async job (5 araç, 177→192 yüzey) + oturum FIFO kuyruğu + tam serileştirme + worker cache + progress genelleme.
- Motor sağlamlığı: Frida kurulum timeout'ları, cdb async pause+push, x64dbg provizyonu, jadx `-cp` düzeltmesi + canlı APK kabulü.
- Statik dürüstlük: browser scenario, FLIRT, Wasm/DWARF, PE/PDB, Mach-O, IL2CPP/Go/Flutter, binary diff, PCAP/TLS, Android reçete.
- Kurulum: `setup` sihirbazı + `doctor --fix`; manifestler (winget/scoop/brew) + SBOM + sandbox reçetesi; SEA fizibilitesi.
- Kalite: golden korpus manifesti, fuzz smoke (CI), e2e varsayılan, perf + şema bütçeleri, docs sitesi + prompt kütüphanesi.
- Yayın: `rea-plus@0.10.0` npm'de, `io.github.Alyhnte/rea-plus` MCP Registry'de, tag zinciri (npm→bekle→registry) tek tetikleyicili. **Frida canlı VM onayı açık kapı olarak durur** (aşağıda kapatılmadı).

## 0.7.2 + 0.7.3 ile kapananlar (özet)

- Kırık `npm start`/`npm test`, sürüm uyumsuzluğu, dist'e kopyalanmayan runtime asset'leri düzeltildi.
- Hata zarfı (`isError`), adres enjeksiyonu kapısı, sahte `ok` dönen araçlar, Frida timeout/yarım oturum, checkpoint çapraz yazımı düzeltildi.
- Varsayılan test kümesi yazar makinesi dışında da yeşil (taşınabilir fixture'lar, dürüst araç kapıları, kişisel yol sıfır); CI Ubuntu Node 20+22 yeşil.
- Kurulum: `prepare` ile git kurulumu, tek-tık Cursor/VS Code bağlantıları, Dockerfile + GHCR workflow'u, istemci config örnekleri.

## A) Dağıtım ve kurulum

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| ✅ npm'e yayın (`rea-plus`) | KAPANDI (v0.8.0, zincir v0.9.0+): `rea-plus@0.10.0` registry'de; tag zinciri (npm→bekle→registry, tek tetikleyici) | Kurulum tek komut: `npx -y rea-plus` | S | — |
| ✅ MCP Registry kaydı (`mcp-publisher`) | KAPANDI (v0.8.0, zincir v0.9.0+): `io.github.Alyhnte/rea-plus` yayında | Resmi katalogda keşfedilebilirlik | S | — |
| ✅ GHCR imajını ilk release ile basma | KAPANDI (v0.7.4): `ghcr.io/alyhnte/reaplus` için etiketler yayımlandı ve anonim çekilebilirliği doğrulandı | Docker kullanıcılarına sıfır kurulum | S | — |
| ✅ `rea-plus-cli setup` sihirbazı | KAPANDI (v0.10.0): istemci algısı + onaylı yazma + `.bak` + dry-run; yalnız geçici HOME'da testli | En büyük sürtünme gider | M | — |
| ✅ `doctor --fix` | KAPANDI (v0.10.0): onay kapılı kurulum önerisi (winget/brew/apt); onaysız çalıştırmaz | Eksik araçta tek komut | M | — |
| ◐ Tek dosya Windows exe (Node SEA) | FİZİBİLİTE TAMAM (v0.10.0): hello-world SEA çalıştı; tam uygulama 3 engelli (129MB Frida binding, dinamik playwright, imzalama) — alternatif: portable node bundle | Node'suz dağıtım; release asset'i olarak | M | P2 |
| ✅ winget/scoop/homebrew manifesti | KAPANDI (v0.10.0): üç manifest sürümlü + hash'li; mağaza gönderimi yapılmadı | Paket yöneticisiyle keşif | S | — |
| ◐ İmzalı release + SBOM | YARIM (v0.10.0): SBOM (CycloneDX) üretildi; imza + provenance/Trusted Publisher yok | Tedarik zinciri güveni | S | P2 |

## B) MCP protokolü ve ajan deneyimi

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| ✅ Toolset profilleri (`REA_TOOLSETS=static,debug`) | KAPANDI: `all` 191, `minimal` 8, `static` 98, `android` 27, `dotnet` 20, `web` 26, `debug` 50; virgüllü birleşim, bilinmeyen profil açılış hatası, resources/prompts filtresiz | Araç listesi bağlamı küçülür, isabet artar | S | — |
| ✅ Resources | KAPANDI: 2 statik salt-okunur resource (`rea-plus://server-info`, `rea-plus://capabilities-safety`); keyfi dosya/env açılmaz, subscribe yok | Sunucu kimliği + güvenlik kuralları URI ile okunur | M | — |
| ✅ Prompts | KAPANDI: 3 yan etkisiz prompt (`packer-triage`, `dotnet-malware-triage`, `android-triage`); prompt araç çalıştırmaz, yalnız sıralı akış metni döner | Hazır triage akışları tek seçimde | S | — |
| ✅ `outputSchema` + `structuredContent` | KAPANDI (v0.10.0): 187 araç `outputSchema` (4 kalıcı şemasız); düz nesne sonuçlarda `structuredContent` metin JSON'uyla aynı — araç başına durum [`TOOLS.md`](TOOLS.md)'de | Tip güvenli tüketim | M | — |
| ✅ Progress bildirimi + iptal | KAPANDI (v0.10.0): stage yardımcıları + 3 staged araç; senkron handler'lar kapsam dışı (belgeli) | Ajan ilerlemeyi görür, vazgeçebilir | M | — |
| ✅ Tool annotation'ları | KAPANDI (v0.10.0): 191 annotations (sıfır işaretsiz) | İstemci onay UX'i | S | — |
| ✅ Async job modeli (başlat → poll) | KAPANDI (v0.10.0): 5 job aracı (192 yüzey); whitelist 3'lü; iptal süreç ağacını öldürür | Uzun işler kilitlemeden poll edilir | M | — |
| ✅ Roots desteği | KAPANDI (v0.10.0): legacy + modern MRTR; workspace hiçbir yolda genişlemez | Çalışma alanı otomatik daralır | S | — |
| ✅ Oturum kuyruğu + serileştirme | KAPANDI (v0.10.0): FIFO-32 + `REA_SESSION_SERIALIZE` (zaman-damga kanıtlı), timeout+iptal korunur | Yarışlar biter | M | — |

## C) Güvenlik

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| ✅ Çalışma kökü kısıtı (`REA_WORKSPACE_ROOT`) | KAPANDI: `rea_*` + conduit yolları + türev yazmalar realpath ile kök içinde; operatör temp/cache istisna | Prompt-injection yüzeyi kapanır | M | — |
| ✅ Token'sız HTTP'de salt-okunur kip | KAPANDI: token yokken 44 araçlık allowlist; toolset ile kesişim | Açık port zararsızlaşır | S | — |
| ✅ Audit log (JSONL) | KAPANDI: satır başına `ts`/`transport`/`tool`/`durationMs`/`isError`; sır yazılmaz | Olay incelemesi | S | — |
| ✅ Rate limit + eşzamanlılık + oturum TTL | KAPANDI: 120/dk + 16 eşzamanlı + 30dk TTL; geçersiz değer açılış hatası | Dayanım + hijyen | S | — |
| ✅ Sandbox reçetesi (VM profili dokümanı) | KAPANDI (v0.10.0): `docs/SANDBOX.md` (Hyper-V + VirtualBox, snapshot + geri yükleme) | Hazır izole ortam | S | — |

## D) Debugger motorları

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| ✅ Oturum kuyruğu + serileştirme | KAPANDI (v0.10.0): FIFO-32 + tam seri modu; timeout+iptal korunur | Yarışlar biter | M | — |
| ◐ Frida ajanında gerçek exception raporlama | KOD + KİLİT TAMAM, CANLI KAPI AÇIK: slot dışı `false`, kurulum timeout'ları; Frida canlı VM onayı yok | Gerçek çökmeler görünür olur | S | **P0** (canlı VM) |
| ✅ Frida attach/createScript/load timeout'ları | KAPANDI (v0.10.0): 15/10/15sn + env override + temizlikli `engine_timeout` | Asılma biter | S | — |
| ✅ cdb: async pause + gerçek push olayları | KAPANDI (v0.10.0): event loop bloklanmaz, aboneye push | Çok oturumlu rahatlık | M | — |
| ✅ x64dbg eklenti oto-provizyonu | KAPANDI (v0.10.0): doctor + setup, idempotent + hash doğrulamalı | Kurulum sürtünmesi kalkar | M | — |
| LLDB motoru (Linux/macOS) | Canlı debug yalnız Windows | Platform kapsamı genişler | L | P3 |
| WinDbg TTD kayıtlarını okuma | Yok | Zaman yolculuğu analizi | L | P3 |

## E) Statik domainler (derinlik ve dürüstlük)

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| ✅ jadx gerçek manifest/sınıf alanları | KAPANDI (v0.10.0): `-cp` düzeltmesi + gerçek APK birebir + POSIX keşif taramalı | Android çıktısı güvenilir | S | — |
| ✅ Browser scenario | KAPANDI (v0.10.0): adımlar gerçekten koşar + kanıtlı + dry-run | Adı gibi çalışır | M | — |
| ✅ FLIRT dürüstlüğü | KAPANDI (v0.10.0): `string-heuristic` + güven skoru | Güven | S | — |
| ✅ Wasm/DWARF | KAPANDI (v0.10.0): çok-bayt LEB + v5/abbrev_offset | Gerçek özet | S/M | — |
| ✅ PE + PDB | KAPANDI (v0.10.0): gerçek header + indirme + önbellek | Doğru adlar + sembol | S/M | — |
| ✅ Mach-O/iOS | KAPANDI (v0.10.0): saf TS + fat + ObjC listesi | Apple hedefleri | M | — |
| ✅ IL2CPP/Go/Flutter | KAPANDI (v0.10.0): sayım + eşleme + snapshot; araç yoksa dürüst dal | RE derinliği | L | — |
| ✅ Binary diff | KAPANDI (v0.10.0): eklenen/çıkarılan/değişen + streaming | Yama analizi | M | — |
| ◐ Hopper gerçek köprü | ARAŞTIRMA TAMAM: headless API YOK (resmi kaynaklı) → istek-hazırlama olarak dürüst; POSIX benzerlik kapısı eklendi | Lisanslıda gerçek veri | L | P3 |

## F) Davranış ve dinamik analiz

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| ✅ Syscall matrisi + CreateFileW/RegSet | KAPANDI (v0.10.0): ntdll numara eşleme + erişim profilleri | Derin rapor | S | — |
| ✅ Tek-çağrı davranış koşusu | KAPANDI (v0.10.0): spawn+trace+capture, zorunlu timeout, crash dürüstlüğü | Tek çağrıda profil | M | — |
| ✅ PCAP + TLS keylog | KAPANDI (v0.10.0): akış birleştirme + keylog çözme; çözülemeyen `sifreli` | C2 trafiği okunur | M | — |
| ✅ Android dinamik reçetesi | KAPANDI (v0.10.0): 5 adımlı üretim + kuru-doğrulama; eksik araç işaretli | Mobil başlangıç | M | — |
| Sembolik yürütme (angr/Triton, WSL) | Yok | VMProtect sınıfında tek gerçek yol | L | P3 |
| Fuzzing harness (AFL++ WSL) | Yok | Hedef parser'larda crash bulma | L | P3 |

## G) Ölçek ve performans

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| ✅ Worker cache canlı bağlama | KAPANDI (v0.10.0): reposcan yolu sayaç-kanıtlı | Hızlı tekrar | M | — |
| ✅ Ölü facade temizliği (`probeCache`/`parallelProbe`) | KAPANDI (v0.10.1): davranış `workerCache`'e taşındı (`ResultCache` TTL + `runProbes`); `probe.test.mjs` `worker-cache.test.mjs` altına taşındı | Ölü kod kalktı | S | — |
| ✅ Paralel tarama (4'lü havuz) | KAPANDI (v0.10.0): sıralı birleştirme + iptal + hata izolasyonu | CI entegrasyonu | M | — |
| ✅ Şema bütçesi | KAPANDI (v0.10.0): ölçülü eşikler (200KB/110KB/600B) | Şişme biter | S | — |
| Şema bütçesi CI zorlaması | Test var, CI adımı yok | Bütçe CI'da kırar | S | P2 |
| ✅ Streaming okuma | KAPANDI (v0.10.0): 64KB tampon + iptalde durma | OOM biter | M | — |

## H) Test ve kalite

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| ✅ Golden korpus manifesti | KAPANDI (v0.10.1): `tests/corpus/mini.dex` (sentetik minimal DEX v035, `scripts/dex-fixture-uret.mjs`) + `dex-golden` 7 test + HASHES girdisi | Regresyon erken yakalanır | M | — |
| Self-hosted Windows runner | Frida/debug testleri CI'da koşmuyor | En riskli yüzey sürekli doğrulanır | M | P0 |
| ✅ Parser fuzz CI smoke | KAPANDI (v0.10.0): deterministik mutasyon, crash/hang=0 | Sessiz sınıflar yakalanır | M | — |
| ✅ HTTP e2e varsayılan kümede | KAPANDI (v0.10.0): LIVE'dan çıkarıldı, flake yok | Transport regresyonu görünür | S | — |
| ✅ Performans bütçeleri | KAPANDI (v0.10.0): ölçülü eşikler, medyan yöntemi | Birikme biter | S | — |

## I) Dokümantasyon ve topluluk

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| ✅ Otomatik araç referansı | KAPANDI (v0.10.0): [`TOOLS.md`](TOOLS.md) gerçek yüzeyden (191 araç + 2 resource + 3 prompt) | Güncel katalog | S | — |
| Örnek oturumlar (asciinema/GIF) README'de | Görsel kanıt yok | İlk 10 saniyede ikna (yıldız dönüşümü) | S | P1 |
| ◐ Docs sitesi | ÜRETİLDİ (v0.10.0): 7 statik sayfa + 0 kırık link | Aranabilir doküman | M | P2 |
| Pages deployu (site hazır, yayın yok) | `docs/site/` üretildi ama GitHub Pages'e bağlanmadı | Tek URL'de doküman | S | P2 |
| ✅ Prompt kütüphanesi | KAPANDI (v0.10.0): `docs/PROMPTS.md` (10 prompt, örnek çağrılı) | İlk değer dakikalar içinde | S | — |
| good-first-issue + CONTRIBUTING genişletme | Tek paragraf | Katkı hunisi açılır | S | P3 |

---

**Önerilen sıra (açık kalanlar):** Frida canlı VM → runner → trusted publisher → örnek oturumlar → Pages deployu → P3 araştırma.
v0.10.1'de kapananlar: ölü facade temizliği + golden DEX korpusu (yukarıda ✅ işaretliler); v0.10.0'da kapananlar: I/J/K dalgalarının tamamı.

