# ROADMAP — ReaPlus yol haritası

> Durum: v0.7.4 + yayımlanmamış (Unreleased) entegrasyon tabanı. Sürüm artışı yoktur. Bu belge `ROADMAP-NEXT.md`'nin yerini alır; oradaki
> orkestrasyon (`rea_investigate`) ve typedef maddeleri gerçekleşti, kalanlar buraya taşındı
> ve 2026-10-12 incelemesinin bulgularıyla genişletildi.
>
> **Ölçütler:** Etki = kullanıcı/ajan değerine katkı · Efor = S (günler) / M (1-2 hafta) / L (ay+)
> · Öncelik = P0 (sıradaki sürüm) → P3 (uzun vade).

## Unreleased tabanıyla kapananlar (özet)

- MCP yüzeyi: 171 araç + 2 resource + 3 prompt; üretilmiş tam referans [`TOOLS.md`](TOOLS.md).
- `REA_TOOLSETS` profilleri: `all` 171 (varsayılan), `minimal` 8, `static` 98, `android` 27, `dotnet` 20, `web` 26, `debug` 50; virgüllü birleşim, bilinmeyen profil açılış hatası.
- `REA_WORKSPACE_ROOT`: `rea_*` + conduit yolları + kullanıcıya görünür türev yazmalar kök içinde; operatör temp/cache yüzeyleri bilinçli istisna.
- Tokensiz HTTP: 44 salt-okunur araçlık allowlist (toolset ile kesişim) + `REA_AUDIT_LOG` (argümansız JSONL) + `REA_HTTP_RATE_LIMIT_PER_MIN` (varsayılan 120) ve `REA_HTTP_MAX_CONCURRENT` (varsayılan 16).
- Kısmi tip tabanı: 147 `outputSchema`, 169 annotations; şema kapsamı 171'in tamamı değildir (aşağıda açık kalan kısım işaretli).
- Async job pilotu: `REA_ASYNC_JOBS=1` ile 5 job aracı (176 yüzey); kuyruk tavanı 2, whitelist yalnız `rea_process_run`, kayıtlar süreç-içi.
- Yayın hazırlığı: Registry adı `io.github.Alyhnte/rea-plus` + `mcpName` hazır, publish workflow'u manuel/dry-run varsayılanlı. **npm/Registry yayını yapılmadı** — desteklenen kurulum `npx github` ve GHCR olarak kalır.
- Frida agent exception ve jadx ayrıştırma kod tabanı geldi; **Frida canlı VM onayı ve DEX golden APK kabul testi açık kapı olarak durur** (aşağıda kapatılmadı).

## 0.7.2 + 0.7.3 ile kapananlar (özet)

