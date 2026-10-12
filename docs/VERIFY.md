# VERIFY — rea-plus v0.1.0

## 1) Derleme

```powershell
npm run typecheck   # tsc --noEmit, hata vermemeli
npm run build       # tsc -> dist/
```

## 2) Testler (tests/, 10 dosya, 51 it)

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
```

Tek komut: `node --test tests/` (10 dosya koşar).
`namespace` + `smoke` assert-tipidir (`it` sayılmaz); 8 dosyada 51 `it` vardır.

## 3) Beklenen yeşil çıktı

- `namespace`: `OK: health->rea_health disassemble->rea_disassemble`
- `smoke`: `OK: transfer=0xa9059cbb approve=0x095ea7b3` + `OK: frozen=30 katalog=17`
- `evm`: `transfer(address,uint256) -> 0xa9059cbb` davası geçer.
- `node --test`: `pass 51, fail 0` (assert dosyaları ayrıca exit 0).

## 4) Golden satır-sonu notu

Golden karşılaştırmalarda `CRLF -> LF` normalize edilir
(`radare2.ts`/`cdb.ts`: `replace(/\r\n/g, "\n")`); dosyalar LF sayılır.
