# Evidence Workflows — Investigation Recipe

> Scope: turning bridge outputs into defensible, cited findings.
> Rule: each finding carries tool + summary + raw proof, or it is not a finding.

## 1. Open with the common gate

1. Empty/corrupt input must yield `capability_unsupported`, never an empty ok.
2. Forward closed gates upstream unchanged; do not retry with fuzz.
3. Evidence: gate `code`, gate `reason`, input hash.

## 2. Version-diff workflow

1. Order: `rea_diff_match` (pair functions) then `rea_diff_summary` (counts).
2. Confirm renames by re-running `compare_source_to_bundle` on the pair.
3. Evidence: matched pairs, added/removed totals, sample diff lines.

## 3. Crash-timeline workflow

1. Collect crash logs first, then run `rea_crash_timeline` to order them.
2. Correlate native section (`rea_pe_sections`) with crashing module offset.
3. Evidence: ordered timeline, crashing module, offset-to-section mapping.

## 4. Recon-to-harness workflow

1. Order: `rea_recon_funcs` -> `rea_recon_harness` -> `rea_recon_tag`.
2. The harness is a draft: mark unreviewed C code as untested.
3. Evidence: function candidates, harness text, tag string, case id (e.g. 3205).

## 5. Insufficient-evidence close

1. All gates closed: write "insufficient evidence" and name the missing input.
2. Suggest exactly one next collection step (e.g. "provide source map").
3. File checklist result into `docs/AIRGAP.md` verification list.

## 6. Skill-pack hygiene

1. New stable signal: add one reference line, do not bloat bridge code.
2. Keep recipes tool-ordered so the next agent can replay them blind.
3. Link runtime needs to `runtime-observation.md`, never inline them here.
