// tests/sea-fizibilite.test.mjs: Node SEA tek-dosya exe fizibilite kanıtları (Dalga J/1).
// - Ağ YOK, büyük binary YOK: yalnızca küçük hello-world blob üretilir (bayt mertebesi).
// - Gerçek exe enjeksiyonu + çalıştırma pilot script'tedir: scripts/sea-build.mjs (manuel koşulur,
//   npx ile postject indirir; sonucu docs/SEA-FIZIBILITE.md belgeler).
// Koş: node --test tests/sea-fizibilite.test.mjs (alternatif: node tests/sea-fizibilite.test.mjs)
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Güncel sentinel (Node docs v26; v24 win-x64 derlemesinde doğrulandı).
// Eski dokümantasyondaki `...ac052938` bu derlemelerde YOKTUR — yanlış fuse ile postject enjeksiyonu başarısız olur.
const SENTINEL = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const ESKI_SENTINEL = "NODE_SEA_FUSE_fce680ab2cc467b6e84043b18ac052938";
// Ölçülen gerçek değer (2026-10-16, frida ^17.18.0): 135.663.104 bayt (~129,4 MiB).
// Eşik bunun altında tutulur ki frida paketi değişse bile "gömülemez kadar büyük native modül" iddiası testte yaşasın.
const FRIDA_MIN_BOYUT = 100_000_000;

let nodeBinary;

before(() => {
  nodeBinary = readFileSync(process.execPath);
});

describe("SEA fizibilite", () => {
  it("node >= 20 (SEA gereksinimi)", () => {
    const [maj] = process.versions.node.split(".").map(Number);
    console.log(`    node sürümü: ${process.versions.node}`);
    assert.ok(maj >= 20, `node ${process.versions.node} SEA için yetersiz (< 20)`);
  });

  it("hello-world SEA blob üretilir (küçük, bayt mertebesi)", () => {
    const dir = mkdtempSync(join(tmpdir(), "rea-sea-"));
    writeFileSync(join(dir, "hello.mjs"), 'console.log("SEA-HELLO-OK");\n');
    writeFileSync(
      join(dir, "sea-config.json"),
      JSON.stringify({ main: "hello.mjs", output: "sea-prep.blob" }),
    );
    execFileSync(process.execPath, ["--experimental-sea-config", "sea-config.json"], {
      cwd: dir,
      timeout: 30_000,
    });
    const boyut = statSync(join(dir, "sea-prep.blob")).size;
    console.log(`    blob boyutu: ${boyut} bayt`);
    assert.ok(boyut > 0, "SEA blob boş üretildi");
    assert.ok(boyut < 10_000, `hello-world blob beklenenden büyük: ${boyut} bayt`);
  });

  it("node derlemesinde güncel SEA sentinel fuse var (enjeksiyon ön-koşulu)", () => {
    const idx = nodeBinary.indexOf(Buffer.from(SENTINEL));
    console.log(`    sentinel @${idx}`);
    assert.ok(idx >= 0, "güncel sentinel fuse yok — bu node derlemesine SEA enjekte edilemez");
  });

  it("eski sentinel bu derlemede yok (yanlış fuse tuzağı)", () => {
    const idx = nodeBinary.indexOf(Buffer.from(ESKI_SENTINEL));
    console.log(`    eski sentinel @${idx}`);
    assert.equal(idx, -1, "eski sentinel bulundu — fuse varsayımı gözden geçirilmeli");
  });

  it("frida native engeli: frida_binding.node SEA blob'a gömülemez", () => {
    const yol = new URL("../node_modules/frida/build/frida_binding.node", import.meta.url);
    const boyut = statSync(yol).size;
    console.log(`    frida_binding.node: ${boyut} bayt`);
    assert.ok(
      boyut > FRIDA_MIN_BOYUT,
      `frida binding beklenenden küçük: ${boyut} bayt (eşik ${FRIDA_MIN_BOYUT})`,
    );
  });
});
