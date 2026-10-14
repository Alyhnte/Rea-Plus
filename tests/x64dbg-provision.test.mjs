// tests/x64dbg-provision.test.mjs: x64dbg bridge oto-provizyonu (Dalga A/4).
// YALNIZ dosya-sistemi seviyesi: geçici dizinler + sahte bridge dosyaları.
// Canlı x64dbg/debugger spawn YOK, gerçek kullanıcı dizinine yazma YOK,
// tests/corpus'a dokunma YOK. Koş: npm run build sonrası
// `node --test tests/x64dbg-provision.test.mjs`.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import {
  reaX64dbgDoctor,
  reaX64dbgSetup,
  resetX64dbgDirCache,
} from "../dist/conduit-core/engines/x64dbg.js";

const sha256 = (yol) => createHash("sha256").update(readFileSync(yol)).digest("hex");

// Sahte vendored kaynaklar (gerçek loader yerine sabit içerik).
const SAHTE_KAYNAKLAR = {
  "prebuilt/x64dbg_mcp_loader.dp64": "SAHTE-DP64-LOADER-v1",
  "x64dbg_bridge_sdk.py": "# sahte sdk v1\n",
  "x64dbg_mcp_bridge.py": "# sahte bridge v1\n",
};
const DEST_ADLAR = ["x64dbg_mcp_loader.dp64", "x64dbg_bridge_sdk.py", "x64dbg_mcp_bridge.py"];

let kok;
let kaynakDir;
let debuggerExe;
let pluginsDir;
let oncekiEnv;

function sahteKaynakYaz(dir) {
  for (const [rel, icerik] of Object.entries(SAHTE_KAYNAKLAR)) {
    const tam = join(dir, ...rel.split("/"));
    mkdirSync(dirname(tam), { recursive: true });
    writeFileSync(tam, icerik);
  }
}

// Gerçek kullanıcı konumu adayları: test bunlara YAZILMADIĞINI kanıtlar.
// (X64DBG_DIR override öncesi, gerçek env ile hesaplanır.)
function gercekAdaylar() {
  const ev = process.env.X64DBG_DIR;
  const yollar = [];
  if (ev !== undefined && ev !== "") yollar.push(ev);
  if (process.platform === "win32") {
    const pf = process.env["ProgramFiles"] ?? "C:\\Program Files";
    yollar.push(join(pf, "x64dbg"), "C:\\x64dbg");
    try {
      yollar.push(join(homedir(), "Tools", "x64dbg"));
    } catch {
      // homedir yoksa atla
    }
  }
  return yollar;
}

let gercekVarlik;

beforeEach(() => {
  oncekiEnv = { X64DBG_DIR: process.env.X64DBG_DIR };
  gercekVarlik = new Map(gercekAdaylar().map((y) => [y, existsSync(y)]));
  kok = mkdtempSync(join(tmpdir(), "x64dbg-prov-"));
  kaynakDir = join(kok, "vendored", "x64dbg");
  sahteKaynakYaz(kaynakDir);
  const archDir = join(kok, "x64dbg-snapshot", "x64");
  mkdirSync(archDir, { recursive: true });
  debuggerExe = join(archDir, "x64dbg.exe");
  writeFileSync(debuggerExe, "SAHTE-EXE");
  pluginsDir = join(archDir, "plugins");
  // Çözümleme geri-dönüşü bile gerçek dizinlere bakmasın.
  process.env.X64DBG_DIR = join(kok, "x64dbg-snapshot");
  resetX64dbgDirCache();
});

afterEach(() => {
  if (oncekiEnv.X64DBG_DIR === undefined) delete process.env.X64DBG_DIR;
  else process.env.X64DBG_DIR = oncekiEnv.X64DBG_DIR;
  resetX64dbgDirCache();
  if (kok && existsSync(kok)) rmSync(kok, { recursive: true, force: true });
});

function gercekDizinTemiz() {
  for (const [yol, vardi] of gercekVarlik) {
    assert.equal(existsSync(yol), vardi, `gerçek konum değişmemeli: ${yol}`);
  }
}

