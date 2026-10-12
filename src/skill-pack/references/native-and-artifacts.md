# Native Artifacts — Investigation Recipe

> Scope: PE (Windows), Mach-O / bundle (Apple), ELF/Dart (Flutter), Go binaries.
> Rule: parse headers read-only; never execute the sample.

## 1. Classify by magic first

1. `MZ` -> PE lane; `cffaedfe/cafebabe` -> Mach-O lane; `7F454C46` -> ELF lane.
2. CLI: `analyze-pe`, `analyze-apple`, `analyze-flutter`, `analyze-go`.
3. Evidence: first-4-bytes hex, file size, source path.

## 2. PE lane (Windows)

1. Bridge order: `rea_pe_info` -> `rea_pe_imports` -> `rea_pe_sections`.
2. Record machine (`0x8664` x64), bitness, entry point, section table.
3. Evidence: `machine_hex`, `entry_hex`, dll list, `dll!func` thunks (max 200).

## 3. Apple lane (Mach-O / bundle)

1. Bridge order: `rea_apple_macho` -> `rea_apple_plist` -> `rea_apple_bundle`.
2. Collect magic, fat flag, dyld paths (max 50), bundle id, executable.
3. Evidence: `sihir`, `dyld[]`, `bundleId`, `macos` + `frameworks` counts.

## 4. Flutter / Go lane (ELF content)

1. Flutter: `rea_flutter_scan` (gate: needs Dart trace) then `rea_flutter_payload`.
2. Go: `rea_go_pclntab` (buildid + pclntab flags) then `rea_go_vendor` (paths).
3. Evidence: `tur`, `buildId`, `motor`, `tahminiFonksiyon`, vendor path list.

## 5. Handle closed gates honestly

1. Gate text (`capability_unsupported`) is a finding, not a failure.
2. Copy `code` + `reason`/`neden` verbatim into the report.
3. Never fall back to strings-guessing as a positive identification.

## 6. Hand off

1. Pack imports/sections/manifest into the evidence bundle.
2. Unresolved native path goes to `evidence-workflows.md` for diffing.
3. Live behavior questions go to `runtime-observation.md`.
