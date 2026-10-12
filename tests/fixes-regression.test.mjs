// fixes-regression.test.mjs: 2026-10-12 inceleme düzeltmelerinin regresyon kilidi.
// Koş: önce `npm run build`, sonra `node --test tests/fixes-regression.test.mjs`.
// Canlı enjeksiyon/debugger çalıştırmaz; yalnız zarf, şema, başlık ve paket gerçeklerini yoklar.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerReaTools } from "../dist/server/registerReaTools.js";
import { rea_dotnet_metadata } from "../dist/rea-domains/dotnet/ManagedInspector.js";
import { rea_process_run } from "../dist/rea-domains/firmware-browser/ProcessCapture.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const serverJson = JSON.parse(readFileSync(join(root, "server.json"), "utf8"));

// Sahte MCP sunucu: kayıtları yakalar, handler'ları doğrudan çağırmaya izin verir.
function sahteSunucu() {
  const araclar = new Map();
  return {
    araclar,
    registerTool(ad, tanim, is) { araclar.set(ad, { tanim, is }); },
  };
}

describe("paket ve giriş gerçekleri", () => {
  it("start gerçek girişi (dist/server.js) çalıştırır", () => {
    assert.equal(pkg.scripts?.start, "node dist/server.js");
  });
  it("sürüm tek gerçek: package.json == server.json", () => {
    assert.equal(pkg.version, serverJson.version);
    assert.equal(serverJson.packages?.[0]?.version, pkg.version);
  });
  it("prepublishOnly build koşar (dist'siz publish yok)", () => {
    assert.match(pkg.scripts?.prepublishOnly ?? "", /build/);
  });
  it("test scripti repo içini gösterir", () => {
    assert.match(pkg.scripts?.test ?? "", /scripts\/run-tests\.mjs/);
  });
  it("asset'ler dist'e kopyalanır (frida-agent.js + Ghidra .py)", () => {
    assert.ok(existsSync(join(root, "dist/conduit-core/engines/frida-agent.js")), "frida-agent.js dist'te olmalı");
    assert.ok(existsSync(join(root, "dist/rea-domains/ghidra/scripts/DumpFuncs.py")), "DumpFuncs.py dist'te olmalı");
  });
});

describe("registerReaTools hata zarfı", () => {
  const s = sahteSunucu();
  registerReaTools(s);

  it("ok:false zarfı isError olarak raporlanır", async () => {
    const a = s.araclar.get("rea_dotnet_metadata");
    assert.ok(a, "rea_dotnet_metadata kayıtlı olmalı");
    const r = await a.is({ path: "yok/boyle-bir-dll.dll" });
    assert.equal(r.isError, true);
    assert.equal(JSON.parse(r.content[0].text).ok, false);
  });

  it("fırlayan handler protokol hatası değil isError zarfı olur", async () => {
    const a = s.araclar.get("rea_browser_scenario");
    assert.ok(a, "rea_browser_scenario kayıtlı olmalı");
    const r = await a.is({ text: "{" });
    assert.equal(r.isError, true);
    assert.equal(JSON.parse(r.content[0].text).ok, false);
  });

  it("kapı zarfı çift sarılmaz", async () => {
    const a = s.araclar.get("rea_behavior_timeline");
    assert.ok(a, "rea_behavior_timeline kayıtlı olmalı");
    const r = await a.is({ olaylar: "{" });
    assert.equal(r.isError, true);
    const v = JSON.parse(r.content[0].text);
    assert.equal(v.ok, false);
    assert.equal(v.code, "capability_unsupported");
  });

  it("adres girdisi komut enjeksiyonunu şemada reddeder", () => {
    const a = s.araclar.get("rea_cutter_disasm");
    assert.ok(a, "rea_cutter_disasm kayıtlı olmalı");
    const sema = a.tanim.inputSchema;
    assert.equal(sema.safeParse({ path: "x", addr: "0x401000" }).success, true);
    assert.equal(sema.safeParse({ path: "x", addr: "main" }).success, true);
    assert.equal(sema.safeParse({ path: "x", addr: "0x10;!calc" }).success, false);
    assert.equal(sema.safeParse({ path: "x", addr: "0x10 | id" }).success, false);
  });
});

// En küçük PE32+ başlığı: CLR dizini (14) dolu/boş iki varyant.
function sahtePE(clrRva) {
  const b = Buffer.alloc(512);
  b.write("MZ", 0);
  b.writeUInt32LE(128, 0x3c); // e_lfanew
  b.write("PE\0\0", 128);
  b.writeUInt16LE(0x8664, 132); // Machine
  b.writeUInt16LE(1, 134); // NumberOfSections
  b.writeUInt16LE(240, 148); // SizeOfOptionalHeader
  const opt = 152;
  b.writeUInt16LE(0x20b, opt); // PE32+ magic
  b.writeUInt32LE(16, opt + 108); // NumberOfRvaAndSizes
  b.writeUInt32LE(clrRva, opt + 112 + 14 * 8); // DataDirectory[14].VirtualAddress (CLR)
  b.writeUInt32LE(clrRva ? 72 : 0, opt + 112 + 14 * 8 + 4); // .Size
  return b;
}

describe("rea_dotnet_metadata gerçek CLR kontrolü", () => {
  const d = mkdtempSync(join(tmpdir(), "rea-fix-"));
  const nativeYol = join(d, "native.exe");
  const dotnetYol = join(d, "managed.dll");
  writeFileSync(nativeYol, sahtePE(0));
  writeFileSync(dotnetYol, sahtePE(0x2000));

  it("native PE .NET sayılmaz", () => {
    const r = rea_dotnet_metadata(nativeYol);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  it("CLR başlıklı PE .NET sayılır (dış okuyucu şart değil)", () => {
    const r = rea_dotnet_metadata(dotnetYol);
    assert.equal(r.ok, true);
  });
});

describe("rea_process_run dürüst sha256", () => {
  it("stdout_sha256_kısa gerçek sha256'nın ilk 16 hanesidir", () => {
    const r = rea_process_run(process.execPath, { args: ["-e", "process.stdout.write('hello')"] });
    assert.equal(r.ok, true);
    const beklenen = createHash("sha256").update("hello").digest("hex").slice(0, 16);
    assert.equal(r.kayıt.stdout_sha256_kısa, beklenen);
  });
});
