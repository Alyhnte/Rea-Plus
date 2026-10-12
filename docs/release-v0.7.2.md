## Reverse Engine Anything Plus v0.7.2

A correctness and hardening release from a full end-to-end review of the codebase.
No tool was renamed and no tool was removed: the surface stays at **171 live tools**
(30 frozen conduit + 141 rea), now with honest errors, validated inputs, and a
test lane that actually runs.

## Highlights

- `npm start` now starts the real server (`dist/server.js`); it previously pointed at a
  transport-less factory module and exited serving nothing.
- Domain failures are reported as MCP errors (`isError: true`) instead of success.
- Address inputs can no longer inject r2/rizin commands (`;`, `!` shell escapes rejected).
- Tools that returned `ok: true` without doing the work now do it for real — or say so.
- `npm test` runs the real default suite: 43 files / 321 its, all green.

## Fixed

- **Entry point:** `start` script targets `dist/server.js` (same as the `rea-plus` bin).
- **Test script:** `npm test` was pointing outside the repo (`../conduit/...`); it now runs
  `scripts/run-tests.mjs`. The old command survives as `npm run test:golden`.
- **CI honesty:** the workflow claimed "all tests" while running 2 of 49 files. CI now runs
  `npm test` (default lane) and says so.
- **Error envelope:** the rea tool wrapper had no `try/catch` and never set `isError`;
  thrown errors became protocol errors and `{ ok: false }` results looked successful.
- **Missing runtime assets:** the build copies `frida-agent.js` and the Ghidra Python
  scripts into `dist/` (`scripts/copy-assets.mjs`); the published Frida engine no longer
  dies with `engine_unavailable`. The stale `src/engines` fallback path was corrected.
- **Version drift:** one truth everywhere — `package.json`, `server.json`, and the server
  banner all report **0.7.2** (the v0.7.1 release still identified as 0.7.0 at runtime).
- **Publish safety:** `prepublishOnly` builds first, so a fresh clone cannot publish a
  dist-less package.
- **Cutter decompile:** the `pdf` fallback ran without analysis and returned `ok` with an
  empty body; it now runs `aaa;pdf` and an empty result is `capability_unsupported`.
- **Corpus setup:** `korpus-kur` copied fixtures from author-machine Temp paths and crashed
  elsewhere; missing sources now keep the tracked corpus. The idempotency test measures
  the second run, as its name says.

## Security

- **Command injection:** address arguments are validated in the MCP schemas and again in
  the Cutter/R2Plus bridges (hex, decimal, or symbol names only).
- **cmd.exe shim:** radare2's Windows shim rejects cmd metacharacters (`%`, `&`, `|`, `"`,
  …) instead of quoting around them, and shutdown tree-kills the process so `r2.exe`
  grandchildren are not orphaned.
- **SSRF:** `rea_jeb_sorgu` only POSTs to loopback by default. Remote targets require the
  operator opt-in `REA_JEB_ALLOW_REMOTE=1`; link-local and cloud-metadata hosts are
  always blocked.
- **Unauthenticated HTTP:** when `DBG_BRIDGE_TOKEN` is unset, the server still starts for
  local use but prints a loud warning that HTTP auth is disabled.

## Honesty (no more fake `ok`)

- **`rea_dotnet_metadata`** checked only the `MZ` magic, so every native PE counted as
  ".NET" (and unpack routing believed it). It now verifies the real CLR data directory
  in-process; external readers are reported, not required.
- **`rea_pwn_elf_layout`** returned `ok: true` with a "queued" summary and did nothing.
  It now returns `capability_unsupported` until pwntools is actually wired.
- **`stdout_sha256_kısa`** was FNV-1a despite the name; it is now a real SHA-256 prefix.
- **Fake PTY removed:** process capture always used pipes while sometimes claiming a PTY
  channel, and `rea_process_compare` diffed pipe against itself. The channel is honestly
  `pipe`, and compare returns `capability_unsupported` until a real PTY exists.
- **`rea_net_capture`** ignored the given URL and captured traffic to its own decoy
  server. It now requests the given localhost URL through the proxy; the decoy remains
  only for `data:` inputs and is labeled in the summary.

## Robustness

- **Frida timeouts:** agent RPCs (`callAgent`, `describe`) are bounded by
  `DBG_BRIDGE_FRIDA_TIMEOUT_MS` (default 30s); a wedged agent no longer hangs a tool call.
- **Frida cleanup:** a failed inject detaches and unregisters the half-open session
  instead of leaking it (the `attach` path had no cleanup at all).
- **Checkpoint safety:** re-open and re-attach clear the previous target's checkpoints,
  so `rewind` cannot write one process's memory/registers into another.
- **Session overwrite race:** concurrent re-open on x64dbg/cdb/Frida no longer orphans
  the overwritten debugger process.

## Tests & verification

- New `tests/fixes-regression.test.mjs` (12 its) locks these fixes in; it was red on the
  unfixed code and is green now.
- New test runner (`scripts/run-tests.mjs`): per-file 90s cap, process-tree kill on
  timeout, and it never hangs on inherited pipes.
- Default lane: **43/43 files pass**. Live-injection/debugger, packet-capture, browser,
  e2e, and local-Ghidra suites are excluded by default and run via `npm run test:live`
  (VM or dedicated CI job) — they spawn or inject into real processes.
- Verified end to end over HTTP: `initialize` reports `rea-plus 0.7.2`, `tools/list`
  returns 171 tools, an injection attempt (`0x10;!calc`) is rejected by schema
  validation, and a gated domain result comes back with `isError: true`.

## Known limitations

- Destructive-tool MCP annotations are deferred: the bundled SDK v2 surface does not
  expose a verifiable annotations field.
- Some provider tools remain thin (e.g. jadx manifest/class fields, browser scenario
  recording); they are tracked in the review report for a follow-up release.
- The local-Ghidra suites (`ghidra-full`, `ghidra-prof2`) need a machine-local Ghidra
  install and are not part of the default lane.

## Upgrade notes

- No breaking changes to tool names or transports. Two behavior changes to know:
  domain failures now surface as `isError: true` (clients that treated them as success
  will see errors), and `rea_process_compare` returns `capability_unsupported` on every
  platform until a real PTY lands.
- Rebuild after upgrading: `npm ci && npm run build` (build now also copies assets).
