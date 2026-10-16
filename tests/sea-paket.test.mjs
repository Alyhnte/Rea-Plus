// tests/sea-paket.test.mjs: portable node bundle dagitim kapisi (Dalga 4e/sea-dagitim).
// Kapsam: scripts/sea-portable.mjs ciktisi dist-release/rea-plus-portable-<platform>-<arch>/
//   (a) MANIFEST.json surum/platform tutarliligi,
//   (b) node.exe gercek kopya (>50MB) + calisiyor,
//   (c) dist + frida binding dosyasi tasinmis (>100MB; gomu degil dosya),
//   (d) playwright budanmis (devDep; browser domainleri capability_unsupported),
//   (e) duman: paketlenmis node ile analyze-evm selector uretir,
//   (f) DURUSTLUK: tek-dosya exe YOK + MANIFEST.sea.tekDosya {ok:false, neden}.
// Ag YOK, npm ci/install YOK, canli Frida/debugger YOK, kullanici dizinine yazma YOK.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(kok, "package.json"), "utf8"));
const betik = join(kok, "scripts", "sea-portable.mjs");
const dizin = join(kok, "dist-release", `rea-plus-portable-${process.platform}-${process.arch}`);
const nodeExe = join(dizin, process.platform === "win32" ? "node.exe" : "node");
const manifestYolu = join(dizin, "MANIFEST.json");

describe("portable node bundle (sea-portable)", () => {
  before(() => {
    assert.ok(existsSync(betik), "scripts/sea-portable.mjs olmali");
    if (!existsSync(manifestYolu)) {
      execFileSync(process.execPath, [betik], { encoding: "utf8", timeout: 300_000, cwd: kok });
    }
    assert.ok(existsSync(manifestYolu), `MANIFEST.json olmali: ${manifestYolu}`);
  });

  it("(a) MANIFEST surum + platform tutarli", () => {
    const m = JSON.parse(readFileSync(manifestYolu, "utf8"));
    assert.equal(m.surum, pkg.version, "surum package.json ile eslesmeli");
    assert.equal(m.platform, process.platform, "platform bu makine olmali");
    assert.equal(m.mimari, process.arch, "mimari bu makine olmali");
    assert.match(String(m.node?.surum ?? ""), /^v?\d+\./, "node surumu kayitli olmali");
  });

  it("(b) node.exe gercek kopya + calisiyor", () => {
    assert.ok(existsSync(nodeExe), "pakette node olmali (sistem node'unun kopyasi; indirme yok)");
    const boyut = statSync(nodeExe).size;
    console.log(`    paketlenmis node: ${boyut} bayt`);
    assert.ok(boyut > 50_000_000, `node kopyasi beklenenden kucuk: ${boyut} bayt`);
    const out = execFileSync(nodeExe, ["--version"], { encoding: "utf8", timeout: 30_000 });
    assert.equal(out.trim(), process.version, "paket node surumu sistem node ile ayni olmali");
  });

  it("(c) dist + frida binding dosyasi tasinmis", () => {
    assert.ok(existsSync(join(dizin, "dist", "cli", "index.js")), "dist/cli/index.js pakette olmali");
    assert.ok(existsSync(join(dizin, "dist", "server.js")), "dist/server.js pakette olmali");
    assert.ok(existsSync(join(dizin, "package.json")), "package.json pakette olmali");
    const frida = join(dizin, "node_modules", "frida", "build", "frida_binding.node");
    assert.ok(existsSync(frida), "frida_binding.node dosya olarak pakette olmali (gomme yok)");
    const boyut = statSync(frida).size;
    console.log(`    pakette frida_binding.node: ${boyut} bayt`);
    assert.ok(boyut > 100_000_000, `frida binding beklenenden kucuk: ${boyut} bayt`);
  });

  it("(d) playwright pakette YOK (devDep budandi)", () => {
    assert.ok(
      !existsSync(join(dizin, "node_modules", "playwright")),
      "playwright pakette olmamali; browser domainleri capability_unsupported doner",
    );
  });

  it("(e) duman: paketlenmis node analyze-evm calistirir", () => {
    const out = execFileSync(
      nodeExe,
      [join(dizin, "dist", "cli", "index.js"), "analyze-evm", "transfer(address,uint256)", "--json"],
      { encoding: "utf8", timeout: 60_000, cwd: dizin },
    );
    const r = JSON.parse(out);
    assert.equal(r.ok, true, `duman kosusu ok olmali: ${out}`);
    assert.equal(r.selector, "0xa9059cbb", "selector dogru olmali");
  });

  it("(f) DURUSTLUK: tek-dosya exe yok, engel kayitli", () => {
    const m = JSON.parse(readFileSync(manifestYolu, "utf8"));
    assert.ok(!existsSync(join(dizin, "rea-plus.exe")), "tek-dosya exe uretilmemeli (3 engel acik)");
    assert.equal(m.sea?.tekDosya?.ok, false, "sea.tekDosya.ok false olmali");
    assert.ok(
      String(m.sea?.tekDosya?.neden ?? "").length > 20,
      "sea.tekDosya.neden dolu olmali (uydurma yok, gercek engel)",
    );
  });
});
