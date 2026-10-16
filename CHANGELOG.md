# Changelog — rea-plus

Tüm önemli değişiklikler bu dosyada tutulur. Format: Keep a Changelog + SemVer.
All notable changes are documented here (Türkçe özet + English detail).

## [0.10.1] — 2026-10-16

Sürüm 0.10.1: P1 kod maddeleri kapandı — ölü facade temizliği +
golden DEX fixture. Araç yüzeyi değişmedi (191 araç + 2 resource +
3 prompt). 92/92 varsayılan test yeşil.

### Düzeltildi / Fixed

- Ölü facade silindi: `probeCache`/`parallelProbe` davranışı
  `workerCache`'e taşındı (`ResultCache` TTL + `runProbes`);
  `tests/probe.test.mjs` `worker-cache.test.mjs` altına taşındı.
- Golden DEX fixture: `tests/corpus/mini.dex` (sentetik minimal DEX
  v035, deterministik üretim `scripts/dex-fixture-uret.mjs`) +
  `dex-golden` 7 test + HASHES girdisi.
- `RepoScan` `.dex → dex/jadx` eşlemesi eklendi.

## [0.10.0] — 2026-10-16

Sürüm 0.10.0: 4 yeni araç (187→191), serileştirme kuyruğu, worker-cache
bağlama, dağıtım hazırlığı (SEA fizibilite, manifestler, SBOM, sandbox),
kalıcı kalite (şema bütçesi, docs sitesi, prompt kütüphanesi, ObjC/IL2CPP/Go
derinliği). 187 `outputSchema`, 191 annotations. 91/91 varsayılan test yeşil.

### Eklendi / Added

- `rea_macho_objc/classdump`, `rea_il2cpp_methods`, `rea_go_buildinfo`.
- Tam serileştirme (`REA_SESSION_SERIALIZE=1`, zaman-damga kanıtlı).
- Worker-cache canlı bağlama (reposcan yolu, sayaç kanıtlı).
- SEA fizibilite raporu + pilot script; winget/scoop/homebrew manifestleri.
- SBOM (CycloneDX) + `docs/SANDBOX.md` (Hyper-V/VirtualBox).
- Şema bütçesi (ölçülü eşikler), docs sitesi (7 sayfa), `docs/PROMPTS.md`.

### Düzeltildi / Fixed

- POSIX jadx keşfi (PATH taraması + X_OK).
- Hopper POSIX benzerlik kapısı.
- cdb-async CI-Linux uyumu; korpus normalize.

### Henüz yapılmadı / Not yet done

- Frida canlı VM onayı; self-hosted Windows runner.
- Ölü facade silme (probe testi bağlılığı); P3 araştırma.

## [0.9.0] — 2026-10-15

Sürüm 0.9.0: 15 yeni araçla varsayılan yüzey 172→187 (30 conduit + 157 rea),
183 `outputSchema` + 187 annotations korunur, kurulum kolaylığı (`setup`
sihirbazı, `doctor --fix`) ve kalite platformu (parser fuzz smoke, HTTP e2e
varsayılanı, performans bütçeleri, örnek oturumlar + CONTRIBUTING) geldi.
86/86 varsayılan test yeşil.

### Eklendi / Added

- 15 yeni araç (172→187): `rea_go_funclines`, `rea_go_goresym`,
  `rea_il2cpp_metadata`, `rea_il2cpp_dump`, `rea_bindiff_fonksiyonlar`,
  `rea_bindiff_karsilastir`, `rea_flutter_snapshot`, `rea_flutter_blutter`,
  `rea_macho_info`, `rea_macho_loads`, `rea_macho_otool`, `rea_pcap_oku`,
  `rea_scan_repo_paralel`, `rea_android_dinamik_recete`,
  `rea_android_recete_dogrula`.
- `rea-plus-cli setup` sihirbazı (istemci algılama + config yazma) ve
  `doctor --fix` (onaylı kurulum önerisi/çalıştırması).
