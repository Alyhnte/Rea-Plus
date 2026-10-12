# ROADMAP — ReaPlus yol haritası

> Durum: v0.7.3 (2026-10-12). Bu belge `ROADMAP-NEXT.md`'nin yerini alır; oradaki
> orkestrasyon (`rea_investigate`) ve typedef maddeleri gerçekleşti, kalanlar buraya taşındı
> ve 2026-10-12 incelemesinin bulgularıyla genişletildi.
>
> **Ölçütler:** Etki = kullanıcı/ajan değerine katkı · Efor = S (günler) / M (1-2 hafta) / L (ay+)
> · Öncelik = P0 (sıradaki sürüm) → P3 (uzun vade).

## 0.7.2 + 0.7.3 ile kapananlar (özet)

- Kırık `npm start`/`npm test`, sürüm uyumsuzluğu, dist'e kopyalanmayan runtime asset'leri düzeltildi.
- Hata zarfı (`isError`), adres enjeksiyonu kapısı, sahte `ok` dönen araçlar, Frida timeout/yarım oturum, checkpoint çapraz yazımı düzeltildi.
- Varsayılan test kümesi yazar makinesi dışında da yeşil (taşınabilir fixture'lar, dürüst araç kapıları, kişisel yol sıfır); CI Ubuntu Node 20+22 yeşil.
- Kurulum: `prepare` ile git kurulumu, tek-tık Cursor/VS Code bağlantıları, Dockerfile + GHCR workflow'u, istemci config örnekleri.

## A) Dağıtım ve kurulum

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| npm'e yayın (`rea-plus`) + provenance | Paket hazır (`npm pack` doğrulandı), registry'de yok; herkes GitHub formuyla kuruyor | Kurulum tek komuta iner: `npx -y rea-plus` | S | **P0** |
| MCP Registry kaydı (`mcp-publisher`) | `server.json` hazır ve sürümü senkron, kayıt yapılmadı | Resmi katalogda keşfedilebilirlik | S | **P0** |
| GHCR imajını ilk release ile basma | Dockerfile + workflow hazır ve build doğrulandı; imaj ilk tag'de çıkar | Docker kullanıcılarına sıfır kurulum | S | **P0** |
| `rea-plus-cli setup` sihirbazı | Config dosyaları elle kopyalanıyor | İstemciyi (Cursor/Claude/VS Code/Codex) algılayıp config'e yazar; en büyük sürtünme gider | M | P1 |
| `doctor --fix` | doctor yalnız raporluyor | Eksik araç için onaylı kurulum komutu önerir/çalıştırır (winget/brew/apt) | M | P1 |
| Tek dosya Windows exe (Node SEA) | Node kurulu olmayan makinede çalışmıyor | Node'suz dağıtım; release asset'i olarak | M | P2 |
| winget/scoop/homebrew manifesti | Yok | Paket yöneticisiyle keşif ve güncelleme | S | P2 |
|İmzalı release + SBOM | Release'ler imzasız | Tedarik zinciri güveni (özellikle güvenlik aracı için) | S | P2 |

## B) MCP protokolü ve ajan deneyimi

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| Toolset profilleri (`REA_TOOLSETS=static,debug`) | 171 aracın tamamı her istemcide yükleniyor; küçük bağlamlı modeller boğuluyor | Araç listesi bağlamı %70+ küçülür, isabet artar | S | **P0** |
| Resources | Yalnız `tools` capability'si var | Katalog, doctor çıktısı ve evidence bundle'lar URI ile okunur; ajan bağlamı şişmez | M | P1 |
| Prompts | Yok | Hazır iş akışları: "bu binary'yi triyajla", "unpack reçetesi uygula" tek seçimde | S | P1 |
| `outputSchema` + `structuredContent` | Çıktılar serbest JSON metni | İstemciler tip güvenli tüketir, zincirleme kolaylaşır | M | P1 |
| Progress bildirimi + iptal | Uzun Ghidra/frida işleri sessiz bekletiyor | Ajan ilerlemeyi görür, vazgeçebilir | M | P1 |
| Tool annotation'ları | SDK v2 yüzeyi doğrulanamadığı için ertelendi | `destructiveHint`/`readOnlyHint` ile istemci onay UX'i düzelir | S | P1 (SDK'ya bağlı) |
| Async job modeli (başlat → poll) | Uzun işler çağrıyı kilitliyor | Saatlik analizler zaman aşımına takılmaz | M | P2 |
| Roots desteği | Sunucu istemci köklerini bilmiyor | Çalışma alanı otomatik sınırlanır, yol tahminleri biter | S | P2 |

## C) Güvenlik

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| Çalışma kökü kısıtı (`REA_WORKSPACE_ROOT`) | Path argümanları diskte her yere gidebiliyor | Prompt-injection ile rastgele dosya okuma/yazma yüzeyi kapanır | M | **P0** |
| Token'sız HTTP'de salt-okunur kip | Token yokken uyarı var ama tüm araçlar açık | Yanlışlıkla açık bırakılan port zararsızlaşır | S | P1 |
| Audit log (JSONL) | Kim, ne çağırdı kaydı yok | Olay incelemesi ve kurumsal kabul | S | P1 |
| Rate limit + eşzamanlı oturum tavanı | Registry sınırsız, TTL yok | Kaynak tüketimi/DoS dayanımı | S | P2 |
| Sandbox reçetesi (VM profili dokümanı) | "VM'de çalıştır" demekle kalınıyor | Hazır izole ortam tarifi (ağsız snapshot'lı VM) | S | P2 |

## D) Debugger motorları

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| Oturum başına tam serileştirme kuyruğu | Üzerine-yazma koruması var, komut kuyruğu yok | Eşzamanlı çağrılarda yarış tamamen biter | M | P1 |
| Frida ajanında gerçek exception raporlama | Global handler her exception'ı breakpoint sanıp yutuyor | Gerçek çökmeler görünür olur (doğruluk) | S | **P0** |
| Frida attach/createScript/load timeout'ları | RPC'ler sınırlı, kurulum adımları değil | Kötü hedefte asılı kalma biter | S | P1 |
| cdb: async pause + gerçek push olayları | Pause senkron PowerShell ile event loop'u blokluyor; `onPush` ölü | Çok oturumlu kullanım rahatlar | M | P1 |
| x64dbg eklenti oto-provizyonu | Bridge dosyaları elle bekleniyor | İlk kurulum sürtünmesi kalkar | M | P1 |
| LLDB motoru (Linux/macOS) | Canlı debug yalnız Windows | Platform kapsamı genişler | L | P3 |
| WinDbg TTD kayıtlarını okuma | Yok | Zaman yolculuğu analizi | L | P3 |

## E) Statik domainler (derinlik ve dürüstlük)

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| jadx gerçek manifest/sınıf alanları | `manifest` bayt sayısı, `classes` info satırı dönüyor | Android çıktısı güvenilir olur | S | **P0** |
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
| Golden korpus (provider başına 5 gerçek binary + hash) | Fixture'lar minimal (mini_branch/mini_pe) | Regresyon erken yakalanır | M | P1 |
| Canlı kulvar için self-hosted Windows runner | Frida/debug testleri CI'da koşmuyor | En riskli yüzey sürekli doğrulanır | M | P1 |
| Parser fuzz'ı (PE/ELF/WASM/DWARF) CI smoke | Yok | Sessiz yanlış/çökme sınıfları yakalanır | M | P2 |
| HTTP e2e'yi CI varsayılanına alma | e2e canlı kulvarda | Transport regresyonu görünür olur | S | P2 |
| Performans bütçeleri (tools/list, açılış) | Ölçüm yok | Yavaşlama sessizce birikmez | S | P3 |

## I) Dokümantasyon ve topluluk

| Öneri | Bugün ne var / boşluk | Etki | Efor | Öncelik |
|---|---|---|---|---|
| Otomatik araç referansı (tools/list → docs) | El yazısı tablolar bayatlıyor | 171 aracın güncel kataloğu | S | P1 |
| Örnek oturumlar (asciinema/GIF) README'de | Görsel kanıt yok | İlk 10 saniyede ikna (yıldız dönüşümü) | S | P1 |
| GitHub Pages docs sitesi | docs/ dağınık (20+ dosya) | Aranabilir, linklenebilir doküman | M | P2 |
| Örnek prompt kütüphanesi | Yok | Kullanıcı ilk değeri dakikalar içinde alır | S | P2 |
| good-first-issue + CONTRIBUTING genişletme | Tek paragraf | Katkı hunisi açılır | S | P3 |

---

**Önerilen sıra:** npm + Registry → workspace kökü → Frida agent exception → jadx dürüstlüğü →
toolset profilleri → golden korpus → canlı CI → resources/prompts → davranış profilleri.
İlk dördü tek sürümde (v0.8) kapanır ve dağıtımı fiilen açar.

