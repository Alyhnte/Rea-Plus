# JavaScript Applications — Investigation Recipe

> Scope: Bundled web/mobile JS, source maps, embedded WASM modules.
> Rule: map files are evidence; absence of a map is also evidence.

## 1. Collect the bundle pair

1. Gather `bundle.js` plus optional `bundle.js.map` from the same release.
2. CLI: `rea-plus analyze-js <bundle> [map] --json` for the first summary.
3. Evidence: bundle char length, map presence, tool name.

## 2. Parse the source map

1. Bridge: `rea_js_sourcemap(mapText)` counts `sources[]` + mapping chars.
2. Flag vendored paths (`node_modules`, `vendor/`) vs first-party sources.
3. Evidence: source count, largest sources, mappings length.

## 3. Diff two releases

1. Bridge: `compare_source_to_bundle(a, b)` for line-set `onlyA`/`onlyB`.
2. Then `rea_diff_match` for function pairing, `rea_diff_summary` for counts.
3. Evidence: added/removed line counts, renamed-function candidates.

## 4. Hunt the suspicious chunk

1. Bridge: `rea_recon_funcs` extracts candidates from the suspect chunk.
2. Generate a C harness draft with `rea_recon_harness`, tag via `rea_recon_tag`.
3. Evidence: candidate list, harness draft path, case tag.

## 5. Check embedded WASM

1. CLI: `rea-plus analyze-wasm <file>` for exports + wabt decode gate.
2. CLI: `rea-plus analyze-wasm2 <file>` for section/import tables (no wabt).
3. Evidence: export names, section list, import module/name pairs.

## 6. Close the lane

1. No map + minified single line: report "sources unrecoverable", keep hashes.
2. Every claim needs `tool` + `summary` + raw snippet.
3. Cross-version questions move to `evidence-workflows.md`.
