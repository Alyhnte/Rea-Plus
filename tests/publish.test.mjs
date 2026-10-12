import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const server = JSON.parse(readFileSync(path.join(root, "server.json"), "utf8"));
const npmignorePath = path.join(root, ".npmignore");
const npmignore = existsSync(npmignorePath) ? readFileSync(npmignorePath, "utf8") : "";

describe("publish hazirligi", () => {
  it("package.json files alani beklenen girdileri icerir", () => {
    assert.ok(Array.isArray(pkg.files), "files dizi olmali");
    for (const f of ["dist/", "README.md", "LICENSE", "server.json", "configs/"]) {
      assert.ok(pkg.files.includes(f), `files ${f} icermeli`);
    }
  });

  it("publishConfig public", () => {
    assert.equal(pkg.publishConfig?.access, "public");
  });

  it("server.json version == package.json version", () => {
    assert.equal(server.version, pkg.version);
  });

  it("bin yollari dist altinda", () => {
    assert.ok(pkg.bin?.["rea-plus"], "bin.rea-plus tanimli olmali");
    assert.ok(pkg.bin?.["rea-plus-cli"], "bin.rea-plus-cli tanimli olmali");
    for (const [name, target] of Object.entries(pkg.bin)) {
      assert.match(target, /^\.?\.?\/?dist\//, `${name} dist altinda olmali: ${target}`);
    }
    assert.ok(existsSync(path.join(root, "dist/server.js")), "dist/server.js mevcut olmali");
    assert.ok(existsSync(path.join(root, "dist/cli/index.js")), "dist/cli/index.js mevcut olmali");
  });

  it(".npmignore dist'i engellemiyor", () => {
    assert.ok(existsSync(npmignorePath), ".npmignore mevcut olmali");
    const lines = npmignore.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    assert.ok(!lines.some((l) => l === "dist" || l === "dist/" || l.startsWith("dist/")), ".npmignore dist satiri icermemeli");
    assert.ok(!npmignore.includes("dist"), ".npmignore hicbir yerde dist gecirmemeli");
  });

  it("keywords beklenenleri icerir + version 0.6.0", () => {
    assert.equal(pkg.version, "0.6.0", "version elleme: 0.6.0");
    for (const k of ["ghidra", "cutter", "jadx", "apktool", "wasm", "evm", "firmware", "playwright"]) {
      assert.ok(pkg.keywords?.includes(k), `keywords ${k} icermeli`);
    }
  });

  it("repository/homepage/bugs Alyhnte/ReaPlus", () => {
    assert.equal(pkg.repository?.type, "git");
    assert.equal(pkg.repository?.url, "https://github.com/Alyhnte/ReaPlus");
    assert.equal(pkg.homepage, "https://github.com/Alyhnte/ReaPlus");
    assert.equal(pkg.bugs?.url, "https://github.com/Alyhnte/ReaPlus/issues");
  });
});
