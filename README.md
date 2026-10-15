<div align="center">

<img src="assets/icon.svg" width="110" height="110" alt="rea-plus logo">

# Reverse Engine Anything Plus

**One MCP server for reverse engineering — live Windows debugging plus a 141-tool static-analysis suite for PE/ELF, .NET, APK, WASM/EVM, firmware, and the web.**

Your agent asks questions; rea-plus inspects the binary and answers with evidence, not guesses.

[![CI](https://github.com/Alyhnte/ReaPlus/actions/workflows/ci.yml/badge.svg)](https://github.com/Alyhnte/ReaPlus/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Alyhnte/ReaPlus?style=flat-square)](https://github.com/Alyhnte/ReaPlus/releases)
[![Tools](https://img.shields.io/badge/MCP%20tools-183-blue?style=flat-square)](#-features)
[![Tests](https://img.shields.io/badge/tests-803%20its%20%2B%20e2e-green?style=flat-square)](#-tests)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)](LICENSE)

[Install](#-install) · [Clients](#-client-setup) · [Docker](#-docker) · [Features](#-features) · [Tools](docs/TOOLS.md) · [How it works](#-how-it-works) · [Security](#-security-model) · [Roadmap](docs/ROADMAP.md) · [FAQ](#-faq)

</div>

---

## ✨ Why rea-plus?

- 🐞 **Real debugging, not screenshots** — x64dbg, cdb (WinDbg), and Frida engines behind one frozen 30-tool core: breakpoints, stepping, registers, memory, call stacks, time-travel checkpoints.
- 🧰 **141 static tools** — Ghidra headless, rizin/radare2, .NET CIL (dnfile) and ILSpy, jadx/apktool/adb, WASM + EVM, firmware, browser/HAR, UPX, PE/ELF/Mach-O readers, and more.
- 🤝 **Honest by design** — a missing backend answers `capability_unsupported` with an install hint. Nothing fakes a result, errors come back as proper MCP `isError`, and mutating live-debug calls require `confirm:true`.
- 🧩 **183 tools, 2 resources, 3 prompts** — the full generated catalog lives in [`docs/TOOLS.md`](docs/TOOLS.md); `REA_TOOLSETS` lets small-context clients load only a profile slice (see [Configuration](#-configuration)). Without an HTTP token, only a 44-tool read-only allowlist is registered instead of the full surface.
- 🔌 **Two transports** — stdio for local agents, streamable HTTP (`/mcp` + `/health`, bearer token, localhost Host/Origin validation) for shared setups.
- 🧪 **Proven, not promised** — a 78-file default test lane, Ubuntu CI for the released line, and protocol tests that drive the real compiled server.

```console
$ rea-plus-cli doctor            # what is installed on this machine, what is missing
$ rea-plus-cli analyze-evm "transfer(address,uint256)"
transfer(address,uint256) -> 0xa9059cbb
```

```jsonc
// One MCP call your agent makes:
{ "name": "rea_investigate", "arguments": { "path": "sample.exe" } }
// -> sniff + confidence + provider plan + evidence bundle, in one answer
```

## 🚀 Install

> **Requirements:** Node.js ≥ 20. Everything else (Ghidra, rizin, jadx, Frida tooling, …) is optional — tools light up as backends appear; run `doctor` to see your machine's map. Windows is required for the live debuggers (x64dbg/cdb/Frida attach); static analysis runs anywhere.

### One-click (Cursor / VS Code)

[![Add to Cursor](https://img.shields.io/badge/Add%20to%20Cursor-000000?style=for-the-badge&logo=cursor&logoColor=white)](https://cursor.com/install-mcp?name=rea-plus&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsInJlYS1wbHVzIl19)
[![Install in VS Code](https://img.shields.io/badge/Install%20in%20VS%20Code-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=rea-plus&config=%7B%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22rea-plus%22%5D%7D)

### npx (no clone)

Any stdio MCP client can launch it straight from the npm registry:

```json
{
  "mcpServers": {
    "rea-plus": {
      "command": "npx",
      "args": ["-y", "rea-plus"]
    }
  }
}
```

> **Publishing status:** `rea-plus@0.8.0` is live on the [npm registry](https://www.npmjs.com/package/rea-plus) and [`io.github.Alyhnte/rea-plus`](https://registry.modelcontextprotocol.io) is published on the MCP Registry. The supported installs are `npx -y rea-plus` (above) and GHCR (see [Docker](#-docker)).

### Clone & build

```bash
git clone https://github.com/Alyhnte/ReaPlus.git
cd ReaPlus
npm ci
npm run build        # tsc + runtime assets (frida-agent.js, Ghidra scripts) -> dist/
npm start            # stdio server (dist/server.js)

# Optional HTTP transport:
node dist/server.js --transport http --port 3848
# -> GET  http://127.0.0.1:3848/health
# -> POST http://127.0.0.1:3848/mcp
```

### Optional extras

```bash
# Browser tools (Playwright is an optional dependency, loaded lazily):
npm i playwright && npx playwright install chromium
```

Then point your agent at it and ask it to inspect something.

## 🔌 Client setup

Every client below gets the same server. Ready-made files live in [`configs/`](configs/).

<details>
<summary><strong>Claude Desktop</strong></summary>

Add to `claude_desktop_config.json` (see [`configs/claude-desktop/`](configs/claude-desktop/claude_desktop_config.stdio.json)):

```json
{
  "mcpServers": {
    "rea-plus": { "command": "npx", "args": ["-y", "rea-plus"] }
  }
}
```

</details>

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add rea-plus -- npx -y rea-plus
```

Or drop [`configs/claude-code/.mcp.json`](configs/claude-code/.mcp.json) into your project root.

</details>

<details>
<summary><strong>Cursor</strong></summary>

Click **Add to Cursor** above, or use [`configs/cursor/mcp.stdio.json`](configs/cursor/mcp.stdio.json) (clone path form) / [`mcp.http.json`](configs/cursor/mcp.http.json) (HTTP form).

</details>

<details>
<summary><strong>VS Code</strong></summary>

Click **Install in VS Code** above, or copy [`configs/vscode/mcp.json`](configs/vscode/mcp.json) to `.vscode/mcp.json` in your workspace.

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Use [`configs/windsurf/mcp_config.json`](configs/windsurf/mcp_config.json) as your `mcp_config.json`.

</details>

<details>
<summary><strong>Codex</strong></summary>

Append [`configs/codex/config.toml`](configs/codex/config.toml) to `~/.codex/config.toml`:

```toml
[mcp_servers.rea-plus]
command = "npx"
args = ["-y", "rea-plus"]
```

</details>

<details>
<summary><strong>opencode / generic HTTP</strong></summary>

```bash
DBG_BRIDGE_TOKEN=your-secret node dist/server.js --transport http --port 3848
# clients connect to http://127.0.0.1:3848/mcp with Authorization: Bearer <token>
```

See [`configs/opencode/`](configs/opencode/opencode.stdio.json) for stdio and HTTP variants.

</details>

## 🐳 Docker

```bash
# Build locally (works today):
docker build -t rea-plus .

# stdio (for MCP clients that spawn containers):
docker run -i --rm rea-plus

# HTTP:
docker run -p 3848:3848 -e DBG_BRIDGE_TOKEN=your-secret rea-plus --transport http --port 3848 --host 0.0.0.0
```

Images are published to GHCR on each release (`ghcr.io/alyhnte/reaplus`). Windows-only
debuggers (x64dbg/cdb) report `capability_unsupported` inside a Linux container; static
analysis, the CLI, and both transports work.

## 🧰 Features

The complete, generated reference — **183 tools + 2 resources (`rea-plus://server-info`, `rea-plus://capabilities-safety`) + 3 prompts (`packer-triage`, `dotnet-malware-triage`, `android-triage`)** — is in [`docs/TOOLS.md`](docs/TOOLS.md). The table below is only a domain summary.

| Domain | What you get | Engine / backend |
|---|---|---|
| Live debugging | Breakpoints, step/continue, registers, memory, call stacks, checkpoints & rewind | x64dbg · cdb · Frida · radare2 (conduit core, 30 frozen tools) |
| Native static (PE/ELF) | Disassembly, CFG, xrefs, strings, imports, PDB/DWARF, decompile | Ghidra headless · rizin/Cutter |
| .NET | Real CLR detection, CIL dump via dnfile, ILSpy decompile | dnfile · ilspycmd |
| Android | APK decode/build, framework info, adb bridge | jadx · apktool · aapt2 · adb |
| Dynamic instrumentation | Attach/spawn, API tracing, conditional breakpoints, process pause | Frida 17 |
| Behavior | Process runs with SHA-256 records, network capture (HAR), event timelines | mitmproxy · process capture |
| Web / browsers | Navigation, clicks, screenshots, storage & console capture | Playwright (optional extra) |
| WASM / EVM | Validation (wabt), disassembly, function selectors, opcode work | wabt · offline keccak |
| Firmware & exotic | Firmware triage, DOS/MIPS/AOT/Go pre-scans, packer hunt (UPX→.NET→dump recipe) | Static inspection · UPX |
| Investigation | One-call triage: sniff → confidence → provider plan → evidence bundle | `rea_investigate` orchestrator |
| Assistance | Capability probing + caching, fallback chains, config suggestions, telemetry | Built-in, offline |

## ⚙️ How it works

```mermaid
flowchart LR
    A["AI agent / MCP client"] -->|stdio or streamable HTTP| S["rea-plus server"]
    S --> C["Conduit core · 30 frozen tools<br/>x64dbg · cdb · Frida · radare2"]
    S --> D["rea domains · 141 tools<br/>Ghidra · rizin · jadx · dnfile · wabt · Playwright"]
    C --> T["Target binary / live process"]
    D --> T
    C --> E["Evidence bundle + obligation ledger"]
    D --> E
    E --> A
```

- **Frozen core.** The 30 conduit tool names are immutable (`src/facade/toolNamespace.ts`); renames are forbidden, so existing conduit clients keep working.
- **rea domains.** 141 `rea_*` tools register centrally in `src/server/registerReaTools.ts`.
- **Confirm gates.** Live operations that mutate a target require `confirm:true`; otherwise you get `confirmation_required`, never a silent side effect.
- **One catalog.** `mergedCatalog()` (8 conduit + 16 rea prerequisite entries) is the single source `doctor` reads for versions and download links.
- **Resources + prompts.** Two static, read-only resources (`rea-plus://server-info`, `rea-plus://capabilities-safety`) and three side-effect-free prompts (`packer-triage`, `dotnet-malware-triage`, `android-triage`) are registered alongside the tools; prompts only return text and never run a tool.
- **Typed outputs (partial).** `structuredContent` mirrors the text JSON, and coverage is deliberately partial: 179 tools declare an `outputSchema` and 172 tools carry annotations. Tools outside the schema set return text JSON without a declared output schema — see [`docs/TOOLS.md`](docs/TOOLS.md) per tool.
- **Toolset profiles.** `REA_TOOLSETS` filters registration to a profile slice (comma-separated union; unknown names fail startup instead of silently falling back to `all`). Resources and prompts are not filtered. New tools land in `all` only (fail-closed).
- **Roots (legacy + modern).** With `REA_ROOTS=1` on the legacy stdio path, client roots can only narrow `REA_WORKSPACE_ROOT`; they can never widen it. Modern-protocol Roots uses the SDK multi-round-trip flow (`inputRequired` + `inputResponses`); `notifications/roots/list_changed` only exists pre-2026, so refresh happens on the next MRTR round.
- **Progress (generalized).** Stage helpers (`createStageProgress`/`onAbort`) pace notifications (~20/s) and clean up on cancel; `rea_process_run` pilot unchanged, `rea_scan_repo` + `rea_jadx_full` staged. Other synchronous handlers remain out of scope.
- **Async jobs (opt-in).** With `REA_ASYNC_JOBS=1`, five job tools (`rea_job_start/status/result/cancel/list`) run whitelisted tools (`rea_process_run`, `rea_scan_repo`, `rea_behavior_run`) through a bounded in-memory queue (2 concurrent). Default surface stays 183 tools; opt-in surface is 188.

## 💻 CLI

The same engines are scriptable from the terminal (`rea-plus-cli`, or `node dist/cli/index.js` in a clone):

```bash
rea-plus-cli analyze-evm "transfer(address,uint256)"     # -> 0xa9059cbb (fully offline)
rea-plus-cli analyze-evm "approve(address,uint256)" --json
rea-plus-cli analyze-wasm sample.wat --json
rea-plus-cli analyze-js bundle.js bundle.js.map
rea-plus-cli doctor --json                                # per-tool readiness report
```

## 🔧 Configuration

All configuration is environment variables — no config files to edit in the server itself.

| Variable | Purpose |
|---|---|
| `DBG_BRIDGE_TOKEN` | Bearer token for the HTTP transport (unset on HTTP = auth off + startup warning + only 44 read-only allowlist tools registered, intersected with `REA_TOOLSETS`; stdio is unaffected) |
| `DBG_BRIDGE_FRIDA_TIMEOUT_MS` | Frida agent RPC timeout (default 30000) |
| `REA_GHIDRA_DIR` | Ghidra installation directory for provider-backed analysis |
| `REA_UPX_BIN` · `REA_WABT_BIN` · `REA_AAPT2_BIN` | Explicit tool paths when not on PATH |
| `REA_JEB_MCP_URL` · `REA_JEB_ALLOW_REMOTE` | JEB endpoint; remote (non-loopback) requires `REA_JEB_ALLOW_REMOTE=1` |
| `REA_CDP_URL` | Attach browser tools to an existing Chrome DevTools endpoint |
| `REA_CORELIB_DLL` | Preferred .NET runtime DLL for CIL inspection |
| `REA_WORKSPACE_ROOT` | Workspace root(s), path-delimiter separated. When set, `rea_*` path arguments, the conduit `open_target`/`debug_open` paths, and user-visible derived writes (`.unpacked`, `.extracted`, HAR output) must resolve inside a root; unset = no restriction. Operator temp/cache surfaces stay outside this boundary by design (browser artifacts dir, Ghidra tmp project/input dirs, the hopper tmp request file, the apktool framework cache) |
| `REA_ROOTS` | Set to exactly `1` to enable the legacy-stdio Roots pilot. Client `file://` roots intersect with and can only narrow `REA_WORKSPACE_ROOT`; modern-protocol Roots is not enabled by this flag |
| `REA_TOOLSETS` | Comma-separated tool profiles to register: `all` (default, 183), `minimal` (8), `static` (98), `android` (27), `dotnet` (20), `web` (26), `debug` (50). Combined profiles union; an unknown or empty name fails startup. Resources/prompts are unaffected |
| `REA_ASYNC_JOBS` | Set to exactly `1` to register the 5 async job tools (176 tools total). Jobs are in-memory only, at most 2 concurrent, and only `rea_process_run` is whitelisted |
| `REA_AUDIT_LOG` | Path of a JSONL audit log (both transports). Each line carries only `ts`, `transport`, `tool`, `durationMs`, `isError` — never arguments, tokens, paths, or target content. A write error warns once and disables auditing instead of crashing the server |
| `REA_HTTP_RATE_LIMIT_PER_MIN` | HTTP requests per client IP per minute (default 120); excess gets `429`. A non-positive-integer value fails startup |
| `REA_HTTP_MAX_CONCURRENT` | Maximum simultaneous in-flight HTTP requests (default 16); excess gets `429`. A non-positive-integer value fails startup |

External tools are discovered from these variables and PATH only — no machine-specific paths are baked in.

## 🔒 Security model

rea-plus is a debugger: by design it can launch, attach to, and instrument local processes. Treat access to it like shell access.

- **stdio first.** The default transport never opens a port.
- **HTTP is locked down.** Bearer token (constant-time compare), localhost Host/Origin validation against DNS-rebinding/CSRF, per-IP rate and concurrency limits (`REA_HTTP_RATE_LIMIT_PER_MIN`, `REA_HTTP_MAX_CONCURRENT`), and — when started without a token — a loud warning plus a reduced surface of 44 read-only, path-free allowlist tools (intersected with `REA_TOOLSETS`) instead of all 171.
- **Workspace boundary (opt-in).** With `REA_WORKSPACE_ROOT` set, `rea_*` path arguments, the conduit `open_target`/`debug_open` paths, and user-visible derived writes must stay inside the root (realpath-checked, so junction/symlink escapes fail). Operator temp/cache surfaces (browser artifacts, Ghidra tmp dirs, the hopper tmp request file, the apktool framework cache) are a documented exception and are not forced inside the root.
- **Audit without content.** `REA_AUDIT_LOG` records one JSONL line per tool call with only time, transport, tool name, duration, and `isError` — never arguments, tokens, paths, or target content.
- **Inputs are validated.** Addresses that reach backend command languages are restricted to hex/decimal/symbol form — no `;`/`!` command injection into r2/rizin.
- **SSRF gate.** Outbound helper calls (e.g. the JEB bridge) are loopback-only unless the operator opts in; link-local/metadata hosts are always blocked.
- **No fake results.** Missing capability ⇒ `capability_unsupported` with a reason; handler errors ⇒ MCP `isError` with the message only (no stack traces).
- **No target execution in static paths.** Inspection tools read bytes; they never run the sample. Run unknown binaries in a VM — that is what the live lane is for.

## 🧪 Tests

79 test files. The default lane (`npm test`) runs 78 files and excludes the live-injection/debugger, packet-capture, browser, e2e, and local-Ghidra suites — those touch real processes or machine-specific installs and belong to a VM or a dedicated CI job (`npm run test:live`). Every file is capped at 90s with process-tree kill, so a hung backend can never hang the lane. The released line's CI runs the default lane on Ubuntu (Node 20 + 22).

```bash
npm test                        # default lane: 78 files (live suites excluded)
npm run test:live               # everything, incl. frida/sniff/browser/e2e/ghidra (VM/CI only)
npm run test:e2e                # spawn -> /health -> tools/list
node --test tests/evm.test.mjs # single-domain runs work too
```

Details: [`docs/VERIFY.md`](docs/VERIFY.md) · [`docs/MCP-CONTRACTS.md`](docs/MCP-CONTRACTS.md) · [`CHANGELOG.md`](CHANGELOG.md)

## 🗺️ Roadmap

Near the top of the list — the full, prioritized table lives in [`docs/ROADMAP.md`](docs/ROADMAP.md):

- npm publish + MCP Registry listing (one-command `npx rea-plus`) — metadata and a manual, dry-run-by-default publish workflow are ready; the actual publish has not happened yet
- Wider `outputSchema` coverage beyond the current 179 tools (183 already carry annotations), progress + cancellation beyond the `rea_process_run` pilot, and a wider async-job whitelist beyond that same pilot tool
- Completing the golden binary corpus (expected-output hashes per provider) — including the still-open live Frida VM check and the DEX golden APK acceptance test
- Syscall/file/registry behavior profiles, repo-scale scanning with a persistent worker
- Signed releases + SBOM, and a documented VM sandbox profile for live work

## ❓ FAQ

**Do I need Ghidra, IDA, Hopper, or JEB?**
No. Static JS/.NET/WASM/EVM and offline inspection work without them; provider-backed depth uses your own installations when present. Commercial tools are never bundled or licensed by rea-plus.

**Why does a tool return `capability_unsupported`?**
Its backend is not installed on this machine. The response names the missing capability and where to get it (the same catalog `doctor` reads). Install it and the tool lights up — no code changes.

**Why do live operations need `confirm:true`?**
They mutate a running target (breakpoints, stepping, memory writes). The gate keeps agents from changing program state by accident.

**Does it clash with conduit?**
No. Conduit defaults to port 3847; rea-plus serves 3848, and the 30 conduit tool names are frozen.

**npm says the package is not found?**
Update your cache — `rea-plus@0.8.0` is on the [npm registry](https://www.npmjs.com/package/rea-plus) and published on the MCP Registry. Use `npx -y rea-plus` everywhere above or the GHCR image.

## 🤝 Contributing

Issues and PRs are welcome — bug reports, feature ideas, docs. Run `npm run typecheck` and `npm test` before submitting, keep conduit tool names frozen, and make new tools fail honestly (`capability_unsupported`, never a fake `ok`).

If rea-plus saved you an afternoon of hex-editor archaeology, a ⭐ helps other reversers find it.

## 📄 License

[MIT](LICENSE). rea-plus code is MIT licensed; third-party tools and providers keep their own licenses — you must legally obtain and be authorized to use commercial tools (IDA Pro, Hopper, JEB) under their vendor terms.

<div align="center">

**Reverse Engine Anything Plus** · built on the conduit live-debug core · [Releases](https://github.com/Alyhnte/ReaPlus/releases) · [Roadmap](docs/ROADMAP.md) · [Changelog](CHANGELOG.md)

</div>


