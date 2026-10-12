## Reverse Engine Anything Plus v0.7.4

Distribution release: rea-plus is now genuinely easy for *other people* to install,
and a packaging bug that would have stopped every package consumer at boot is fixed.

## Highlights

- **One-command install, no clone:** `npx -y github:Alyhnte/ReaPlus` builds and runs
  (cold start to `tools/list` verified at ~31s, 171 tools).
- **One-click client setup:** Add-to-Cursor and Install-in-VS-Code badges in the README,
  plus ready-made configs for Claude Desktop/Code, Cursor, VS Code, Windsurf, Codex,
  and opencode under `configs/`.
- **Docker:** `docker build` works today; this release also publishes
  `ghcr.io/alyhnte/reaplus` automatically.
- **New README:** live badges, architecture diagram, per-client collapsibles, an
  environment-variable table, and an honest security model.

## Fixed

- **Consumer boot crash (important):** Playwright was a `devDependency` imported
  statically by product code, so installing the package and starting the server died
  with `ERR_MODULE_NOT_FOUND`. Playwright is now loaded lazily and is a documented
  optional extra; the server boots without it and browser tools return
  `capability_unsupported`. For browser tools: `npm i playwright && npx playwright install chromium`.
  (Found by an end-to-end tarball consumer simulation, now part of the release routine.)

## Added

- `prepare` script so git-based installs build `dist/` automatically.
- `Dockerfile` + `.github/workflows/docker.yml` (release → GHCR push; manual runs
  build-only by default).
- `smithery.yaml` registry metadata; personal-path examples scrubbed from `configs/`.
- `docs/ROADMAP.md` — the full prioritized roadmap table (distribution, MCP protocol,
  security, engines, domains, behavior, scale, tests, docs).

## Verification

- Tarball consumer simulation: fresh install → stdio `initialize` → `tools/list` = 171,
  with Playwright absent.
- Cold `npx` from GitHub (empty npm cache): init in ~31s including the build, 171 tools.
- Default test lane 43/43 locally; CI green on Ubuntu (Node 20 + 22) for this release.
- Install deeplinks were generated programmatically and verified by decoding.

## Upgrade notes

- No tool or transport changes since v0.7.3. If you embed rea-plus as a dependency and
  used browser tools, add Playwright as shown above.
- npm registry publish is the top roadmap item; until then the GitHub `npx` form above
  is the supported one-command path.