- Parser fuzz smoke (`scripts/fuzz-parsers.mjs` + `parser-fuzz.test.mjs`;
  tohumlar salt-okunur korpustan, yazma yalnız tmpdir'e).
- HTTP e2e varsayılan kulvara alındı (`tests/e2e.http.mjs`).
- Performans bütçeleri (`perf-budget.test.mjs`: tools/list + açılış).
- Örnek oturumlar (`docs/EXAMPLES.md` + `docs-examples.test.mjs`) ve
  `CONTRIBUTING.md` (korpus kuralları dahil).

### Düzeltildi / Fixed

- Hopper POSIX benzerlik kapısı: çalıştırılabilir bite/boyuta benzemeyen
  sahte dosya Hopper sayılmaz, dürüst `capability_unsupported` döner.
- cdb async CI-Linux dalı ve korpus satır-sonu normalizesi (0.8.2'den gelen
  düzeltmeler) 187-araç yüzeyinde regresyon testleriyle kilitlendi.

### Henüz yapılmadı / Not yet done

- Frida canlı VM onayı; self-hosted Windows runner.
- Tek dosya Windows exe (Node SEA); winget/scoop/homebrew manifesti; SBOM.
- P3 araştırma: LLDB motoru, WinDbg TTD, sembolik yürütme (angr/Triton).

## [0.8.2] — 2026-10-15

Sürüm 0.8.2: kalan şema kapsaması kapandı (168 `outputSchema`, 172 annotations,
sıfır işaretsiz), PDB indirici 172. araç olarak kaydedildi, oturum TTL ve
modern Roots MRTR geldi, progress genelleme + async whitelist 3'lüye çıktı.
Varsayılan yüzey 172 araç; opt-in: async +5 (177), kuyruk +1 (173). 72/72
varsayılan test yeşil (CI dahil).

### Eklendi / Added

- 20 conduit + `rea_pdb_indir` `outputSchema` (toplam 168); annotations 172/172.
- `rea_pdb_indir` kaydı (Microsoft symbol server, bütünlüklü, önbellekli, yalnız `all` profilinde).
- Oturum TTL (`REA_SESSION_TTL_MS`, varsayılan 30dk, 0=kapalı).
- Roots modern MRTR (`inputRequired`/`inputResponses`); `list_changed` legacy'de.
- Progress stage yardımcıları 2 ek araçta; async whitelist 3'lü.

### Düzeltildi / Fixed

- cdb-async testi CI-Linux uyumu (`engine_unavailable` dalı kabul edilir).
- Korpus hash satır-sonu normalizesi; `ornek.js` HASHES düzeltmesi.

### Henüz yapılmadı / Not yet done

- Frida canlı VM onayı; self-hosted Windows runner; kalıcı DEX korpusu.
- P2 dağıtım kolaylığı; analiz derinliği; P3 araştırma.

## [0.8.1] — 2026-10-14

Sürüm 0.8.1: motor sağlamlığı (oturum kuyruğu, Frida timeout, cdb async, x64dbg
provizyon), statik dürüstlük (browser scenario, FLIRT, Wasm/DWARF, PE/PDB),
davranış ve ölçek (syscall matrisi, tek-çağrı koşu, worker cache), kalıcı test
platformu (golden korpus, 147 outputSchema, progress genelleme). Varsayılan
yüzey 171 araç olarak korunur; tüm yenilikler opt-in veya dürüst-hata
iyileştirmesidir. 70/70 varsayılan test yeşil.

### Eklendi / Added

- Oturum FIFO kuyruğu (`REA_SESSION_QUEUE=1` opt-in, 32 derinlik, `session_queue_status` aracı; varsayılan 171 yüzey değişmez).
- Frida kurulum timeout'ları (attach 15sn/script 10sn/load 15sn, env override'lı, timeout'ta unload/detach temizlikli `engine_timeout`).
- cdb async pause + push olayları (event loop bloklanmaz, `pauseAsync` opt-in).
- x64dbg provizyonu (`reaX64dbgDoctor` + `reaX64dbgSetup`, idempotent, hash doğrulamalı).
- Browser scenario gerçek çalıştırma (adım kanıtlı, dry-run modlu, backendsizde `capability_unsupported`).
- Syscall numara matrisi + CreateFileW/RegSet profilleri.
- Tek-çağrı davranış koşusu (`BehaviorRun`: spawn+trace+capture, zorunlu timeout, crash dürüstlüğü).
- Worker cache (LRU-100, hash-anahtarlı, `REA_CACHE=0` baypas).
- Golden korpus manifesti (`tests/corpus/HASHES.json` + `verify-corpus.mjs`).
- Progress genelleme yardımcıları (`createStageProgress`, `onAbort`).
- 27 yeni `outputSchema` (toplam 147: 137 rea + 10 conduit).

### Düzeltildi / Fixed

- jadx `-jar` asılması: `-cp jadx.cli.JadxCLI` biçimine çevrildi; canlı APK kabulü geçti (`com.zb.test`, 7 izin, 5 sınıf, 2.2sn).
- FLIRT yanlış isimlendirmesi: açıklama ve sonuç `string-heuristic` + güven skoru taşır.
- WasmInfo çok-bayt LEB + DWARF v5/abbrev_offset/çoklu FORM (negatif boyut ve sahte boş özet bitti).
- PE `SizeOfOptionalHeader` + PeReader/PdbReader kopya kodu birleşti; PDB indirme (önbellekli, bütünlüklü).

### Henüz yapılmadı / Not yet done

- Frida canlı VM onayı; DEX kalıcı korpus (repo içi fixture); self-hosted Windows runner.
- Kalan 24 şemasız araç; progress genelleme (senkron handler'lar); trusted publisher OIDC + provenance.

## [0.8.0] — 2026-10-14

Sürüm 0.8.0: MCP protokol yüzeyi büyüdü (resources/prompts, toolsets, typed
outputs), güvenlik sınırları eklendi (workspace kökü, tokensiz HTTP, audit),
uzun işler için async job + progress pilotları geldi. Aşağıdakiler bu sürümün
durumunu anlatır; "Henüz yapılmadı" bölümündeki dış kapılar açıktır.
Release 0.8.0: bigger MCP surface, new security boundaries, async job and
progress pilots. External gates in "Not yet done" remain open.

### Eklendi / Added

- Araç referansı: derlenmiş sunucunun gerçek MCP yüzeyinden üretilen `docs/TOOLS.md`
  (171 araç + 2 resource + 3 prompt). README ve ROADMAP bu referansa bağlandı.
- MCP resources: statik, salt-okunur `rea-plus://server-info` ve
  `rea-plus://capabilities-safety` (env değeri, kişisel yol veya dosya içeriği açmaz).
- MCP prompts: yan etkisiz, yalnız metin üreten `packer-triage`,
  `dotnet-malware-triage` ve `android-triage` akışları.
- `REA_TOOLSETS` profilleri: tanımsız/boş/`all` = 171 araç; `minimal` = 8,
  `static` = 98, `android` = 27, `dotnet` = 20, `web` = 26, `debug` = 50.
  Virgüllü yazım birleşimdir; bilinmeyen/boş profil sessizce `all`'a düşmez,
  açılışta açık hata verir. Resources/prompts filtrelenmez.
- `REA_WORKSPACE_ROOT` çalışma kökü sınırı: tanımlıyken `rea_*` yol argümanları,
  conduit `open_target`/`debug_open` yolları ve kullanıcıya görünür türev yazmalar
  (`.unpacked`, `.extracted`, HAR çıktısı) kök içinde, realpath kanıtıyla doğrulanır;
  tanımsızken davranış değişmez. Operatör temp/cache yüzeyleri bilinçli istisnadır:
  browser artifacts dizini, Ghidra tmp proje/girdi dizinleri, hopper tmp istek
  dosyası ve apktool framework cache'i kök içine zorlanmaz.
- Tokensiz HTTP salt-okunur kipi: `DBG_BRIDGE_TOKEN` tanımsızken HTTP, uyarının
  yanında yalnız 44 araçlık, yol parametresi almayan salt-okunur allowlist'i
  kaydeder (sonuç `REA_TOOLSETS` ile kesişimdir). Token'lı HTTP ve stdio tam
  (veya toolset) yüzeyi korur. Yeni/listede olmayan araç tokensiz HTTP'de görünmez.
- `REA_AUDIT_LOG` (JSONL, iki transportta da): satır başına yalnız `ts`,
  `transport`, `tool`, `durationMs`, `isError`. Argüman, token, yol veya hedef
  içeriği asla yazılmaz; yazma hatası tek uyarıyla audit'i kapatır, sunucuyu çökertmez.
- HTTP sınırları: IP başına `REA_HTTP_RATE_LIMIT_PER_MIN` (varsayılan 120/dk) ve
  aktif istek tavanı `REA_HTTP_MAX_CONCURRENT` (varsayılan 16); aşımda `429`.
  Pozitif tam sayı olmayan değer sessiz varsayılana düşmez, açılış hatası verir.
- Tip güvenli çıktılar (kısmi taban): 147 araç `outputSchema` taşıyor, 169 araçta
  annotations var; metin JSON'u düz nesne olan sonuçlarda `structuredContent` aynı
  değeri taşır. Şema kümesi dışındaki araçlar şemasız metin JSON'u döner; araç
  başına durum `docs/TOOLS.md`'dedir. Şema kapsamı tüm 171 araca genişlemiş değildir.
- Async job pilotu: `REA_ASYNC_JOBS=1` açılınca 5 job aracı
  (`rea_job_start/status/result/cancel/list`) kaydolur; varsayılan yüzey 171
  araç olarak kalır, opt-in yüzey 176 araçtır. Kuyruk en fazla 2 eşzamanlı iş
  koşar, kayıtlar süreç-içidir ve whitelist bugün yalnız AbortSignal alan
  `rea_process_run` aracını içerir; çalışan işin iptali süreç ağacını öldürür.
- Roots pilotu: `REA_ROOTS=1` ve legacy stdio yolunda istemci kökleri çekilir;
  kökler `REA_WORKSPACE_ROOT` sınırını yalnız daraltabilir. Modern protokolün
  MRTR akışı ayrı iştir ve desteklenmiş gibi gösterilmez.
- Progress/iptal pilotu: `rea_process_run` ilk bildirimi beklemeden, sonrakileri
  en fazla yaklaşık 20/sn hızla gönderir; `notifications/cancelled` çocuk süreç
  ağacını öldürür. Diğer senkron handler'lar bu pilotun dışındadır.
- Yayın hazırlığı: Registry adı `io.github.Alyhnte/rea-plus` ve paket `mcpName`'i
  hazır; publish workflow'u yalnız elle tetiklenen, varsayılanı dry-run olan bir
  hazırlık olarak eklendi (gerçek yayın açık `PUBLISH` onayı ister).
- jadx köprüsü dürüstlüğü (kod tabanı): manifest paket/izin/aktivite ve sınıf FQCN
  çıkarımı gerçek ayrıştırmaya dayanıyor; canlı jadx koşusu bu girdinin kanıtı değildir.
- Frida ajanı exception davranışı (kod tabanı): kurulu slotun adresiyle eşleşmeyen
  exception artık breakpoint sanılıp yutulmuyor, `false` ile gerçek akışa bırakılıyor.

### Henüz yapılmadı / Not yet done

- npm yayını yapıldı: `rea-plus@0.8.0` registry'de, tüketici kurulumu
  (`npm install` + stdio `initialize`/`tools/list` = 171) doğrulandı. MCP Registry
  kaydı yapıldı: `io.github.Alyhnte/rea-plus` yayında (GHA + OIDC). Desteklenen
  kurulum `npx -y rea-plus` ve GHCR'dır.
- Frida canlı VM onayı tamamlanmış değildir; yukarıdaki Frida maddesi canlı kabul
  kanıtı sayılmaz.
- DEX golden APK kabul testi (canlı jadx + gerçek APK) tamamlanmış değildir;
  golden korpus kapısı açık durur.

## [0.7.4] — 2026-10-13

Dağıtım yaması: başkalarının kurulumu kolaylaştı; tüketiciyi kilitleyen bir paket
hatası düzeltildi. README baştan yazıldı (tek-tık kurulumlar, mimari diyagramı,
istemci matrisi), tam yol haritası `docs/ROADMAP.md`'de.

### Düzeltildi / Fixed

- Playwright artık opsiyonel ve tembel yükleniyor. Önceden `devDependencies`'teyken
  ürün kodu onu statik import ediyordu: paketi kuran herkes açılışta
  `ERR_MODULE_NOT_FOUND` alıyordu. Sunucu Playwright'sız açılır, tarayıcı araçları
  `capability_unsupported` döner. Tarayıcı için: `npm i playwright && npx playwright install chromium`.

### Eklendi / Added

- `prepare` scripti: git kurulumları (`npx -y github:Alyhnte/ReaPlus`) dist'i otomatik derler.
- Tek-tık kurulum bağlantıları (Cursor, VS Code) + istemci config örnekleri:
  Claude Desktop/Code, Cursor, VS Code, Windsurf, Codex, opencode (`configs/`).
- `Dockerfile` + GHCR workflow'u: release'lerde `ghcr.io/alyhnte/reaplus` imajı basılır.
- `smithery.yaml` registry metadata'sı; config örneklerindeki kişisel yollar temizlendi.
- Görsel README (rozetler, Mermaid mimari, env tablosu, güvenlik modeli) ve
  `docs/ROADMAP.md` (9 temalı, önceliklendirilmiş tam tablo).

## [0.7.3] — 2026-10-12

CI/taşınabilirlik yaması: varsayılan test kümesi artık yazar makinesi dışında da
(temiz Ubuntu CI, Node 20+22) yeşil. Aynı genelleme ürün koduna da uygulandı:
araç keşfi yalnız env + PATH, makineye özel sabit yol kalmadı.

### Düzeltildi / Fixed

- Test fixture'ları kişisel Temp yolları yerine repoda izlenen korpusu
  (`tests/corpus`, `import.meta.url` göreli) okuyor; `korpus-kur` yenilemeyi yalnız
  `REA_KORPUS_ELF`/`REA_KORPUS_PE` env'iyle yapıyor.
- Varlık yoklamaları `spawnSync`'in throw etmediğini hesaba katıyor (`r.error`/status):
  mitmdump olmayan makinede ürün ve test artık kapıyı doğru görüyor (13 sn'lik
  sahte proxy bekleyişi de kalktı).
- Araç yokluğunda testler ilkesel davranıyor: wabt/upx/ilspy/dnfile/Chromium yoksa
  `capability_unsupported` assert'i veya dürüst skip; UPX sürümü artık 5.2.1'e sabitli değil.
- Ürün araç keşfi genelleşti: `REA_UPX_BIN`, `REA_WABT_BIN`, `REA_AAPT2_BIN` + PATH;
  kişisel WinGet/`C:\tools` yolları kaldırıldı. .NET CIL python araması
  `python`/`python3`/`py` sırasını deniyor (Linux'ta genelde yalnız python3 olur).
- Ghidra proje dizini kişisel yol yerine `os.tmpdir()` altında; Ghidra testleri
  varsayılan kurulum yolu varsaymıyor (`REA_GHIDRA_DIR` zorunlu, canlı kulvar).
- CLI testleri node'u PATH'ten değil `process.execPath` ile çağırıyor.
- Test koşucusu CI tanısı için hata kuyruğunu daha uzun basıyor.

### Doğrulama / Verification

- Yerel: tam PATH ve araçsız (dar PATH) ortamda 43/43; farklı çalışma dizininden koşu da yeşil.
- CI: Ubuntu Node 20 + 22 yeşil (`fix/inceleme-duzeltmeleri` dalı ve main).

## [0.7.2] — 2026-10-12

Kapsamlı inceleme düzeltmeleri: kırık giriş/yayın yolları, hata zarfı, enjeksiyon
yüzeyleri, sahte `ok` sonuçları ve motor sağlamlığı. Ara sürümler (0.2.0–0.7.1)
için `docs/release-v*.md` dosyalarına bakın.

### Düzeltildi / Fixed

- `npm start` artık gerçek girişi (`dist/server.js`) çalıştırıyor; önceki hedef
  (`dist/facade/createReaPlusServer.js`) transport'suz bir fabrikaydı, sunucu hiç açılmazdı.
- `npm test` repo dışına işaret eden eski script yerine `scripts/run-tests.mjs` koşuyor;
  CI artık gerçekten varsayılan kümeyi çalıştırıyor (43 dosya).
- Hata zarfı: rea araçlarında `ok:false` sonuçları ve fırlayan hatalar artık MCP'ye
  `isError: true` ile gidiyor; başarı gibi raporlanma bitti.
- Build, çalışma zamanı dosyalarını da kopyalıyor (`frida-agent.js`, Ghidra `.py` scriptleri);
  yayın paketinde Frida motoru artık `engine_unavailable` vermiyor. `prepublishOnly` eklendi.
- Sürüm tek gerçeğe indi: `package.json`, `server.json`, `server.ts` hepsi 0.7.2.
- Cutter `decompile` yedeği analizsiz `pdf` koşup boş `ok` dönüyordu; artık `aaa;pdf`
  koşuyor, boş çıktı `capability_unsupported`.
- `korpus-kur` kişisel Temp kaynakları yoksa izlenen korpusu koruyor (CI'da çökmez);
  idempotentlik testi ölçümü ikinci koşuda yapıyor.

### Güvenlik / Security

- Adres girdileri şemada ve köprülerde doğrulanıyor (hex/sayı/sembol); r2/rizin
  komut enjeksiyonu (`;`, `!` kaçışı) kapatıldı.
- radare2 cmd.exe yolu meta karakterleri reddediyor; kapatma süreç ağacını öldürüyor
  (r2 torunu yetim kalmıyor).
- `rea_jeb_sorgu` varsayılanla yalnız loopback'e POST atabiliyor; uzak hedef
  `REA_JEB_ALLOW_REMOTE=1` ister, link-local/metadata hostları her durumda engelli.
- HTTP token'ı tanımsızsa sunucu açılışta yüksek sesle uyarıyor (auth devre dışı).

### Dürüstlük / Honesty

- `rea_dotnet_metadata` yalnız MZ'ye bakıp her PE'yi .NET sayıyordu; artık gerçek
  CLR dizini (DataDirectory[14]) kontrol ediliyor, dış okuyucu şart değil.
- `rea_pwn_elf_layout` sahte "kuyrukta" `ok`'su yerine `capability_unsupported` dönüyor.
- `stdout_sha256_kısa` artık gerçekten SHA-256 (önce FNV-1a'ydı); sahte PTY kanalı ve
  pipe/PTY karşılaştırması kaldırıldı — kanal dürüstçe `pipe`, compare kapıdan döner.
- `rea_net_capture` verilen localhost URL'i gerçekten hedefliyor; yem sunucu yalnız
  `data:` girdisinde kurulup özette belirtiliyor.

### Sağlamlık / Robustness

- Frida ajan RPC'leri (`callAgent`, `describe`) timeout'lu; başarısız inject yarım
  oturum bırakmıyor (detach + map temizliği).
- Re-open/re-attach eski hedefin checkpoint'larını temizliyor; rewind yanlış sürece
  geri yazamıyor.
- Eşzamanlı re-open yarışında üzerine yazılan oturumun debugger'ı yetim kalmıyor
  (x64dbg/cdb/frida).

### Testler / Tests

- Yeni: `tests/fixes-regression.test.mjs` (12 test) bu düzeltmeleri kilitliyor.
- Varsayılan küme: 43 dosya / 321 it yeşil. Canlı enjeksiyon/debug ve yerel Ghidra
  testleri `npm run test:live` altında (VM/CI), ana makinede toplu koşulmaz.

## [0.1.0] — 2026-10-12

İlk çalışır paket: conduit donduruldu, rea üzerine eklendi.

### Eklenen / Added

- `src/conduit-core`: conduit birebir, salt-okunur. Frozen 30 tool ismi
  (`health`, `session_open/close/list`, `events_pull`, `static_info`,
  `open/close_target`, `disassemble`, `get_cfg`, `xrefs`, `strings`, `dump`,
  `debug_open/attach/close/state/breakpoint/continue/step/pause/registers/
  callstack/memory/code/thread/plugin/time`, `explain`, `prerequisites`).
  Yeniden adlandırma yok; kural `toolNamespace.ts` ile kilitli.
- `src/facade`: 7 modül — `sessionRouter`, `toolNamespace`, `catalogMerge`,
  `createReaPlusServer`, `compactSchema`, `evidenceBundle`, `obligationLedger`.
  Prefix kuralı: rea kökenli her tool `rea_*` / `hopper_*` / `ghidra_*` /
  `jeb_*` / `evm_*` / `firmware_*` / `browser_*` / `adb_*`.
- `src/rea-domains`: 19 domain dosyası (9 klasör) — hopper, ghidra, ida, jeb,
  javascript (JsAnalyzer/ReconHarness/BinaryDiff), android (Jadx/Adb/Apktool),
  dotnet (ManagedInspector), wasm-evm (WasmEvmBridge/CrashTimeline/GoPwn/
  DosMips/NativeAot), firmware-browser (Firmware/Browser/ProcessCapture).
- `keccak`: `js-sha3` ile offline EVM selector — `transfer(address,uint256)`
  → `0xa9059cbb`, `approve(address,uint256)` → `0x095ea7b3`.
  WAT export taraması da offline, `wabt` yoksa `capability_unsupported`.
- Tool sayısı: 8 rea aracı → 33+ toplam hedef; bu sürümde runnable server
  30 conduit + 8 rea = 38 live tool sunar (8 -> 33 tool yol haritası kilitli).
  Birleşik katalog: 8 conduit + 9 rea = 17 girdi (`mergedCatalog()`, Cutter eklendi).
- Runnable server: `src/server.ts` → `dist/server.js` (bin: `rea-plus`).
  Transport: stdio (varsayılan) + `POST /mcp` ve `GET /health` (stateless,
  `DBG_BRIDGE_TOKEN` Bearer kapısı conduit ile aynı).
- Configs: `configs/claude-desktop`, `configs/cursor`, `configs/opencode`
  altında stdio + http JSON'ları (yer tutucu `<REA_PLUS_DIR>` açıklamalı).
- Tests: `tests/namespace.test.mjs` (prefix + collision kilidi) ve
  `tests/reaplus.smoke.mjs` (keccak seçiciler + frozen=30 + katalog=17).
  Çalıştırma: `node tests/namespace.test.mjs`, `node tests/reaplus.smoke.mjs`.
- Paket hijyeni: `server.json` (io.github.rea-plus), `LICENSE` (MIT 2026),
  `.gitignore`, `.npmrc`, CI workflow.

### Kurallar / Policy

- Eksik yetenek = stub yok, `capability_unsupported` + indirme önerisi.
- Canlı işler `confirm:true` ister. HTTP localhost doğrulaması açık.
