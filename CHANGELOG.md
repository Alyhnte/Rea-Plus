# Changelog — rea-plus

Tüm önemli değişiklikler bu dosyada tutulur. Format: Keep a Changelog + SemVer.
All notable changes are documented here (Türkçe özet + English detail).

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
