import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Statik guvenlik testi: .github/workflows/publish.yml canli kosulmadan,
// yalniz metin uzerinden tetikleyici/izin/onay/token kosullari dogrulanir.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wfPath = path.join(root, ".github", "workflows", "publish.yml");
const wf = existsSync(wfPath) ? readFileSync(wfPath, "utf8") : "";
const lines = wf.split(/\r?\n/);

function sira(...parcalar) {
  let onceki = -1;
  for (const p of parcalar) {
    const idx = wf.indexOf(p);
    assert.ok(idx > onceki, `'${p}' bulunmali ve onceki adimlardan sonra gelmeli (idx=${idx}, onceki=${onceki})`);
    onceki = idx;
  }
}

function publishSatirlari() {
  return lines.filter((l) => l.includes("npm publish"));
}

function kosulSatiri(runParca) {
  const i = lines.findIndex((l) => l.includes(runParca));
  assert.ok(i >= 0, `${runParca} satiri bulunmali`);
  for (let j = i - 1; j >= 0 && j >= i - 4; j--) {
    if (/^\s+if:/.test(lines[j])) return lines[j];
  }
  return "";
}

describe("publish workflow guvenlik kosullari", () => {
  it("publish.yml mevcuttur", () => {
    assert.ok(existsSync(wfPath), ".github/workflows/publish.yml olmali");
    assert.ok(wf.length > 0, "workflow bos olmamali");
  });

  it("yalniz workflow_dispatch tetikleyicisi vardir; push/tag/release/pr/schedule yoktur", () => {
    const onBas = wf.indexOf("\non:");
    const onSon = wf.indexOf("\npermissions:");
    assert.ok(onBas >= 0 && onSon > onBas, "on: blogu permissions oncesinde bulunmali");
    const onBlogu = wf.slice(onBas, onSon);
    assert.ok(onBlogu.includes("workflow_dispatch:"), "workflow_dispatch olmali");
    for (const yasak of ["push:", "pull_request:", "pull_request_target:", "release:", "schedule:", "tags:", "branches:"]) {
      assert.ok(!onBlogu.includes(yasak), `on: blogunda '${yasak}' olmamali`);
    }
  });

  it("mode varsayilani dry-run'dur ve choice dry-run/publish ile sinirlidir", () => {
    assert.match(wf, /mode:[\s\S]*?type:\s*choice[\s\S]*?default:\s*dry-run/, "mode choice + default dry-run olmali");
    assert.match(wf, /options:\s*\n\s*-\s*dry-run\s*\n\s*-\s*publish/, "options sirasi dry-run, publish olmali");
    assert.match(wf, /confirm_publish:[\s\S]*?default:\s*""/, "confirm_publish varsayilani bos olmali");
  });

  it("izinler yalniz contents:read + id-token:write", () => {
    assert.match(wf, /^permissions:\s*\n\s+contents:\s*read\s*\n\s+id-token:\s*write\s*$/m, "permissions tam olarak contents:read + id-token:write olmali");
    for (const yasak of ["write-all", "contents: write", "packages: write", "actions: write", "id-token: read"]) {
      assert.ok(!wf.includes(yasak), `'${yasak}' olmamali`);
    }
  });

  it("Ubuntu + Node 22 + npm registry-url kullanir", () => {
    assert.ok(wf.includes("runs-on: ubuntu-latest"), "ubuntu-latest olmali");
    assert.ok(wf.includes("actions/setup-node@v4"), "setup-node@v4 olmali");
    assert.match(wf, /node-version:\s*22\b/, "Node 22 olmali");
    assert.ok(wf.includes('registry-url: "https://registry.npmjs.org"'), "registry-url npmjs olmali");
    assert.ok(wf.includes("actions/checkout@v4"), "checkout@v4 olmali");
  });

  it("kapilar sirali: npm ci -> typecheck -> build -> npm test -> publish kontrol -> publish", () => {
    sira(
      "run: npm ci",
      "run: npm run typecheck",
      "run: npm run build",
      "run: npm test",
      "Publish kontrol",
      "tests/publish.test.mjs",
      "tests/publish-workflow.test.mjs",
      "node scripts/publish-kontrol.mjs",
      "npm publish --dry-run",
      "npm publish --provenance",
    );
  });

  it("dry dal yalniz dry-run modunda npm publish --dry-run calistirir", () => {
    assert.ok(kosulSatiri("npm publish --dry-run").includes("inputs.mode == 'dry-run'"), "dry publish, mode==dry-run kosuluna bagli olmali");
  });

  it("gercek dal ek acik onay guard'ina baglidir ve onaysiz publish is durdurur", () => {
    // Guard adimi: publish modinda onay yoksa exit 1; her publish satirindan once gelir.
    assert.ok(wf.includes("inputs.mode == 'publish' && inputs.confirm_publish != 'PUBLISH'"), "onaysiz publish guard kosulu olmali");
    sira("confirm_publish != 'PUBLISH'", "exit 1", "npm publish --dry-run");
    // Gercek publish adimi: iki kosul birlikte sart.
    const kosul = kosulSatiri("npm publish --provenance");
    assert.ok(kosul.includes("inputs.mode == 'publish'"), "gercek publish mode==publish sarti icermeli");
    assert.ok(kosul.includes("inputs.confirm_publish == 'PUBLISH'"), "gercek publish confirm==PUBLISH sarti icermeli");
  });

  it("tam iki npm publish vardir: biri --dry-run, digeri --provenance", () => {
    const satirlar = publishSatirlari();
    assert.equal(satirlar.length, 2, `tam 2 npm publish olmali, bulundu: ${satirlar.join(" | ")}`);
    assert.ok(satirlar.some((l) => l.includes("--dry-run")), "bir publish --dry-run olmali");
    assert.ok(satirlar.some((l) => l.includes("--provenance") && !l.includes("--dry-run")), "gercek publish --provenance (dry-run'suz) olmali");
  });

  it("token/secret kullanimi yasaktir (Trusted Publishing OIDC)", () => {
    for (const yasak of ["NPM_TOKEN", "NODE_AUTH_TOKEN", "secrets.", "_authToken", "npm config set", "registry-url: http://"]) {
      assert.ok(!wf.includes(yasak), `'${yasak}' workflow'da olmamali`);
    }
  });

  it("diger yasaklar: git push/tag, continue-on-error, canli test", () => {
    for (const yasak of ["git push", "git tag", "continue-on-error", "test:live", "npm install\n", "npm i "]) {
      assert.ok(!wf.includes(yasak), `'${yasak.trim()}' workflow'da olmamali`);
    }
  });
});
