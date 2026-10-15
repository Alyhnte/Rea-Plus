// workspace-root.test.mjs: REA_WORKSPACE_ROOT merkezi yol siniri (offline, gercek fs).
// Kos: npm run build sonrasi `node --test tests/workspace-root.test.mjs` (tsc emit sart).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter, parse } from "node:path";
import { applyWorkspaceRoot, getWorkspaceRoots, resolveWorkspacePath, WorkspaceRootError } from "../dist/server/workspaceRoot.js";
import { clearClientRoots, MODERN_ROOTS_REQUEST_KEY, refreshRootsFromInputResponses, setClientRoots } from "../dist/server/roots.js";
import { registerReaTools } from "../dist/server/registerReaTools.js";
import { pathToFileURL } from "node:url";

let base, kok, kardes, dis, kok2, baglantiHazir = false;
const gercek = (p) => realpathSync.native(p);

before(() => {
  base = mkdtempSync(join(tmpdir(), "rea-wsroot-"));
  kok = join(base, "ws");            // calisma koku
  kardes = join(base, "ws-evil");    // prefix kardesi (kabul edilmemeli)
  dis = join(base, "outside");       // kok disi
  kok2 = join(base, "ws2");          // ikinci kok
  for (const d of [kok, kardes, dis, kok2]) mkdirSync(join(d, "sub"), { recursive: true });
  writeFileSync(join(kok, "sub", "ic.bin"), "ic");
  writeFileSync(join(kok2, "iki.bin"), "iki");
  writeFileSync(join(kardes, "kardes.bin"), "k");
  writeFileSync(join(dis, "dis.bin"), "d");
  writeFileSync(join(kok, "kayit.json"), '{"401000":"aa"}');
  writeFileSync(join(dis, "kayit.json"), '{"401000":"bb"}');
  try { symlinkSync(dis, join(kok, "kacis"), "junction"); baglantiHazir = true; } catch { baglantiHazir = false; }
});
after(() => { try { rmSync(base, { recursive: true, force: true }); } catch { /* yoksay */ } });

const envKok = () => ({ REA_WORKSPACE_ROOT: kok });
const reddet = (fn) => assert.throws(fn, WorkspaceRootError);

describe("workspaceRoot kok cozumleme", () => {
  it("kok ici mutlak yol gercek mutlak yola cevrilir", () => {
    const r = resolveWorkspacePath(join(kok, "sub", "ic.bin"), "read", envKok(), kok);
    assert.equal(r, gercek(join(kok, "sub", "ic.bin")));
  });

  it("goreli yol cwd'ye gore cozulur", () => {
    const r = applyWorkspaceRoot("rea_pe_info", { path: join("sub", "ic.bin") }, envKok(), kok);
    assert.equal(r.path, gercek(join(kok, "sub", "ic.bin")));
  });

  it(".. ile kacis reddedilir", () => {
    reddet(() => applyWorkspaceRoot("rea_pe_info", { path: join("..", "outside", "dis.bin") }, envKok(), kok));
    reddet(() => resolveWorkspacePath(join(kok, "..", "outside", "dis.bin"), "read", envKok(), kok));
  });

  it("prefix kardesi kok sayilmaz", () => {
    reddet(() => applyWorkspaceRoot("rea_pe_info", { path: join(kardes, "kardes.bin") }, envKok(), kok));
  });

  it("junction uzerinden kacis realpath ile yakalanir", (t) => {
    if (!baglantiHazir) return t.skip("junction olusturulamadi");
    reddet(() => applyWorkspaceRoot("rea_pe_info", { path: join(kok, "kacis", "dis.bin") }, envKok(), kok));
  });

  it("birden cok kok delimiter ile desteklenir", () => {
    const env = { REA_WORKSPACE_ROOT: kok + delimiter + kok2 };
    assert.equal(getWorkspaceRoots(env, kok).length, 2);
    const r = applyWorkspaceRoot("rea_pe_info", { path: join(kok2, "iki.bin") }, env, kok);
    assert.equal(r.path, gercek(join(kok2, "iki.bin")));
  });

  it("UNC, cihaz ve farkli surucu yollari yerel kokte reddedilir", () => {
    reddet(() => resolveWorkspacePath("\\\\server\\share\\dis.bin", "read", envKok(), kok));
    reddet(() => resolveWorkspacePath("\\\\?\\" + join(kok, "sub", "ic.bin"), "read", envKok(), kok));
    reddet(() => resolveWorkspacePath("\\\\.\\" + join(kok, "sub", "ic.bin"), "read", envKok(), kok));
    const kokSurucu = parse(kok).root.slice(0, 1).toUpperCase();
    const ote = kokSurucu === "D" ? "C" : "D";
    reddet(() => resolveWorkspacePath(ote + ":\\baska\\dis.bin", "read", envKok(), kok));
  });

  it("Windows surucu-goreli, ADS ve ayrilmis ad yollari reddedilir", (t) => {
    if (process.platform !== "win32") return t.skip("yalniz win32");
    const surucu = parse(kok).root.slice(0, 1);
    reddet(() => resolveWorkspacePath(surucu + ":sub\\ic.bin", "read", envKok(), kok));
    reddet(() => resolveWorkspacePath(join(kok, "sub", "ic.bin:stream"), "read", envKok(), kok));
    reddet(() => resolveWorkspacePath(join(kok, "NUL"), "write", envKok(), kok));
    reddet(() => resolveWorkspacePath(join(kok, "CON.png"), "write", envKok(), kok));
  });
});

