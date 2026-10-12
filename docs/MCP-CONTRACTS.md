# MCP Contracts — rea-plus v0.1.0

## Frozen 30 (conduit, yeniden adlandırılmaz)

`health`, `session_open`, `session_close`, `session_list`, `events_pull`,
`static_info`, `open_target`, `close_target`, `disassemble`, `get_cfg`,
`xrefs`, `strings`, `dump`, `debug_open`, `debug_attach`, `debug_close`,
`debug_state`, `debug_breakpoint`, `debug_continue`, `debug_step`,
`debug_pause`, `debug_registers`, `debug_callstack`, `debug_memory`,
`debug_code`, `debug_thread`, `debug_plugin`, `debug_time`,
`explain`, `prerequisites`.

Kaynak: `src/facade/toolNamespace.ts` (`FROZEN_CONDUIT_TOOLS`).

## Rea 30 (MCP kayıtlı, hepsi prefixli)

`rea_dotnet_metadata`, `rea_dotnet_cil`, `rea_js_sourcemap`,
`rea_js_bundle`, `rea_js_diff`, `rea_js_recon`, `rea_diff_match`,
`rea_diff_summary`, `rea_recon_harness`, `rea_crash_timeline`,
`rea_dos_mz`, `rea_mips_funcs`, `rea_aot_detect`,
`rea_firmware_extract`, `rea_browser_har_import`, `rea_browser_scenario`,
`rea_process_run`, `rea_process_compare`, `rea_process_caps`,
`rea_wasm_decode`, `rea_wasm_exports`, `rea_evm_selector`,
`rea_jadx_manifest`, `rea_jadx_classes`, `rea_adb_devices`,
`rea_adb_packages`, `rea_evidence_bundle`, `rea_obligation_ledger`,
`rea_obligation_advance`, `rea_obligation_verify`.

Kaynak: `src/server/registerReaTools.ts` (tek döngü, 30 kayıt).

## Prefix kuralı

- Rea kökenli her MCP adı `rea_*` (veya `hopper/ghidra/jeb/evm/firmware/browser/adb_*`) olur.
- `qualifyReaTool(ad)`: frozen ad geçerse `rea_` öneki basar, çift prefix yapmaz.
- `assertNoCollision(adlar)`: çift kayıt + çıplak frozen adı yasaktır.
- Örnek: `health -> rea_health`, `rea_evm_selector` aynen kalır.

## capability_unsupported

- Eksik bağlama/araç = stub yok, tek zarf döner:
- `{"ok":false,"code":"capability_unsupported","tool":"<ad>","reason":"..."}` (`isError:true`).
- Statik kapı: yanlış engine oturumu aynı kodu + `required:{engine:"radare2"}` ile döner.
- Yanına katalogdan indirme önerisi eklenir (`suggestDownload(id)`).

## confirm:true

- Canlı debug yazma işleri (`debug_breakpoint/continue/step`, `explain` canlı kolu) onaysız çalışmaz.
- `confirm:true` yoksa: `confirmation_required` + aynı çağrıyı tekrarla mesajı.
- Okuma işleri (`disassemble`, `strings`, `rea_evm_selector`) confirm istemez.

## Katalog 16 + transport

- `mergedCatalog()`: 8 conduit (`radare2/graphviz/x64dbg/python64/python32/cdb/frida/scyllahide`) + 8 rea (`hopper/ghidra/ida/jeb/jadx/apktool/wabt/binwalk`) = 16.
- Transport: stdio varsayılan; HTTP stateless `POST /mcp` + `GET /health`.
- Port: rea-plus 3848 (alternatif 3849), conduit 3847 ile çakışmaz.
- Token (`DBG_BRIDGE_TOKEN`) varsa HTTP Bearer zorunlu, stdio etkilenmez.
