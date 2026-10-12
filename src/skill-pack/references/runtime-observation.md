# Runtime Observation — Investigation Recipe

> Scope: live behavior (Frida, ADB, process capture, network, browser).
> Rule: static findings come first; runtime only confirms, never replaces them.

## 1. Check prerequisites

1. Run `rea-plus doctor --json` and note frida / adb / playwright rows.
2. Missing tool: record the gate, use the static lane instead.
3. Evidence: `doctor` JSON rows for `frida`, `adb`, `playwright`, `node`.

## 2. Attach with Frida discipline

1. Bridge order: `FridaPlus` session -> `ApiTracer` span -> detach.
2. Tracelist comes from static imports (`rea_pe_imports`, dyld list).
3. Evidence: traced API names, hit counts, session duration.

## 3. Drive Android over ADB

1. Bridge: `AdbBridge` for install/forward/logcat; keep commands read-only first.
2. Pair logcat timestamps with `rea_crash_timeline` ordering.
3. Evidence: device id, logcat window, crash-timeline correlation.

## 4. Capture process and network

1. Bridge: `ProcessCapture` for spawn args, `NetCapture` for flows.
2. Build `BehaviorTimeline` from both; flag beacon intervals.
3. Evidence: process tree, DNS/HTTP endpoints, timeline entries.

## 5. Observe web runtime

1. Bridge: `BrowserBridge` / Playwright for bundle + source-map collection.
2. Save served map files before running `analyze-js` on them.
3. Evidence: served URLs, saved map hashes, console-error list.

## 6. Stop and seal

1. Detach hooks, kill forwards, note exact stop time in the report.
2. Runtime deltas go back into `evidence-workflows.md` diff lane.
3. Unreproducible one-off behavior is marked as such, never generalized.