describe("workspaceRoot parametre siniflari", () => {
  it("apk_path okuma, dir dizin, eski/yeni okuma uygulanir", () => {
    reddet(() => applyWorkspaceRoot("rea_jadx_manifest", { apk_path: join(dis, "dis.bin") }, envKok(), kok));
    reddet(() => applyWorkspaceRoot("rea_jadx_methods", { dir: dis }, envKok(), kok));
    assert.equal(applyWorkspaceRoot("rea_jadx_methods", { dir: kok }, envKok(), kok).dir, gercek(kok));
    reddet(() => applyWorkspaceRoot("rea_ghidra_vt", { eski: join(kok, "sub", "ic.bin"), yeni: join(dis, "dis.bin") }, envKok(), kok));
  });

  it("dizin path araclari koku ve icini kabul eder, disi reddeder", () => {
    for (const arac of ["rea_apple_bundle", "rea_fs_snapshot", "rea_js_require", "rea_scan_repo"]) {
      assert.equal(applyWorkspaceRoot(arac, { path: kok }, envKok(), kok).path, gercek(kok), arac);
      reddet(() => applyWorkspaceRoot(arac, { path: dis }, envKok(), kok));
    }
  });

  it("yazma hedefi ebeveyn uzerinden dogrulanir", (t) => {
    const ic = applyWorkspaceRoot("rea_upx_unpack", { path: join(kok, "sub", "ic.bin"), out: join(kok, "sub", "yeni", "out.bin") }, envKok(), kok);
    assert.equal(ic.out, join(gercek(join(kok, "sub")), "yeni", "out.bin"));
    reddet(() => applyWorkspaceRoot("rea_upx_unpack", { path: join(kok, "sub", "ic.bin"), out: join(dis, "out.bin") }, envKok(), kok));
    if (!baglantiHazir) return t.skip("junction olusturulamadi");
    reddet(() => applyWorkspaceRoot("rea_upx_unpack", { path: join(kok, "sub", "ic.bin"), out: join(kok, "kacis", "out.bin") }, envKok(), kok));
  });

  it("atlanan araclar ve cmd/url/sinif degismez", () => {
    for (const arac of ["rea_managed_import", "rea_firmware_handoff", "rea_pwn_elf_layout"]) {
      assert.equal(applyWorkspaceRoot(arac, { path: join(dis, "dis.bin") }, envKok(), kok).path, join(dis, "dis.bin"), arac);
    }
    assert.equal(applyWorkspaceRoot("rea_managed_verify", { path: join(dis, "dis.bin"), beklenen: "x" }, envKok(), kok).path, join(dis, "dis.bin"));
    assert.equal(applyWorkspaceRoot("rea_process_run", { cmd: "..\\evil.exe --x" }, envKok(), kok).cmd, "..\\evil.exe --x");
    const r = applyWorkspaceRoot("rea_jadx_decompile", { apk_path: join(kok, "sub", "ic.bin"), sinif: "../DisSinif", out: join(kok, "out") }, envKok(), kok);
    assert.equal(r.sinif, "../DisSinif");
    const b = applyWorkspaceRoot("rea_browser_shot", { url: "https://ornek.invalid/../x", out: join(kok, "s.png") }, envKok(), kok);
    assert.equal(b.url, "https://ornek.invalid/../x");
  });

  it("kayit JSON ise dokunulmaz, mevcut dosya ise okuma kurali uygulanir", () => {
    const j = applyWorkspaceRoot("rea_ghidra_trace", { path: join(kok, "sub", "ic.bin"), kayit: '{"401000":"aa"}' }, envKok(), kok);
    assert.equal(j.kayit, '{"401000":"aa"}');
    const f = applyWorkspaceRoot("rea_ghidra_trace", { path: join(kok, "sub", "ic.bin"), kayit: join(kok, "kayit.json") }, envKok(), kok);
    assert.equal(f.kayit, gercek(join(kok, "kayit.json")));
    reddet(() => applyWorkspaceRoot("rea_ghidra_trace", { path: join(kok, "sub", "ic.bin"), kayit: join(dis, "kayit.json") }, envKok(), kok));
  });

  it("conduit adlari open_target/debug_open ayni merkezi kurala girer", () => {
    for (const arac of ["open_target", "debug_open"]) {
      const r = applyWorkspaceRoot(arac, { session_id: "oturum", path: join(kok, "sub", "ic.bin") }, envKok(), kok);
      assert.equal(r.path, gercek(join(kok, "sub", "ic.bin")), arac);
      assert.equal(r.session_id, "oturum", arac); // session_id yol degildir, degismez
      reddet(() => applyWorkspaceRoot(arac, { session_id: "oturum", path: join(dis, "dis.bin") }, envKok(), kok));
      reddet(() => applyWorkspaceRoot(arac, { session_id: "oturum", path: join("..", "outside", "dis.bin") }, envKok(), kok));
      assert.deepEqual(applyWorkspaceRoot(arac, { path: join("goreli", "x.bin") }, {}, kok), { path: join("goreli", "x.bin") }, arac);
    }
  });

  it("kok tanimsizsa davranis aynen korunur", () => {
    const girdi = { path: join("goreli", "dis.bin"), out: "..\\cikti.bin" };
    assert.deepEqual(applyWorkspaceRoot("rea_upx_unpack", girdi, {}, kok), girdi);
    assert.deepEqual(applyWorkspaceRoot("rea_pe_info", { path: join(dis, "dis.bin") }, { REA_WORKSPACE_ROOT: "" }, kok), { path: join(dis, "dis.bin") });
    assert.deepEqual(getWorkspaceRoots({}, kok), []);
  });
});

