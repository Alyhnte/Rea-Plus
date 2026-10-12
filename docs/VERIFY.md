# VERIFY — rea-plus v0.1.0

## 1) Derleme

```powershell
npm run typecheck   # tsc --noEmit, hata vermemeli
npm run build       # tsc -> dist/
```

## 2) Testler (tests/, 32 dosya, 220 it)

```powershell
node --test tests/auth.test.mjs
node --test tests/compact.test.mjs
node --test tests/concurrency.test.mjs
node --test tests/evidence.test.mjs
node --test tests/evm.test.mjs
node tests/namespace.test.mjs
node --test tests/obligation.test.mjs
node --test tests/process.test.mjs
node tests/reaplus.smoke.mjs
node --test tests/wasm.test.mjs
node --test tests/sniff.test.mjs
node --test tests/confidence.test.mjs
node --test tests/fallback.test.mjs
node --test tests/missing.test.mjs
node --test tests/probe.test.mjs
node --test tests/configSuggest.test.mjs
node --test tests/telemetry.test.mjs
node --test tests/cutter.test.mjs
node --test tests/jadx-full.test.mjs
node --test tests/ghidra-full.test.mjs
node --test tests/ghidra-prof2.test.mjs
node --test tests/apk-adb2.test.mjs
node --test tests/wasm-evm2.test.mjs
node --test tests/dotnet-cil.test.mjs
node --test tests/r2plus.test.mjs
node --test tests/fridaplus.test.mjs
node --test tests/browser2.test.mjs
node tests/cli.test.mjs
node tests/e2e.http.mjs
```

Tek komut: `node --test tests/` (32 dosya koşar).
`namespace` + `smoke` + `cli` + `e2e` assert-tipidir (`it` sayılmaz); 28 dosyada 220 `it` vardır.

## 3) Beklenen yeşil çıktı

- `namespace`: `OK: health->rea_health disassemble->rea_disassemble`
- `smoke`: `OK: transfer=0xa9059cbb approve=0x095ea7b3` + `OK: frozen=30 katalog=24`
- `evm`: `transfer(address,uint256) -> 0xa9059cbb` davası geçer.
- `node --test`: `pass 220, fail 0` (assert dosyaları ayrıca exit 0).

## 4) Golden satır-sonu notu

Golden karşılaştırmalarda `CRLF -> LF` normalize edilir
(`radare2.ts`/`cdb.ts`: `replace(/\r\n/g, "\n")`); dosyalar LF sayılır.
