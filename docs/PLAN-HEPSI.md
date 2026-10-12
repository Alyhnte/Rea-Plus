# rea-plus TAM PLAN (önerilerin hepsi dahil)

## WP4a statik (bitti)
- hopper/HopperProvider.ts REA_HOPPER_PATH
- ghidra/GhidraProvider.ts REA_GHIDRA_DIR + Java17
- ida/IdaProvider.ts, jeb/JebProvider.ts REA_JEB_MCP_URL

## WP4b mobil+managed (bitti)
- android/JadxBridge.ts rea_jadx_* + JDK
- android/ApktoolBridge.ts rea_apktool_*
- android/AdbBridge.ts rea_adb_*
- dotnet/ManagedInspector.ts rea_dotnet_* (çalıştırmadan)

## WP4c web+özel (bitti)
- javascript/JsAnalyzer.ts rea_js_* + compare_source_to_bundle
- firmware-browser/FirmwareBridge.ts rea_firmware_* (Linux)
- firmware-browser/BrowserBridge.ts rea_browser_* + HAR
- wasm-evm/WasmEvmBridge.ts rea_wasm_* rea_evm_*
- wasm-evm/GoPwnBridge.ts rea_go_* rea_pwn_*

## WP5 orta (bitti)
- facade/evidenceBundle.ts ev_* + tools_sha256
- facade/obligationLedger.ts bulgu->kod->test
- facade/compactSchema.ts 13KB profil
- firmware-browser/ProcessCapture.ts rea_process_*
- native-windows/addon.ts + README prebuild yol haritası

## WP6 uzun (bitti)
- wasm-evm/DosMipsBridge.ts, NativeAotBridge.ts, CrashTimeline.ts
- javascript/BinaryDiff.ts, ReconHarness.ts (3205 case hedef)
- docs/AIRGAP.md, src/skill-pack/SKILL.md

## Kural
- conduit 30 frozen, hepsi rea_ prefixli, collision assert
- transport stdio+HTTP stateless, confirm:true canlıda zorunlu
- eksik araç capability_unsupported + nereye, stub yok
