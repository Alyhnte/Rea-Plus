# Android Applications — Investigation Recipe

> Scope: APK, HAP (Harmony), and Flutter-embedded Android binaries.
> Rule: offline first, never invent findings; propagate `capability_unsupported`.

## 1. Identify the container

1. Run `file` + check magic: `PK` means APK/HAP (zip), ELF means native lib.
2. CLI: `rea-plus analyze-hap <app.hap> --json` for Harmony packages.
3. Evidence: container type, zip comment, total entry count.

## 2. List contents before extracting

1. Bridge: `rea_hap_liste(path)` returns central-directory names.
2. Look for `config.json` / `module.json`, `classes.dex`, `lib/*/libapp.so`.
3. Evidence: file list (first 100), dex count, native-lib paths.

## 3. Parse the manifest

1. Bridge: `rea_hap_manifest(path)` parses `config.json` (fallback `module.json`).
2. Record `bundleName` + `version`; if missing, report manifest gate.
3. Evidence: bundle id, version, manifest source path.

## 4. Branch on Flutter embedding

1. If `libapp.so` or `libflutter.so` present, run `rea_flutter_scan(lib)`.
2. Follow with `rea_flutter_payload(lib)` for snapshot trace list.
3. Evidence: `tur` (libapp/libflutter), `buildId`, `motor` rev, trace names.

## 5. Dex and native triage

1. Prefer `jadx` / `apktool` when installed (`rea-plus doctor` shows status).
2. Without them, hash dex files and count `lib/*.so` per ABI.
3. Evidence: dex hashes, ABI list, largest native libs.

## 6. Close or escalate

1. No manifest + no dex + no ELF: write "insufficient evidence", stop.
2. Attach `tool` + `summary` + raw output per finding.
3. Next lane: `native-and-artifacts.md` for `.so`, `runtime-observation.md` for ADB.
