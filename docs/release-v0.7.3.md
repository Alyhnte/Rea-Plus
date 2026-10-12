## Reverse Engine Anything Plus v0.7.3

CI and portability patch on top of v0.7.2. The default test lane is now green on a
clean machine (Ubuntu CI, Node 20 + 22), not just on the author's Windows box — and
the product no longer contains any machine-specific install paths.

## Highlights

- Default lane: **43/43 test files pass** on Windows (tools present), on Windows with a
  stripped PATH (tools absent), and on Ubuntu CI (Node 20 and 22).
- Zero personal paths left in `src/`, `tests/`, or `scripts/` (verified by grep).

## Fixed

- **Portable fixtures:** tests read the tracked corpus in `tests/corpus/` via
  `import.meta.url` instead of absolute author-machine Temp paths. `korpus-kur`
  refreshes fixtures only when `REA_KORPUS_ELF` / `REA_KORPUS_PE` are set.
- **Honest presence probes:** `spawnSync` does not throw when a binary is missing, so
  try/catch gates silently reported present. Probes (product mitm gate, test gates)
  now check `r.error`/`status`. This also removed a ~13s phantom proxy wait when
  mitmdump is absent.
- **Principled test gates:** when wabt, upx, ilspycmd, dnfile, or Chromium is absent,
  tests assert the `capability_unsupported` gate (or skip visibly) instead of
  expecting author-machine tools. The UPX version is no longer pinned to 5.2.1.
- **Generalized tool discovery (product):** `REA_UPX_BIN`, `REA_WABT_BIN`, and
  `REA_AAPT2_BIN` env overrides + PATH only; personal WinGet/`C:\tools` locations removed.
- **.NET CIL on Linux:** the python search now tries `python`, `python3`, `py` in order
  (previously only `python`); CoreLib discovery prefers `System.Private.CoreLib.dll`
  and searches platform dotnet roots, with `REA_CORELIB_DLL` as an override.
- **Ghidra project dir** lives under the OS temp dir instead of a personal path; the
  local-Ghidra suites require `REA_GHIDRA_DIR` explicitly (no machine default).
- **CLI tests** spawn `process.execPath` instead of relying on `node` being on PATH.
- **Runner diagnostics:** failure tails in CI logs are longer (the previous 5-line tail
  hid assertion details).

## Verification

- Local: `tsc` clean, build clean, `npm test` 43/43 with full tools and 43/43 with a
  stripped PATH; portable-fixture tests also pass from a different working directory.
- CI: branch run green before merge; this release is tagged from a main commit whose
  CI is green on Node 20 + 22.

## Upgrade notes

- No tool or transport changes since v0.7.2. If you relied on the old built-in install
  locations for upx/wabt/aapt2, put them on PATH or set `REA_UPX_BIN` /
  `REA_WABT_BIN` / `REA_AAPT2_BIN`.
- Supersedes v0.7.2, whose CI was red off the author machine (34/43). The v0.7.2
  notes describe the hardening release; v0.7.3 makes its test claims true everywhere.
