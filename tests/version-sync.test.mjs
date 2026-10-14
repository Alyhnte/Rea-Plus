import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (ad) => JSON.parse(readFileSync(path.join(root, ad), "utf8"));

function constVersion(relPath) {
  const src = readFileSync(path.join(root, relPath), "utf8");
  const m = src.match(/export\s+const\s+REA_PLUS_VERSION\s*=\s*"([^"]+)"/);
  assert.ok(m, `${relPath} icinde REA_PLUS_VERSION sabiti bulunmali`);
  return m[1];
}

describe("surum senkronu (tek otorite: package.json version)", () => {
  const pkg = readJson("package.json");
  const lock = readJson("package-lock.json");
  const server = readJson("server.json");

  it("tum surum alanlari package.json version ile ayni", () => {
    assert.match(pkg.version, /^\d+\.\d+\.\d+$/, "package.json version semver olmali");
    const alanlar = new Map([
      ["package.json version", pkg.version],
      ["package-lock.json version", lock.version],
      ["package-lock.json packages[''] version", lock.packages?.[""]?.version],
      ["server.json version", server.version],
      ["server.json packages[0] version", server.packages?.[0]?.version],
      ["src/server.ts REA_PLUS_VERSION", constVersion("src/server.ts")],
      ["src/facade/createReaPlusServer.ts REA_PLUS_VERSION", constVersion("src/facade/createReaPlusServer.ts")],
    ]);
    for (const [ad, surum] of alanlar) {
      assert.equal(typeof surum, "string", `${ad} tanimli olmali`);
      assert.equal(surum, pkg.version, `${ad} (${surum}) package.json version (${pkg.version}) ile ayni olmali`);
    }
  });

  it("lock/server paket adlari package.json name ile ayni", () => {
    assert.equal(lock.name, pkg.name);
    assert.equal(lock.packages?.[""]?.name, pkg.name);
    assert.equal(server.packages?.[0]?.identifier, pkg.name);
  });

  it("package.json/package-lock.json/server.json BOM'suzdur", () => {
    for (const ad of ["package.json", "package-lock.json", "server.json"]) {
      const raw = readFileSync(path.join(root, ad));
      assert.ok(!(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf), `${ad} BOM icermemeli`);
    }
  });
});
