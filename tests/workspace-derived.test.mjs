// workspace-derived.test.mjs: conduit handler kapisi + turev yazma yollari (offline, gercek fs).
// Kos: npm run build sonrasi `node --test tests/workspace-derived.test.mjs` (tsc emit sart).
// Canli motor calismaz: conduit retleri sahte kayitta oturum kapisindan/motor cagrisindan once olusur.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDerivedWorkspacePath, resolveWorkspaceOutputPath, WorkspaceRootError } from "../dist/server/workspaceRoot.js";
import { registerTools } from "../dist/conduit-core/tools.js";
import { rea_net_capture } from "../dist/rea-domains/behavior/NetCapture.js";

let base, kok, dis, baglantiHazir = false;
const gercek = (p) => realpathSync.native(p);

before(() => {
  base = mkdtempSync(join(tmpdir(), "rea-wsderived-"));
  kok = join(base, "ws");
  dis = join(base, "outside");
  for (const d of [kok, dis]) mkdirSync(join(d, "sub"), { recursive: true });
  writeFileSync(join(kok, "sub", "hedef.bin"), "ic");
  writeFileSync(join(dis, "dis.bin"), "d");
  writeFileSync(join(kok, "fw.bin"), "fw");
  // Turev yolun kendisi kok disini gosteren junction: yazma oncesi yakalanmali.
  try { symlinkSync(dis, join(kok, "fw.bin.extracted"), "junction"); baglantiHazir = true; } catch { baglantiHazir = false; }
});
after(() => { try { rmSync(base, { recursive: true, force: true }); } catch { /* yoksay */ } });

const envKok = () => ({ REA_WORKSPACE_ROOT: kok });
const reddet = (fn) => assert.throws(fn, WorkspaceRootError);

describe("resolveDerivedWorkspacePath turev yazmalar", () => {
  it("koksuzken eski dizgi birlestirme aynen doner", () => {
    assert.equal(resolveDerivedWorkspacePath(join("goreli", "a.bin"), ".unpacked", {}, kok), join("goreli", "a.bin") + ".unpacked");
    assert.equal(resolveDerivedWorkspacePath(join(dis, "dis.bin"), ".extracted", {}, kok), join(dis, "dis.bin") + ".extracted");
  });

  it("kok ici turev mutlak gercek yola cevrilir", () => {
    const r = resolveDerivedWorkspacePath(join(kok, "sub", "hedef.bin"), ".unpacked", envKok(), kok);
    assert.equal(r, join(gercek(join(kok, "sub")), "hedef.bin.unpacked"));
  });

  it("kok disi kaynagin turevi reddedilir", () => {
    reddet(() => resolveDerivedWorkspacePath(join(dis, "dis.bin"), ".unpacked", envKok(), kok));
    reddet(() => resolveDerivedWorkspacePath(join(dis, "dis.bin"), ".extracted", envKok(), kok));
  });

  it("turev junction ile kok disini gosteriyorsa reddedilir", (t) => {
    if (!baglantiHazir) return t.skip("junction olusturulamadi");
    reddet(() => resolveDerivedWorkspacePath(join(kok, "fw.bin"), ".extracted", envKok(), kok));
  });
});

describe("resolveWorkspaceOutputPath NetCapture cikti secimi", () => {
  it("koksuzken girdi aynen doner (cwd net.har davranisi)", () => {
    assert.equal(resolveWorkspaceOutputPath("net.har", {}, dis), "net.har");
    assert.equal(resolveWorkspaceOutputPath(join(dis, "x.har"), {}, kok), join(dis, "x.har"));
  });

  it("koklu goreli cikti cwd disinda olsa bile kok icine capalanir", () => {
    assert.equal(resolveWorkspaceOutputPath("net.har", envKok(), dis), join(gercek(kok), "net.har"));
    assert.equal(resolveWorkspaceOutputPath(join("sub", "net.har"), envKok(), dis), join(gercek(join(kok, "sub")), "net.har"));
  });

  it("koklu mutlak cikti dogrulanir, disi ve .. kacisi reddedilir", () => {
    assert.equal(resolveWorkspaceOutputPath(join(kok, "sub", "a.har"), envKok(), dis), join(gercek(join(kok, "sub")), "a.har"));
    reddet(() => resolveWorkspaceOutputPath(join(dis, "a.har"), envKok(), kok));
    reddet(() => resolveWorkspaceOutputPath(join("..", "evil.har"), envKok(), kok));
  });

  it("rea_net_capture kok disi mutlak HAR yolunu motor/proxy acmadan reddeder", async () => {
    const onceki = process.env.REA_WORKSPACE_ROOT;
    process.env.REA_WORKSPACE_ROOT = kok;
    try {
      const hedef = join(dis, "evil.har");
      const r = await rea_net_capture("data:text/plain,x", 3, hedef);
      assert.equal(r.ok, false);
      assert.equal(r.code, "capability_unsupported");
      assert.match(r.reason, /workspace_root/);
      assert.equal(existsSync(hedef), false);
    } finally {
      if (onceki === undefined) delete process.env.REA_WORKSPACE_ROOT; else process.env.REA_WORKSPACE_ROOT = onceki;
    }
  });
});

describe("conduit sahte kayit workspace kapisi", () => {
  const araclar = new Map();
  registerTools({ registerTool: (ad, cfg, is) => araclar.set(ad, is) });
  const sahteOturum = randomUUID();
  const govde = (r) => JSON.parse(r.content[0].text);

  it("open_target/debug_open kok disi yolu isError ile motor oncesi reddeder", async () => {
    const onceki = process.env.REA_WORKSPACE_ROOT;
    process.env.REA_WORKSPACE_ROOT = kok;
    try {
      for (const arac of ["open_target", "debug_open"]) {
        const r = await araclar.get(arac)({ session_id: sahteOturum, path: join(dis, "dis.bin"), mode: "static", break_on_entry: true, auto_analyze: false });
        assert.equal(r.isError, true, arac);
        // session_not_found degil workspace_root: ret oturum kapisindan da once, motor cagrilmadan.
        assert.equal(govde(r).error, "workspace_root", arac);
        assert.match(govde(r).detail, /workspace_root/);
      }
    } finally {
      if (onceki === undefined) delete process.env.REA_WORKSPACE_ROOT; else process.env.REA_WORKSPACE_ROOT = onceki;
    }
  });

  it("kok ici yol kapiyi gecer (sahte oturumda session_not_found'a ilerler, motor yine calismaz)", async () => {
    const onceki = process.env.REA_WORKSPACE_ROOT;
    process.env.REA_WORKSPACE_ROOT = kok;
    try {
      const r = await araclar.get("open_target")({ session_id: sahteOturum, path: join(kok, "sub", "hedef.bin"), mode: "static" });
      assert.equal(govde(r).error, "session_not_found");
    } finally {
      if (onceki === undefined) delete process.env.REA_WORKSPACE_ROOT; else process.env.REA_WORKSPACE_ROOT = onceki;
    }
  });

  it("koksuzken conduit davranisi degismez (workspace kapisi devre disi)", async () => {
    const onceki = process.env.REA_WORKSPACE_ROOT;
    delete process.env.REA_WORKSPACE_ROOT;
    try {
      const r = await araclar.get("open_target")({ session_id: sahteOturum, path: join(dis, "dis.bin"), mode: "static" });
      assert.equal(govde(r).error, "session_not_found");
    } finally {
      if (onceki !== undefined) process.env.REA_WORKSPACE_ROOT = onceki;
    }
  });
});
