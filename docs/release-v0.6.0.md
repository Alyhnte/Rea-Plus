## Added

- rea_behavior_full: single-call behavior report (API + syscall names + file/registry profiles)
- Syscall table (22 Windows x64 entries), file/registry profilers
- PDB path reader (CodeView RSDS), DWARF summary (CU + subprograms), typedef spreader
- rea_scan_repo: repo scan with 4-way queue + mtime cache (.git/node_modules/dist skipped)
- Golden corpus: 5 fixtures (ELF, PE, APK, WASM, JS) + setup script
- npm publish prep: files list, .npmignore, publish check script (no publish yet)
- 7 new MCP tools, 170 live total, 48 test files green

## Fixed

- Version 0.6.0 everywhere
- Removed committed __pycache__ + ignore rule

## Commit

0631c1de4d78644b0a3b2a86db10004b720b90c3
