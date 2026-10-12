# Ghidra (rea-plus)

> Static analysis via Ghidra headless. Target is never executed.
> Missing setup returns `capability_unsupported`, never a stub.

## Setup (no winget, zip + env + JDK)

1. Download the Ghidra zip from https://ghidra-sre.org/, unzip to
   `C:\tools\ghidra\ghidra_12.1.4_PUBLIC` (no winget package is used).
2. Set `REA_GHIDRA_DIR` to that folder (only env, no hidden default).
3. Install JDK 21+ (Ghidra 12 headless needs a JDK, a JRE is not
   enough) and Java 17+ must satisfy `java -version`.
4. Verify `support/analyzeHeadless.bat` exists, then run the tests.

## Tools (8)

| Tool | Input | Output |
|---|---|---|
| `rea_ghidra_analyze` | `path` | import + auto-analysis report |
| `rea_ghidra_funcs` | `path` | function list (`name`, `entry`) |
| `rea_ghidra_disasm` | `path`, `addr` | instruction list (max 50) |
| `rea_ghidra_decompile` | `path`, `addr` | decompiler C (fallback: disasm) |
| `rea_ghidra_strings` | `path` | defined strings (max 200) |
| `rea_ghidra_xrefs` | `path`, `addr` | references to `addr` (empty is valid) |
| `rea_ghidra_caps` | — | install probe (dir + java + headless) |
| `rea_ghidra_seeds` | `path` | entry/seed hints for follow-up tools |

## Headless flow

```text
import -> analyze -> postScript -> deleteProject
```

`analyzeHeadless.bat <projDir> <proj> -import <elf> -postScript ReaDump
<out.json> -scriptPath <dir> -deleteProject`. The `ReaDump` script
dumps funcs/strings/insns/xrefs/decompile to one JSON file.

## First analysis is slow (~1-3 min)

Class search + analyzers run on first launch; later runs reuse the
packed-db cache (`~9-15s` for `mini_branch.elf`). Keep the 300s
per-test timeout.

## Pro tips

- Seeds: start from `entry` (`0x400200`) and `HELLO-FIXTURE` xrefs.
- Language override: `-processor x86:LE:64:default` if auto-detect
  picks the wrong variant; pass `-cspec gcc` for odd ELF files.
- MIPS/PSP firmware stays on the rea side (`DosMipsBridge`,
  `FirmwareBridge`); use Ghidra only for the ELF/PE slice.