describe("registerReaTools workspace zarfi", () => {
  const araclar = new Map();
  registerReaTools({ registerTool: (ad, cfg, is) => araclar.set(ad, is) });

  it("ihlalde handler cagrilmadan isError doner", async () => {
    const onceki = process.env.REA_WORKSPACE_ROOT;
    process.env.REA_WORKSPACE_ROOT = kok;
    try {
      const disR = await araclar.get("rea_scan_repo")({ path: dis });
      assert.equal(disR.isError, true);
      assert.equal(JSON.parse(disR.content[0].text).ok, false);
      const icR = await araclar.get("rea_scan_repo")({ path: kok });
      assert.notEqual(icR.isError, true);
    } finally {
      if (onceki === undefined) delete process.env.REA_WORKSPACE_ROOT; else process.env.REA_WORKSPACE_ROOT = onceki;
    }
  });

  it("koksuzken kayitli arac davranisi degismez", async () => {
    const onceki = process.env.REA_WORKSPACE_ROOT;
    delete process.env.REA_WORKSPACE_ROOT;
    try {
      const r = await araclar.get("rea_scan_repo")({ path: dis });
      assert.notEqual(r.isError, true);
    } finally {
      if (onceki !== undefined) process.env.REA_WORKSPACE_ROOT = onceki;
    }
  });
});

describe("roots daraltma baglantisi (modern MRTR deposu)", () => {
  const href = (p) => pathToFileURL(p).href;

  it("MRTR ile dolan depo workspace'i daraltir; ayrik kok sert siniri kaldirmaz", async () => {
    const env = { REA_ROOTS: "1", REA_WORKSPACE_ROOT: kok };
    try {
      const alt = await refreshRootsFromInputResponses(
        { [MODERN_ROOTS_REQUEST_KEY]: { roots: [{ uri: href(join(kok, "sub")) }] } },
        { enabled: true },
      );
      assert.equal(alt.status, "ok");
      assert.deepEqual(getWorkspaceRoots(env, kok), [gercek(join(kok, "sub"))]);
      reddet(() => applyWorkspaceRoot("rea_pe_info", { path: join(kok, "kayit.json") }, env, kok));
      const ayrik = await refreshRootsFromInputResponses(
        { [MODERN_ROOTS_REQUEST_KEY]: { roots: [{ uri: href(dis) }] } },
        { enabled: true },
      );
      assert.equal(ayrik.status, "ok");
      assert.deepEqual(getWorkspaceRoots(env, kok), [gercek(kok)], "ayrik kok env sinirini dusuremez");
      reddet(() => applyWorkspaceRoot("rea_pe_info", { path: join(dis, "dis.bin") }, env, kok));
    } finally {
      clearClientRoots();
    }
  });

  it("opt-in kapaliyken MRTR deposu siniri degistirmez", async () => {
    try {
      setClientRoots([dis]);
      assert.deepEqual(getWorkspaceRoots({}, kok), []);
      assert.deepEqual(getWorkspaceRoots({ REA_WORKSPACE_ROOT: kok }, kok), [gercek(kok)]);
    } finally {
      clearClientRoots();
    }
  });
});