describe("x64dbg bridge provizyonu (yalnız fs seviyesi)", () => {
  it("(a) eksik dosyalar ad + beklenen yol + kaynak ile raporlanır", async () => {
    const rapor = await reaX64dbgDoctor({ arch: "x64", debuggerExe, sourceDir: kaynakDir });
    assert.equal(rapor.ready, false, "kurulum yokken hazır denmemeli");
    assert.equal(rapor.missing.length, 3);
    const adlar = rapor.missing.map((f) => f.ad).sort();
    assert.deepEqual(adlar, [...DEST_ADLAR].sort());
    for (const f of rapor.missing) {
      assert.ok(f.beklenenYol.startsWith(pluginsDir), `beklenen yol plugins altında olmalı: ${f.beklenenYol}`);
      assert.equal(typeof f.kaynak, "string");
      assert.ok(f.kaynak.length > 0, `kaynak boş olmamalı: ${f.ad}`);
    }
    assert.equal(rapor.pluginsDir, pluginsDir);
  });

  it("(b) kurulum geçici dizine yapar, doğrulama geçer", async () => {
    const kur = await reaX64dbgSetup({ arch: "x64", debuggerExe, sourceDir: kaynakDir });
    assert.equal(kur.ready, true);
    assert.equal(kur.alreadyReady, false);
    assert.equal(kur.pluginsDir, pluginsDir);
    assert.equal(kur.installed.length, 3);
    for (const ad of DEST_ADLAR) {
      assert.ok(existsSync(join(pluginsDir, ad)), `${ad} kurulmalı`);
    }
    const rapor = await reaX64dbgDoctor({ arch: "x64", debuggerExe, sourceDir: kaynakDir });
    assert.equal(rapor.ready, true);
    assert.equal(rapor.missing.length, 0);
    assert.equal(rapor.corrupt.length, 0);
    gercekDizinTemiz();
  });

  it("(c) ikinci kurulum idempotent: hazır der, değişiklik yapmaz", async () => {
    await reaX64dbgSetup({ arch: "x64", debuggerExe, sourceDir: kaynakDir });
    const once = new Map(DEST_ADLAR.map((ad) => {
      const yol = join(pluginsDir, ad);
      return [ad, { hash: sha256(yol), mtime: statSync(yol).mtimeMs }];
    }));
    const ikinci = await reaX64dbgSetup({ arch: "x64", debuggerExe, sourceDir: kaynakDir });
    assert.equal(ikinci.ready, true);
    assert.equal(ikinci.alreadyReady, true, "ikinci çalış zaten-hazır demeli");
    assert.deepEqual(ikinci.installed, []);
    for (const ad of DEST_ADLAR) {
      const yol = join(pluginsDir, ad);
      assert.equal(sha256(yol), once.get(ad).hash, `${ad} içeriği bozulmamalı`);
      assert.equal(statSync(yol).mtimeMs, once.get(ad).mtime, `${ad} yeniden yazılmamalı`);
    }
  });

  it("(d) bozuk dosya açık hata verir + yeniden kurulum önerir", async () => {
    await reaX64dbgSetup({ arch: "x64", debuggerExe, sourceDir: kaynakDir });
    writeFileSync(join(pluginsDir, "x64dbg_mcp_bridge.py"), "# BOZULDU\n");
    const rapor = await reaX64dbgDoctor({ arch: "x64", debuggerExe, sourceDir: kaynakDir });
    assert.equal(rapor.ready, false);
    assert.equal(rapor.corrupt.length, 1);
    assert.equal(rapor.corrupt[0].ad, "x64dbg_mcp_bridge.py");
    await assert.rejects(
      reaX64dbgSetup({ arch: "x64", debuggerExe, sourceDir: kaynakDir }),
      /bozuk/i,
      "bozuk dosya varken kurulum açık hata vermeli",
    );
    try {
      await reaX64dbgSetup({ arch: "x64", debuggerExe, sourceDir: kaynakDir });
      assert.fail("hata bekleniyordu");
    } catch (e) {
      assert.match(String(e.message), /yeniden|force/i, "hata yeniden kurulum önermeli");
    }
    const onar = await reaX64dbgSetup({ arch: "x64", debuggerExe, sourceDir: kaynakDir, force: true });
    assert.equal(onar.ready, true);
    const sonra = await reaX64dbgDoctor({ arch: "x64", debuggerExe, sourceDir: kaynakDir });
    assert.equal(sonra.ready, true);
  });

  it("(e) gerçek kullanıcı dizinine yazılmaz", async () => {
    const ev = homedir();
    await reaX64dbgSetup({ arch: "x64", debuggerExe, sourceDir: kaynakDir });
    await reaX64dbgDoctor({ arch: "x64", debuggerExe, sourceDir: kaynakDir });
    assert.ok(pluginsDir.startsWith(kok), "kurulum yalnız geçici kök altında olmalı");
    assert.ok(!pluginsDir.startsWith(ev) || kok.startsWith(ev), "gerçek HOME'a yazılmamalı");
    gercekDizinTemiz();
  });

  it("(f) vendored kaynak yoksa dürüst eksik listesi, sahte hazır yok", async () => {
    const bosKaynak = join(kok, "bos-vendored");
    mkdirSync(bosKaynak, { recursive: true });
    const rapor = await reaX64dbgDoctor({ arch: "x64", debuggerExe, sourceDir: bosKaynak });
    assert.equal(rapor.ready, false, "kaynak yokken hazır denmemeli");
    assert.ok(rapor.missing.length > 0);
    await assert.rejects(
      reaX64dbgSetup({ arch: "x64", debuggerExe, sourceDir: bosKaynak }),
      /eksik|missing|bulunamadı/i,
      "kaynak yokken kurulum sahte hazır dememeli",
    );
  });
});
