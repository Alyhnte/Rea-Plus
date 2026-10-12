// configSuggest.test.mjs: MCP snippet + kabuk satırı önerileri.
// Koş: node --test tests/configSuggest.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { suggestConfig, suggestEnv } from "../dist/facade/configSuggest.js";

describe("suggestConfig", () => {
  // Snippet geçerli JSON'dur, mcpServers.rea-plus kökünü taşır.
  it("snippet geçerli JSON ve rea-plus köklü", () => {
    const parsed = JSON.parse(suggestConfig(["jadx"]));
    assert.ok(parsed.mcpServers["rea-plus"]);
  });

  // Taşıma stdio'dur: node + dist/server.js.
  it("stdio ile node dist/server.js çalıştırır", () => {
    const srv = JSON.parse(suggestConfig(["jadx"])).mcpServers["rea-plus"];
    assert.equal(srv.command, "node");
    assert.deepEqual(srv.args, ["dist/server.js"]);
  });

  // Bulunan araçlar REA_* anahtarına dönüşür, bilinmeyen REA_ ile başlar.
  it("bulunanlara göre REA_* env anahtarı üretir", () => {
    const env = JSON.parse(suggestConfig(["jadx", "ghidra", "REA_IDA_URL"])).mcpServers["rea-plus"].env;
    assert.ok("REA_JADX_BIN" in env);
    assert.ok("REA_GHIDRA_DIR" in env);
    assert.ok("REA_IDA_URL" in env);
  });
});

describe("suggestEnv", () => {
  // Windows biçimi setx ile başlar.
  it("win32 formatı setx satırları üretir", () => {
    const out = suggestEnv(["jadx"], "win32");
    assert.match(out, /^setx REA_JADX_BIN ""$/m);
  });

  // Linux biçimi export K="..." kalıbındadır.
  it("linux formatı export satırları üretir", () => {
    const out = suggestEnv(["jadx"], "linux");
    assert.match(out, /^export REA_JADX_BIN=""$/m);
  });
});
