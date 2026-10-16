import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const mjs = join(kok, "dist-release", "setup.mjs");
const ps1 = join(kok, "dist-release", "setup.ps1");

describe("setup paketleme (standalone release asset'i)", () => {
  before(() => {
    if (!existsSync(mjs)) {
      execFileSync(process.execPath, [join(kok, "scripts", "setup-paketle.mjs")], { encoding: "utf8", timeout: 60000 });
    }
    assert.ok(existsSync(mjs), "dist-release/setup.mjs olmali (node scripts/setup-paketle.mjs)");
    assert.ok(existsSync(ps1), "dist-release/setup.ps1 olmali");
  });

  it("setup.mjs --list calisir, 5 istemci listeler", () => {
    const out = execFileSync(process.execPath, [mjs, "--list"], { encoding: "utf8", timeout: 30000 });
    for (const id of ["cursor", "claude", "vscode", "codex", "windsurf"]) {
      assert.ok(out.includes(id), `${id} listede olmali`);
    }
  });

  it("setup.mjs --dry-run yazmaz, plan gosterir", () => {
    const out = execFileSync(process.execPath, [mjs, "--dry-run", "--client", "cursor"],
      { encoding: "utf8", timeout: 30000, env: { ...process.env, REA_PLUS_SETUP_HOME: join(tmpdir(), "setup-paket-test") } });
    assert.match(out, /kuru-çalıştırma|dry-run/i, "dry-run yazmamali, plan gostermeli");
  });

  it("setup.ps1 node kontrolu + setup.mjs cagrisi icerir", () => {
    const icerik = readFileSync(ps1, "utf8");
    assert.ok(icerik.includes("setup.mjs"), "ps1 setup.mjs'yi cagirmali");
    assert.ok(icerik.includes("nodejs.org"), "node yoksa yonlendirme olmali");
  });
});