- Kırık `npm start`/`npm test`, sürüm uyumsuzluğu, dist'e kopyalanmayan runtime asset'leri düzeltildi.
- Hata zarfı (`isError`), adres enjeksiyonu kapısı, sahte `ok` dönen araçlar, Frida timeout/yarım oturum, checkpoint çapraz yazımı düzeltildi.
- Varsayılan test kümesi yazar makinesi dışında da yeşil (taşınabilir fixture'lar, dürüst araç kapıları, kişisel yol sıfır); CI Ubuntu Node 20+22 yeşil.
- Kurulum: `prepare` ile git kurulumu, tek-tık Cursor/VS Code bağlantıları, Dockerfile + GHCR workflow'u, istemci config örnekleri.

## A) Dağıtım ve kurulum

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| ✅ npm'e yayın (`rea-plus`) | KAPANDI (v0.8.0): `rea-plus@0.8.0` registry'de, tüketici kurulumu doğrulandı (`npm install` + 171 araç); provenance/trusted publisher sonraki adım | Kurulum tek komut: `npx -y rea-plus` | S | — |
| ✅ MCP Registry kaydı (`mcp-publisher`) | KAPANDI (v0.8.0): `io.github.Alyhnte/rea-plus` registry'de yayında (GHA + OIDC, tag/manuel tetikleme); `publish-registry.yml` korur | Resmi katalogda keşfedilebilirlik | S | — |
| ✅ GHCR imajını ilk release ile basma | KAPANDI (v0.7.4): `ghcr.io/alyhnte/reaplus` için `0.7.4` ve `latest` etiketleri yayımlandı ve anonim çekilebilirliği doğrulandı | Docker kullanıcılarına sıfır kurulum | S | — |
| `rea-plus-cli setup` sihirbazı | Config dosyaları elle kopyalanıyor | İstemciyi (Cursor/Claude/VS Code/Codex) algılayıp config'e yazar; en büyük sürtünme gider | M | P1 |
| `doctor --fix` | doctor yalnız raporluyor | Eksik araç için onaylı kurulum komutu önerir/çalıştırır (winget/brew/apt) | M | P1 |
| Tek dosya Windows exe (Node SEA) | Node kurulu olmayan makinede çalışmıyor | Node'suz dağıtım; release asset'i olarak | M | P2 |
| winget/scoop/homebrew manifesti | Yok | Paket yöneticisiyle keşif ve güncelleme | S | P2 |
|İmzalı release + SBOM | Release'ler imzasız | Tedarik zinciri güveni (özellikle güvenlik aracı için) | S | P2 |

## B) MCP protokolü ve ajan deneyimi

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| ✅ Toolset profilleri (`REA_TOOLSETS=static,debug`) | KAPANDI (Unreleased): `all` 171, `minimal` 8, `static` 98, `android` 27, `dotnet` 20, `web` 26, `debug` 50; virgüllü birleşim, bilinmeyen profil açılış hatası, resources/prompts filtresiz | Araç listesi bağlamı küçülür, isabet artar | S | — |
| ✅ Resources | KAPANDI (Unreleased): 2 statik salt-okunur resource (`rea-plus://server-info`, `rea-plus://capabilities-safety`); keyfi dosya/env açılmaz, subscribe yok | Sunucu kimliği + güvenlik kuralları URI ile okunur | M | — |
| ✅ Prompts | KAPANDI (Unreleased): 3 yan etkisiz prompt (`packer-triage`, `dotnet-malware-triage`, `android-triage`); prompt araç çalıştırmaz, yalnız sıralı akış metni döner | Hazır triage akışları tek seçimde | S | — |
| ◐ `outputSchema` + `structuredContent` | KISMEN KAPANDI (Unreleased taban): 147 araç `outputSchema` taşıyor, düz nesne sonuçlarda `structuredContent` metin JSON'uyla aynı değeri taşır; kalan araçlar şemasız — araç başına durum [`TOOLS.md`](TOOLS.md)'de | Kapsanan araçlarda tip güvenli tüketim; kapsamın 171'e genişlemesi açık iş | M | P1 (kalan kapsam) |
| ◐ Progress bildirimi + iptal | PİLOT KAPANDI (Unreleased): `rea_process_run` paced progress gönderir ve `notifications/cancelled` süreç ağacını öldürür; senkron handler'lar ve uzun motor işleri hâlâ kapsam dışı | Pilot araçta ajan ilerlemeyi görür, vazgeçebilir; genelleme açık iş | M | P1 (genişleme) |
| ◐ Tool annotation'ları | KISMEN KAPANDI (Unreleased taban): 169 araç annotations taşıyor; yalnız iki kapı aracı tahminî sınıflandırma almıyor | Kapsanan araçlarda `destructiveHint`/`readOnlyHint` ile istemci onay UX'i düzelir | S | P1 (kalan kapsam) |
| ◐ Async job modeli (başlat → poll) | PİLOT KAPANDI (Unreleased): `REA_ASYNC_JOBS=1` ile `rea_job_start/status/result/cancel/list`; en fazla 2 eşzamanlı, süreç-içi kayıt (en fazla 50 terminal kayıt), iptal süreç ağacını öldürür; whitelist bugün yalnız `rea_process_run` — diğer araçların eklenmesi ve kalıcılık açık iş | Uzun pilot işler çağrıyı kilitlemeden poll edilir; whitelist genişlemesi açık iş | M | P2 (genişleme) |
| ◐ Roots desteği | PİLOT (Unreleased): `REA_ROOTS=1` + legacy stdio'da istemci kökleri çekilir ve `REA_WORKSPACE_ROOT` yalnız daraltılabilir; modern protokol MRTR akışı ayrı iş, sahte başarı yok | Legacy istemcide çalışma alanı otomatik daralır | S | P2 (modern MRTR) |

## C) Güvenlik

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| ✅ Çalışma kökü kısıtı (`REA_WORKSPACE_ROOT`) | KAPANDI (Unreleased): `rea_*` yolları + conduit `open_target`/`debug_open` + türev yazmalar (`.unpacked`/`.extracted`/HAR) realpath ile kök içinde; operatör temp/cache yüzeyleri (browser artifacts, Ghidra tmp, hopper tmp isteği, apktool framework cache) bilinçli istisna | Prompt-injection ile rastgele dosya okuma/yazma yüzeyi kapanır | M | — |
| ✅ Token'sız HTTP'de salt-okunur kip | KAPANDI (Unreleased): token yokken HTTP yalnız 44 araçlık, yol almayan allowlist'i kaydeder; sonuç `REA_TOOLSETS` ile kesişimdir, liste dışı/yeni araç görünmez | Yanlışlıkla açık bırakılan port zararsızlaşır | S | — |
| ✅ Audit log (JSONL) | KAPANDI (Unreleased): `REA_AUDIT_LOG`, iki transportta da satır başına yalnız `ts`/`transport`/`tool`/`durationMs`/`isError`; argüman/token/yol/içerik yazılmaz, yazma hatası sunucuyu çökertmez | Olay incelemesi ve kurumsal kabul | S | — |
| ◐ Rate limit + eşzamanlı istek tavanı | KISMEN KAPANDI (Unreleased): `REA_HTTP_RATE_LIMIT_PER_MIN` (varsayılan 120/IP/dk) + `REA_HTTP_MAX_CONCURRENT` (varsayılan 16), aşımda `429`, geçersiz değer açılış hatası. Oturum registry TTL'i hâlâ yok | HTTP kaynak tüketimi/DoS dayanımı geldi; oturum TTL'i açık iş | S | P2 (TTL) |
| Sandbox reçetesi (VM profili dokümanı) | "VM'de çalıştır" demekle kalınıyor | Hazır izole ortam tarifi (ağsız snapshot'lı VM) | S | P2 |

## D) Debugger motorları

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| Oturum başına tam serileştirme kuyruğu | Üzerine-yazma koruması var, komut kuyruğu yok | Eşzamanlı çağrılarda yarış tamamen biter | M | P1 |
| ◐ Frida ajanında gerçek exception raporlama | KOD TABANI GELDİ, CANLI KAPI AÇIK: slot dışı exception artık `false` ile gerçek akışa bırakılıyor ve canlı olmayan testle kilitli; Frida canlı VM onayı tamamlanmadı, madde kapanmış sayılmaz | Gerçek çökmeler görünür olur (doğruluk) | S | **P0** (canlı VM) |
| Frida attach/createScript/load timeout'ları | RPC'ler sınırlı, kurulum adımları değil | Kötü hedefte asılı kalma biter | S | P1 |
| cdb: async pause + gerçek push olayları | Pause senkron PowerShell ile event loop'u blokluyor; `onPush` ölü | Çok oturumlu kullanım rahatlar | M | P1 |
| x64dbg eklenti oto-provizyonu | Bridge dosyaları elle bekleniyor | İlk kurulum sürtünmesi kalkar | M | P1 |
| LLDB motoru (Linux/macOS) | Canlı debug yalnız Windows | Platform kapsamı genişler | L | P3 |
| WinDbg TTD kayıtlarını okuma | Yok | Zaman yolculuğu analizi | L | P3 |

## E) Statik domainler (derinlik ve dürüstlük)

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| ◐ jadx gerçek manifest/sınıf alanları | KOD + CANLI KABUL (v0.8.0 sonrası): `java -jar` asılması `-cp jadx.cli.JadxCLI` ile düzeltildi; gerçek APK (`com.zb.test`, 7 izin, 5 sınıf) ile manifest/classes/decompile birebir doğrulandı. Kalıcı golden korpus (repo içi fixture + hash) açık iş | Android çıktısı güvenilir olur | S | P1 (kalıcı korpus) |
| Browser scenario'yu gerçekten çalıştırma | Adımlar yalnız JSON'a yazılıyor | Adı gibi çalışır; yoksa araca dürüst isim | M | P1 |
| `rea_ida_flirt` gerçek FLIRT veya yeniden adlandırma | String taraması FLIRT diye sunuluyor | Güven (inceleme bulgusu) | S | P1 |
| WasmInfo import/LEB düzeltmeleri | Import gövdesi tek-LEB sanılıyor; taşmada negatif boyut | Sessiz yanlış sonuç biter | S | P1 |
| DWARF v5 + abbrev_offset + çoklu FORM | v4 varsayımı, tek form; çoğu ELF'te boş özet | Linux binary'lerinde gerçek özet | M | P1 |
| PE okuyucu tekilleştirme + `SizeOfOptionalHeader` | Sabit 224/240 offset; PeReader/PdbReader kopya kod | Yanlış import adları biter, bakım kolaylaşır | S | P2 |
| Sembol/PDB çekme (Microsoft symbol server) | PDB yolu okunuyor, indirilmiyor | İsimlendirilmiş analiz kalitesi sıçrar | M | P1 |
| Mach-O / iOS (otool, class-dump köprüsü) | Kapsam dışı | Apple hedefleri açılır | M | P2 |
| Unity IL2CPP (Il2CppDumper), GoReSym, Flutter/Dart AOT (blutter) | Sinyal/giriş var, derinlik yok | Oyun/uygulama RE'sinde büyük pazar | L | P2 |
| Binary diff (sürümden sürüme) | Yol haritasında vaadi var, araç yok | Yama analizi iş akışı | M | P2 |
| Hopper gerçek köprü (headless API araştırması) | Yalnız istek JSON'u yazılıyor | Lisanslı kullanıcıda gerçek veri | L | P3 |

## F) Davranış ve dinamik analiz

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| Syscall numara matrisi + CreateFileW/RegSet profilleri | API tracer var, syscall katmanı yok | Davranış raporu derinleşir | S | P1 |
| Toplama dahil davranış koşusu (spawn+trace+capture tek çağrı) | `rea_behavior_full` hazır olay listelerini birleştiriyor; olayları kendisi toplamıyor | Ajan 1 çağrıda uçtan uca profil alır | M | P1 |
| PCAP analizi (tshark) + TLS keylog çözme | HAR var; şifreli trafik kapalı | C2 trafiği okunur hale gelir | M | P2 |
| Android dinamik reçete (emülatör + frida-server + pinning) | USB/gadget attach var, reçete yok | Mobil dinamik analiz başlanabilir olur | M | P2 |
| Sembolik yürütme (angr/Triton, WSL) | Yok | VMProtect sınıfında tek gerçek yol | L | P3 |
| Fuzzing harness (AFL++ WSL) | Yok | Hedef parser'larda crash bulma | L | P3 |

## G) Ölçek ve performans

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| Kalıcı worker + sonuç cache'ini canlıya bağlama | `probeCache` vb. facade modülleri ölü kod; her çağrı spawn | Repo taraması ve tekrar sorular hızlanır | M | P1 |
| Paralel repo tarama kuyruğu (4'lü) | Tek dosya akışı | CI entegrasyonu açılır (ROADMAP-NEXT'ten taşındı) | M | P2 |
| Şema bütçesini ölçüp zorlama (13KB iddiası) | Compact modüller ölü, bütçe ölçülmüyor | İddia gerçek olur; tools/list gecikmesi düşer | S | P2 |
| Büyük dosyada kısmi/streaming okuma | Tam dosya belleğe alınıyor (ör. CLR kontrolü) | GB'lık imajlarda OOM biter | M | P2 |

## H) Test ve kalite

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| Golden korpus (provider başına 5 gerçek binary + hash) | AÇIK: fixture'lar minimal (mini_branch/mini_pe); DEX golden APK kabul testi de bu kapının parçasıdır ve tamamlanmadı | Regresyon erken yakalanır | M | P1 |
| Canlı kulvar için self-hosted Windows runner | AÇIK: Frida/debug testleri CI'da koşmuyor; Frida canlı VM onayı bu kapıya bağlıdır ve tamamlanmadı | En riskli yüzey sürekli doğrulanır | M | P1 |
| Parser fuzz'ı (PE/ELF/WASM/DWARF) CI smoke | Yok | Sessiz yanlış/çökme sınıfları yakalanır | M | P2 |
| HTTP e2e'yi CI varsayılanına alma | e2e canlı kulvarda | Transport regresyonu görünür olur | S | P2 |
| Performans bütçeleri (tools/list, açılış) | Ölçüm yok | Yavaşlama sessizce birikmez | S | P3 |

## I) Dokümantasyon ve topluluk

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| ✅ Otomatik araç referansı (tools/list → docs) | KAPANDI (Unreleased): [`TOOLS.md`](TOOLS.md) derlenmiş sunucunun gerçek yüzeyinden üretiliyor (171 araç + 2 resource + 3 prompt, araç başına `outputSchema`/annotations durumu) | 171 aracın güncel kataloğu | S | — |
| Örnek oturumlar (asciinema/GIF) README'de | Görsel kanıt yok | İlk 10 saniyede ikna (yıldız dönüşümü) | S | P1 |
| GitHub Pages docs sitesi | docs/ dağınık (20+ dosya) | Aranabilir, linklenebilir doküman | M | P2 |
| Örnek prompt kütüphanesi | Yok | Kullanıcı ilk değeri dakikalar içinde alır | S | P2 |
| good-first-issue + CONTRIBUTING genişletme | Tek paragraf | Katkı hunisi açılır | S | P3 |

---

**Önerilen sıra (açık kalanlar):** npm + Registry yayını (dış kapı) → Frida canlı VM onayı → DEX golden APK kabulü →
golden korpus → canlı CI → kalan `outputSchema`/annotations kapsamı → progress/iptal → davranış profilleri.
Workspace kökü, toolset profilleri ve resources/prompts Unreleased tabanında kapandı; dağıtımı fiilen açan adım artık yalnız npm + Registry yayınıdır.

