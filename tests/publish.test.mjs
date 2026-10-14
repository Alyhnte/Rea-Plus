import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgRaw = readFileSync(path.join(root, "package.json"));
const serverRaw = readFileSync(path.join(root, "server.json"));
const pkg = JSON.parse(pkgRaw.toString("utf8"));
const server = JSON.parse(serverRaw.toString("utf8"));
const npmignorePath = path.join(root, ".npmignore");
const npmignore = existsSync(npmignorePath) ? readFileSync(npmignorePath, "utf8") : "";

const REGISTRY_NAME = "io.github.Alyhnte/rea-plus";
const REGISTRY_SCHEMA = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
// MCP Registry 2025-12-11 server.schema.json ust duzey alanlari (additionalProperties: false).
const REGISTRY_TOP_FIELDS = new Set([
  "$schema", "name", "title", "description", "version",
  "repository", "websiteUrl", "icons", "packages", "remotes", "_meta",
]);

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

  it("bin yollari npm kanonik biciminde dist altinda", () => {
    assert.deepEqual(pkg.bin, {
      "rea-plus": "dist/server.js",
      "rea-plus-cli": "dist/cli/index.js",
    });
    for (const [name, target] of Object.entries(pkg.bin)) {
      assert.match(target, /^dist\//, `${name} ./ olmadan dist altinda olmali: ${target}`);
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

  it("keywords beklenenleri icerir", () => {
    for (const k of ["ghidra", "cutter", "jadx", "apktool", "wasm", "evm", "firmware", "playwright"]) {
      assert.ok(pkg.keywords?.includes(k), `keywords ${k} icermeli`);
    }
  });

  it("repository/homepage/bugs Alyhnte/ReaPlus", () => {
    assert.equal(pkg.repository?.type, "git");
    assert.equal(pkg.repository?.url, "git+https://github.com/Alyhnte/ReaPlus.git");
    assert.equal(pkg.homepage, "https://github.com/Alyhnte/ReaPlus");
    assert.equal(pkg.bugs?.url, "https://github.com/Alyhnte/ReaPlus/issues");
  });

  it("mcpName ve server.json name Registry adidir", () => {
    assert.equal(pkg.mcpName, REGISTRY_NAME);
    assert.equal(server.name, REGISTRY_NAME);
    assert.equal(server.name, pkg.mcpName);
  });

  it("server.json $schema 2025-12-11 Registry semasidir", () => {
    assert.equal(server.$schema, REGISTRY_SCHEMA);
  });

  it("server.json description 1..100 karakterdir", () => {
    assert.equal(typeof server.description, "string");
    assert.ok(server.description.length > 0, "description bos olmamali");
    assert.ok(server.description.length <= 100, `description <=100 olmali (su an ${server.description.length})`);
  });

  it("server.json repository {url, source:github} bicimindedir", () => {
    assert.deepEqual(server.repository, {
      url: "https://github.com/Alyhnte/ReaPlus",
      source: "github",
    });
  });

  it("server.json sema disi ust alan icermez", () => {
    for (const key of Object.keys(server)) {
      assert.ok(REGISTRY_TOP_FIELDS.has(key), `sema disi ust alan: ${key}`);
    }
    for (const key of ["license", "keywords", "installation", "transports", "engines"]) {
      assert.ok(!(key in server), `${key} server.json'da olmamali`);
    }
  });

  it("server.json packages[0] npm paketine ve surume uyar", () => {
    assert.ok(Array.isArray(server.packages), "packages dizi olmali");
    assert.ok(server.packages.length >= 1, "en az bir package olmali");
    const p0 = server.packages[0];
    assert.equal(p0.registryType, "npm");
    assert.equal(p0.identifier, pkg.name);
    assert.equal(p0.version, pkg.version);
    assert.equal(p0.version, server.version);
    assert.equal(p0.runtimeHint, "npx");
    assert.equal(p0.transport?.type, "stdio");
  });

  it("package.json/server.json BOM'suz UTF-8 JSON'dir", () => {
    for (const [ad, raw] of [["package.json", pkgRaw], ["server.json", serverRaw]]) {
      assert.ok(!(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf), `${ad} BOM icermemeli`);
    }
  });
});
