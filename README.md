# rea-plus: Live Debugging + Static Analysis in One MCP

One MCP server for live debugging and static reverse engineering, from app behavior down to native binaries.

[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Node.js >= 20](https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#quick-start)
[![60 live tools](https://img.shields.io/badge/tools-60_live-blue?style=flat-square)](#how-it-works)
[![Catalog 16](https://img.shields.io/badge/catalog-8_conduit_+_8_rea-blue?style=flat-square)](#how-it-works)
[![Tests passing](https://img.shields.io/badge/tests-51_unit_+_e2e-green?style=flat-square)](#tests)

See a feature you like. Understand how it works, from the running process down to the binary level.

rea-plus fuses a frozen live-debug core (conduit) with rea-style static domains behind a single MCP surface:
30 frozen conduit tools plus 30 rea tools, 60 live and verified end to end over real HTTP.
Analysis runs locally; findings carry evidence and state their limits.

## Quick start

Requires Node.js >= 20.

```bash
npm ci
npm run build        # tsc -> dist/
node dist/server.js                               # stdio (default)
node dist/server.js --transport http --port 3848 # HTTP
curl http://127.0.0.1:3848/health
```

HTTP exposes `POST /mcp` (stateless, JSON responses) and `GET /health`.
With a token set, send `Authorization: Bearer $DBG_BRIDGE_TOKEN`.
Conduit defaults to port 3847; rea-plus uses 3848 so they never clash.

### Register with your agent

Ready-made configs live in `configs/cursor`, `configs/opencode`, and `configs/claude-desktop`
(stdio plus HTTP variants). Replace `<REA_PLUS_DIR>` with the repo path, then restart the client.

## What you can analyze

| Target | What rea-plus returns | Engine / requirement |
|---|---|---|
| Native binaries (live) | Breakpoints, stepping, registers, callstack, memory, threads, timing | x64dbg / cdb / Frida via conduit-core |
| Hardware breakpoints | Execute/read/write slots 0..3, ScyllaHide plugin rows | Frida engine, x64dbg plugin dir |
| Native binaries (static) | Disassembly, CFG, xrefs, strings, sections, dumps | radare2 |
| Hopper / Ghidra / IDA / JEB | Provider-backed inspection units, digests, pseudo-code | Caller-supplied installs (see FAQ) |
| .NET assemblies | Metadata, CIL, declared native dependencies | Static only, no runtime needed |
| Android APKs | Manifest declarations, classes, methods | Headless jadx 1.5.6 + full JDK |
| Android devices | Devices, packages, processes, logs, captures | Caller-supplied adb 1.0.41 |
| Android resources | Decoded manifest, string tables, locales | apktool launcher on PATH |
| WASM artifacts | Validation, sections, exact import/export WAT forms | wabt 1.0.42 |
| EVM bytecode | Dispatch selectors, byte offsets, arguments | Offline keccak (js-sha3); `transfer(address,uint256)` -> `0xa9059cbb` |
| Firmware | Regions, extraction results, native handoffs | binwalk / unblob, Linux-only |
| JS / Electron bundles | Modules, source maps, diffs, recon summaries | Static only |
| Websites | HAR imports, recorded scenarios, network observations | Browser HAR / Playwright 1.64.0 |
| Process behavior | Run records, output comparisons, capability probes | Process capture (PTY) |
| DOS / MIPS / AOT / Go | MZ checks, MIPS pre-scan, NativeAOT signals, Go build info | Static inspection |

## How it works

Your agent calls rea-plus through MCP; rea-plus inspects the target and returns findings with evidence.
Live-debug operations that mutate target state require `confirm:true`, otherwise they return
`confirmation_required`. The same workflows are available from the terminal via the rea-plus CLI.

- **Frozen core.** The 30 conduit tool names are immutable, locked by `src/facade/toolNamespace.ts`
  (`FROZEN_CONDUIT_TOOLS.length === 30`). Renaming is forbidden, so conduit clients keep working.
- **rea domains.** 30 `rea_*` tools register in a single loop (`src/server/registerReaTools.ts`).
  Missing backends answer `capability_unsupported` with an install hint; nothing fakes a result.
- **Evidence.** Runs can emit an evidence bundle plus an obligation ledger
  (`advance` / `verify` chain) for auditable investigations.
- **Compact schema.** The tool surface stays small and every tool is live: e2e spawns the real
  server and walks `/health` -> `tools/list` over HTTP.
- **Catalog.** `mergedCatalog()` merges 8 conduit + 8 rea prerequisite entries (16 total);
  `doctor` reports versions and download links from that single source.

## CLI

```bash
node dist/cli/index.js analyze-evm "transfer(address,uint256)"
# transfer(address,uint256) -> 0xa9059cbb
node dist/cli/index.js analyze-evm "approve(address,uint256)" --json
# {"ok":true,"sig":"approve(address,uint256)","selector":"0x095ea7b3"}
node dist/cli/index.js analyze-wasm sample.wat --json
node dist/cli/index.js analyze-js bundle.js bundle.js.map
node dist/cli/index.js doctor --json
```

`analyze-evm` is fully offline (keccak, first 4 bytes).

## Tests

12 files: 51 unit its plus smoke, namespace, CLI, and e2e lanes. `tsc` is clean.

```bash
node --test tests/             # everything (pass 51, fail 0)
node --test tests/evm.test.mjs # selectors: transfer / approve
node --test tests/wasm.test.mjs
node tests/namespace.test.mjs  # prefix + collision lock
node tests/reaplus.smoke.mjs   # frozen=30, catalog=16
node tests/e2e.http.mjs        # spawn -> /health -> tools/list
```

Details: `docs/VERIFY.md`, `docs/PLAN-HEPSI.md`, `docs/MCP-CONTRACTS.md`, `CHANGELOG.md`.

## Roadmap

- Wire real backends behind the `capability_unsupported` tools (provider installs detected via `doctor`).
- Win32 prebuild for `src/native-windows` (`REA_NATIVE_PREBUILD=1`, SHA256-sealed, hashed into the evidence bundle).
- More provider handoffs and recorded-crash timelines.

## FAQ

**Do I need Hopper, Ghidra, IDA, or JEB?**
Deep provider-backed analysis uses your own installations. Static JS, .NET, WASM/EVM, and offline
inspection work without them. JEB is reached through a caller-started client (`REA_JEB_MCP_URL`).

**Are commercial tools included?**
No. Hopper, IDA, and JEB are license-required and caller-supplied; rea-plus grants no tool license,
key, or activation. Binwalk/unblob paths are Linux-only.

**Why does a tool return `capability_unsupported`?**
The backend is not installed on this machine. The response names the missing capability and where to
get it (same source `doctor` reads). Install it and the tool lights up; no code changes needed.

**Why do live operations need `confirm:true`?**
They mutate a running target (breakpoints, stepping, memory). The gate keeps agents from changing
program state by accident.

**Does it clash with conduit?**
No. Conduit defaults to port 3847; rea-plus serves 3848.

**What was added on top of a rea-style base?**
Live Windows debugging (x64dbg / cdb / Frida, 4-slot hardware breakpoints, ScyllaHide rows),
`confirm:true` gates, frozen-tool compatibility, the evidence bundle plus obligation ledger and
compact schema, and the rea-plus CLI (`analyze-evm` / `analyze-wasm` / `analyze-js` / `doctor`).

## Contributing

Open an issue to report a bug or suggest a feature, or send a pull request for code or docs.
Run `npm run typecheck` and `node --test tests/` before submitting; keep conduit tool names frozen.

## License

[MIT](LICENSE).

rea-plus code is MIT licensed. Third-party tools and providers retain their own licenses:
you must legally obtain and be authorized to use commercial tools (including IDA Pro, Hopper,
and JEB) under their vendor terms.
