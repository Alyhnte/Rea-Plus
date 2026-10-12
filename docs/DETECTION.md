# Detection — How rea-plus Decides What Can Run

## 1. How detection works

Pipeline (5 stages, fail-closed):

1. **`src/cli/doctor.ts` — env + PATH probes**
   - `runDoctorCommand()` probes 7 tools via `spawnSync` (8s timeout, first stdout line, truncated to 120 chars): `r2 -v`, `dot -V`, `java -version`, `adb version`, `wasm2wat --version`, `npx playwright --version`, plus `process.version` for Node.
   - Download hints come from `mergedCatalog()` (`katalogUrl()`); doctor never downloads.
2. **`src/facade/catalogMerge.ts` — mergedCatalog (16 entries)**
   - 8 conduit (from `src/conduit-core/catalog.ts`): `radare2`, `graphviz`, `x64dbg`, `python64`, `python32`, `cdb`, `frida`, `scyllahide`.
   - 8 rea: `hopper`, `ghidra`, `ida`, `jeb`, `jadx`, `apktool`, `wabt`, `binwalk`.
   - Every entry carries `url` + `nereye` (where to install / which env var, e.g. `REA_GHIDRA_DIR`, `REA_IDA_URL`, `REA_JEB_MCP_URL`, `REA_HOPPER_PATH`, `REA_WABT_BIN`, `JAVA_HOME`, `DBG_BRIDGE_R2`).
3. **`src/conduit-core/prereq.ts` + `prerequisites` tool — runtime check**
   - PATH scan (`pathDirs()` + `findOnPath()`), env overrides (`DBG_BRIDGE_R2`, `CDB_DIR`, `X64DBG_DIR`), `ToolStatus{ id, durum: var|yok, yol, oneri, indir, nereye }`.
   - `prerequisites` is a frozen conduit name (`src/facade/toolNamespace.ts`, 30 names); rea-side collisions must use `rea_` prefix (`qualifyReaTool()`, `assertNoCollision()`).
4. **`src/facade/sessionRouter.ts` — conduit vs rea-domains**
   - `CONDUIT_ENGINES = { radare2, x64dbg, cdb, frida }` → `"conduit"`; everything else (`hopper`, `ghidra`, `ida`, `jeb`, `jadx`, `apktool`, `adb`, `dotnet`, `wasm`, `evm`, `go`, `firmware`, `browser`, `electron`) → `"rea-domains"`.
   - Conduit registry is untouched; rea sessions live in a separate namespace.
5. **Per-tool gates — `capability_unsupported`, never stub**
   - `src/rea-domains/android/JadxBridge.ts`: `kapi()` = `jdkTamam()` (java/JAVA_HOME) + `jadxTamam()` (headless jadx on PATH).
   - `src/rea-domains/android/ApktoolBridge.ts`: `kapi()` = Java + apktool launcher on PATH.
   - `src/rea-domains/android/AdbBridge.ts`: `adbTamam()` (platform-tools on PATH).
   - `src/rea-domains/wasm-evm/WasmEvmBridge.ts`: wabt candidates probe (`REA_WABT_BIN`, `wasm2wat`, `wat2wasm`); EVM selector is pure offline `keccak256`.
   - `src/rea-domains/ghidra/GhidraProvider.ts`, `hopper/HopperProvider.ts`, `ida/IdaProvider.ts`, `jeb/JebProvider.ts`, `firmware-browser/FirmwareBridge.ts`, `dotnet/ManagedInspector.ts`: missing binding → `{ ok: false, code: "capability_unsupported", reason/neden }` (+ `handoff: "native:binwalk/unblob"` on Linux-only paths).
   - `src/server/registerReaTools.ts`: central rule — unbound tool returns `capability_unsupported`, real work only behind a present binary.

### Request flow examples

- `app.apk` → router: `rea-domains` → `kapi()` in `JadxBridge.ts`: JDK ok + jadx on PATH → `rea_jadx_decompile`; else `capability_unsupported` (no fake output).
- `firmware.elf` → router: `conduit` (`radare2`) → `findRadare2()` in `prereq.ts`; present → `static_info`/`disassemble`; absent → catalog hint (`TOOL_CATALOG[radare2].url`).
- `transfer(address,uint256)` → `rea_evm_selector()` in `WasmEvmBridge.ts` (offline, no probe):

```ts
import { rea_evm_selector } from "./src/rea-domains/wasm-evm/WasmEvmBridge.js";
console.log(rea_evm_selector("transfer(address,uint256)")); // { ok: true, summary: "0xa9059cbb" }
```

## 2. Improvement directions

- Content sniffing: magic bytes (`MZ`, `PK`, `\x7fELF`, WASM `\0asm`) over file extension before routing.
- Confidence scores: per-detector `{ engine, confidence: 0..1 }` instead of binary var/yok.
- Fallback chains: `jadx → apktool` (APK), `ghidra → hopper → ida` (native), `wasm2wat → wat2wasm` already tries candidates — generalize the pattern.
- Cache probe results with TTL: memoize `spawnSync` version checks (~60s), invalidate on PATH/env change.
- Parallel probes: run doctor/prereq checks concurrently (`Promise.all`), not sequentially.
- Structured unsupported reasons: `{ code, missing, install: "<cmd>", url, nereye }` with copy-paste install commands.
- Auto-suggest config: emit `export REA_*=` / `X64DBG_DIR=` snippets from `nereye` fields.
- Telemetry of missing tools: count `capability_unsupported` by `tool × reason` to prioritize packaging/docs.
