# Changelog — rea-plus

Tüm önemli değişiklikler bu dosyada tutulur. Format: Keep a Changelog + SemVer.
All notable changes are documented here (Türkçe özet + English detail).

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
  Birleşik katalog: 8 conduit + 8 rea = 16 girdi (`mergedCatalog()`).
- Runnable server: `src/server.ts` → `dist/server.js` (bin: `rea-plus`).
  Transport: stdio (varsayılan) + `POST /mcp` ve `GET /health` (stateless,
  `DBG_BRIDGE_TOKEN` Bearer kapısı conduit ile aynı).
- Configs: `configs/claude-desktop`, `configs/cursor`, `configs/opencode`
  altında stdio + http JSON'ları (yer tutucu `<REA_PLUS_DIR>` açıklamalı).
- Tests: `tests/namespace.test.mjs` (prefix + collision kilidi) ve
  `tests/reaplus.smoke.mjs` (keccak seçiciler + frozen=30 + katalog=16).
  Çalıştırma: `node tests/namespace.test.mjs`, `node tests/reaplus.smoke.mjs`.
- Paket hijyeni: `server.json` (io.github.rea-plus), `LICENSE` (MIT 2026),
  `.gitignore`, `.npmrc`, CI workflow.

### Kurallar / Policy

- Eksik yetenek = stub yok, `capability_unsupported` + indirme önerisi.
- Canlı işler `confirm:true` ister. HTTP localhost doğrulaması açık.
