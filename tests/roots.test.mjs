// roots.test.mjs: MCP Roots — legacy push + modern MRTR (2026-07-28) dilimi.
// Kos: npm run build sonrasi `node --test tests/roots.test.mjs` (tsc emit sart).
// Canli arac cagrilmaz; InMemoryTransport ham istemcisi yalniz roots/list yanitlar.
// SDK 2.3.1 dogrulamasi: modern cagda push `listRoots()` SdkError
// MethodNotSupportedByProtocolVersion firlatir; gercek akis MRTR'dir: handler
// `inputRequired({inputRequests:{kokler: inputRequired.listRoots()}})` doner,
// istemci `inputResponses` ile retry eder (ctx.mcpReq.inputResponses).
// 2026 tel kaydinda `notifications/roots/list_changed` YOKTUR (yalniz 2025);
// modern baglanti bu bildirimi push ile yeniden cekemez, sonraki MRTR
// turunda taze inputResponses ile gunceller (stale bayragi + durust status).
import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  attachLegacyRoots, attachModernRoots, buildModernRootsRequest, clearClientRoots,
  createClientRootsStore, fileUriToLocalPath, getClientRoots, intersectRoots, isRootsOptIn,
  MODERN_ROOTS_REQUEST_KEY, refreshClientRoots, refreshRootsFromInputResponses,
  resolveRootsEnabled, setClientRoots,
} from "../dist/server/roots.js";
import { applyWorkspaceRoot, getWorkspaceRoots, WorkspaceRootError } from "../dist/server/workspaceRoot.js";
import { createReaPlusMcpServer } from "../dist/server.js";

let base, kok, sub, dis;
const gercek = (p) => realpathSync.native(p);
const href = (p) => pathToFileURL(p).href;
const uriSonuc = (paths) => ({ roots: paths.map((p) => ({ uri: href(p) })) });
async function bekle(kosul, aciklama) {
  for (let i = 0; i < 250 && !kosul(); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(kosul(), aciklama);
}

before(() => {
  base = mkdtempSync(join(tmpdir(), "rea-roots-"));
  kok = join(base, "bos luklu ws"); // bosluk: URI kodlama/cozme de kanitlanir
  sub = join(kok, "sub");
  dis = join(base, "outside");
  mkdirSync(sub, { recursive: true });
  mkdirSync(dis, { recursive: true });
  writeFileSync(join(sub, "ic.bin"), "ic");
  writeFileSync(join(kok, "ust.bin"), "ust");
  writeFileSync(join(dis, "dis.bin"), "d");
});
after(() => {
  clearClientRoots();
  try { rmSync(base, { recursive: true, force: true }); } catch { /* yoksay */ }
});
afterEach(() => clearClientRoots()); // paralel/ardisik testlere depo sizintisi yok

describe("roots opt-in kapisi", () => {
  it("REA_ROOTS yalniz birebir '1' ile acilir; fabrika opsiyonu da sarttir", () => {
    assert.equal(isRootsOptIn({ REA_ROOTS: "1" }), true);
    for (const v of [undefined, "", "0", "true", "2"]) assert.equal(isRootsOptIn({ REA_ROOTS: v }), false, String(v));
    assert.equal(resolveRootsEnabled(true, { REA_ROOTS: "1" }), true);
    assert.equal(resolveRootsEnabled(undefined, { REA_ROOTS: "1" }), false); // HTTP fabrikasi bu daldir
    assert.equal(resolveRootsEnabled(true, {}), false);
  });
});

describe("fileUriToLocalPath", () => {
  it("file:// URI gercek yerel yola cevrilir (bosluk kodlamasi dahil)", () => {
    const r = fileUriToLocalPath(href(sub));
    assert.deepEqual(r, { ok: true, path: gercek(sub) });
    const lh = fileUriToLocalPath(href(sub).replace("file:///", "file://localhost/"));
    assert.deepEqual(lh, { ok: true, path: gercek(sub) });
  });

  it("non-file sema, host'lu (UNC) URI ve gecersiz girdi reddedilir", () => {
    for (const [uri, neden] of [
      ["https://ornek.invalid/ws", /file:\/\/ disi/],
      ["file://sunucu/paylasim/ws", /host'lu/],
      ["file://192.168.1.1/paylasim", /host'lu/],
      ["::gecersiz::", /cozulemedi/],
      ["", /bos/],
      [42, /metin degil/],
      [null, /metin degil/],
    ]) {
      const r = fileUriToLocalPath(uri);
      assert.equal(r.ok, false, JSON.stringify(uri));
      assert.match(r.reason, neden, JSON.stringify(uri));
    }
  });
});

describe("intersectRoots (env sert sinir)", () => {
  it("env ici istemci koku daraltir", () => {
    const r = intersectRoots([kok], [sub]);
    assert.deepEqual(r.effective, [gercek(sub)]);
    assert.deepEqual(r.rejected, []);
  });

  it("daha genis istemci koku env kokune kirpilir, genisletemez", () => {
    const r = intersectRoots([kok], [base]);
    assert.deepEqual(r.effective, [gercek(kok)]);
    assert.equal(r.clamped.length, 1);
    assert.equal(r.clamped[0].env, gercek(kok));
  });

  it("ayrik istemci koku reddedilir", () => {
    const r = intersectRoots([kok], [dis]);
    assert.deepEqual(r.effective, []);
    assert.equal(r.rejected.length, 1);
    assert.match(r.rejected[0].reason, /genisletme reddedildi/);
  });

  it("env yoksa istemci kokleri etkin koktur; tekrarlar tekillestirilir", () => {
    const r = intersectRoots([], [sub, sub, dis]);
    assert.deepEqual(r.effective, [gercek(sub), gercek(dis)]);
  });
});

describe("ClientRootsStore izolasyonu", () => {
  it("ornekler bagimsizdir; get kopya doner; clear bosaltir", () => {
    const a = createClientRootsStore();
    const b = createClientRootsStore();
    a.set([sub]);
    assert.deepEqual(a.get(), [gercek(sub)]);
    assert.deepEqual(b.get(), []);
    a.get().push(dis);
    assert.deepEqual(a.get(), [gercek(sub)], "disari verilen kopya depoyu degistirmemeli");
    a.clear();
    assert.deepEqual(a.get(), []);
  });
});

describe("refreshClientRoots (sahte legacy sunucu)", () => {
  it("basari: gecerli URI depoya girer, cevrilemeyen rejected'a duser", async () => {
    const store = createClientRootsStore();
    const sahte = {
      getClientCapabilities: () => ({ roots: { listChanged: true } }),
      listRoots: async () => ({ roots: [{ uri: href(sub) }, { uri: "https://ornek.invalid/x" }] }),
    };
    const r = await refreshClientRoots(sahte, { enabled: true, store });
    assert.equal(r.status, "ok");
    assert.deepEqual(store.get(), [gercek(sub)]);
    assert.equal(r.rejected.length, 1);
  });

  it("kapaliyken listRoots cagrilmaz, status disabled", async () => {
    let cagri = 0;
    const sahte = { listRoots: async () => { cagri++; return uriSonuc([sub]); } };
    const r = await refreshClientRoots(sahte, { enabled: false, store: createClientRootsStore() });
    assert.equal(r.status, "disabled");
    assert.equal(cagri, 0);
    const r2 = await refreshClientRoots(sahte, { env: {}, store: createClientRootsStore() });
    assert.equal(r2.status, "disabled");
    assert.equal(cagri, 0);
  });

  it("unsupported: capabilities.roots yoksa cagri yapilmaz; listRoots yoksa da ayni dal", async () => {
    let cagri = 0;
    const yeteneksiz = { getClientCapabilities: () => ({}), listRoots: async () => { cagri++; return uriSonuc([sub]); } };
    const r = await refreshClientRoots(yeteneksiz, { enabled: true, store: createClientRootsStore() });
    assert.equal(r.status, "unsupported");
    assert.equal(cagri, 0);
    const r2 = await refreshClientRoots({ getClientCapabilities: () => ({ roots: {} }) }, { enabled: true, store: createClientRootsStore() });
    assert.equal(r2.status, "unsupported");
    const hata = { listRoots: async () => { throw Object.assign(new Error("Client does not support listing roots (required for roots/list)"), { code: "CapabilityNotSupported" }); } };
    assert.equal((await refreshClientRoots(hata, { enabled: true, store: createClientRootsStore() })).status, "unsupported");
  });

  it("modern cag: MethodNotSupportedByProtocolVersion sahte basari degil modern-mrtr-required; depo korunur", async () => {
    const store = createClientRootsStore();
    store.set([sub]);
    const modern = {
      getClientCapabilities: () => ({ roots: {} }),
      listRoots: async () => {
        throw Object.assign(
          new Error("Server-to-client requests are not available on protocol revision 2026-07-28: 'roots/list' cannot be sent. Return inputRequired({ ... }) instead (multi round-trip requests)."),
          { code: "MethodNotSupportedByProtocolVersion" },
        );
      },
    };
    const r = await refreshClientRoots(modern, { enabled: true, store });
    assert.equal(r.status, "modern-mrtr-required");
    assert.match(r.detail, /MRTR/);
    assert.deepEqual(store.get(), [gercek(sub)], "hata dalinda depo degismemeli");
  });

  it("genel hata error dalinda raporlanir", async () => {
    const bozuk = { listRoots: async () => ({ kokler: [] }) };
    const r = await refreshClientRoots(bozuk, { enabled: true, store: createClientRootsStore() });
    assert.equal(r.status, "error");
  });
});

describe("attachLegacyRoots (sahte sunucu, handler omru)", () => {
  it("initialized'da ceker, list_changed'de yeniler, detach geri alir", async () => {
    const store = createClientRootsStore();
    let oncekiCagri = 0;
    let guncel = [sub];
    const sahte = {
      oninitialized: () => { oncekiCagri++; },
      handlers: {},
      setNotificationHandler(m, h) { this.handlers[m] = h; },
      removeNotificationHandler(m) { delete this.handlers[m]; },
      getClientCapabilities: () => ({ roots: { listChanged: true } }),
      listRoots: async () => uriSonuc(guncel),
    };
    const oncekiInit = sahte.oninitialized;
    const bag = attachLegacyRoots(sahte, { enabled: true, store });
    assert.equal(bag.enabled, true);
    assert.equal(bag.listChangedBound, true);
    sahte.oninitialized();
    assert.equal(oncekiCagri, 1, "onceki oninitialized zincirlenmeli");
    await bekle(() => store.get()[0] === gercek(sub), "initialized cekisi depoya yansimadi");
    assert.equal(bag.lastResult().status, "ok");
    guncel = [kok];
    sahte.handlers["notifications/roots/list_changed"]({});
    await bekle(() => store.get()[0] === gercek(kok), "list_changed yenilemesi depoya yansimadi");
    bag.detach();
    assert.equal(sahte.oninitialized, oncekiInit);
    assert.deepEqual(sahte.handlers, {});
    bag.clear();
    assert.deepEqual(store.get(), []);
  });

  it("kapaliyken hicbir handler degismez", () => {
    const sahte = { listRoots: async () => uriSonuc([sub]) };
    const bag = attachLegacyRoots(sahte, { enabled: false, store: createClientRootsStore() });
    assert.equal(bag.enabled, false);
    assert.equal(sahte.oninitialized, undefined);
  });
});

describe("workspaceRoot entegrasyonu (tekil depo)", () => {
  const reddet = (fn) => assert.throws(fn, WorkspaceRootError);

  it("opt-in kapaliyken depo hic okunmaz: davranis birebir eski", () => {
    setClientRoots([dis]);
    const env = { REA_WORKSPACE_ROOT: kok };
    assert.deepEqual(getWorkspaceRoots(env, kok), [gercek(kok)]);
    assert.equal(applyWorkspaceRoot("rea_pe_info", { path: join(sub, "ic.bin") }, env, kok).path, gercek(join(sub, "ic.bin")));
    reddet(() => applyWorkspaceRoot("rea_pe_info", { path: join(dis, "dis.bin") }, env, kok));
    // Env de yokken eski sinirsiz davranis: depo tek basina sinir ACMAZ (opt-in sart).
    assert.deepEqual(applyWorkspaceRoot("rea_pe_info", { path: join(dis, "dis.bin") }, {}, kok), { path: join(dis, "dis.bin") });
  });

  it("env + istemci alt koku: sinir daralir, ust kok artik disarida", () => {
    setClientRoots([sub]);
    const env = { REA_ROOTS: "1", REA_WORKSPACE_ROOT: kok };
    assert.deepEqual(getWorkspaceRoots(env, kok), [gercek(sub)]);
    assert.equal(applyWorkspaceRoot("rea_pe_info", { path: join(sub, "ic.bin") }, env, kok).path, gercek(join(sub, "ic.bin")));
    reddet(() => applyWorkspaceRoot("rea_pe_info", { path: join(kok, "ust.bin") }, env, kok));
  });

  it("env yokken istemci kokleri etkin sinirdir", () => {
    setClientRoots([sub]);
    const env = { REA_ROOTS: "1" };
    assert.deepEqual(getWorkspaceRoots(env, kok), [gercek(sub)]);
    reddet(() => applyWorkspaceRoot("rea_pe_info", { path: join(dis, "dis.bin") }, env, kok));
  });

  it("genisletme denemesi sert siniri asamaz; ayrik kok siniri kaldirmaz", () => {
    const env = { REA_ROOTS: "1", REA_WORKSPACE_ROOT: kok };
    setClientRoots([base]);
    assert.deepEqual(getWorkspaceRoots(env, kok), [gercek(kok)]);
    reddet(() => applyWorkspaceRoot("rea_pe_info", { path: join(dis, "dis.bin") }, env, kok));
    setClientRoots([dis]);
    assert.deepEqual(getWorkspaceRoots(env, kok), [gercek(kok)], "ayrik istemci koku sert siniri dusuremez");
    reddet(() => applyWorkspaceRoot("rea_pe_info", { path: join(dis, "dis.bin") }, env, kok));
    assert.equal(applyWorkspaceRoot("rea_pe_info", { path: join(sub, "ic.bin") }, env, kok).path, gercek(join(sub, "ic.bin")));
  });
});

describe("gercek protokol (InMemoryTransport, legacy roots/list)", () => {
  it("varsayilan fabrikada roots baglanmaz (oninitialized degismez)", () => {
    const onceki = process.env.REA_ROOTS;
    delete process.env.REA_ROOTS;
    try {
      const s = createReaPlusMcpServer({ roots: true });
      assert.equal(s.server.oninitialized, undefined);
    } finally {
      if (onceki === undefined) delete process.env.REA_ROOTS; else process.env.REA_ROOTS = onceki;
    }
  });

  it("cift opt-in ile initialized sonrasi roots/list cekilir ve workspace daralir", async () => {
    const oncekiRoots = process.env.REA_ROOTS;
    const oncekiWs = process.env.REA_WORKSPACE_ROOT;
    process.env.REA_ROOTS = "1";
    process.env.REA_WORKSPACE_ROOT = kok;
    const server = createReaPlusMcpServer({ roots: true });
    assert.equal(typeof server.server.oninitialized, "function", "cift opt-in attach etmis olmali");
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const yanitlar = new Map();
    let idSayac = 0;
    let rootsIstegi = 0;
    clientT.onmessage = async (m) => {
      if (m.method === "roots/list") {
        rootsIstegi++;
        await clientT.send({ jsonrpc: "2.0", id: m.id, result: uriSonuc([sub]) });
        return;
      }
      if (m.id !== undefined) yanitlar.set(m.id, m);
    };
    const gonder = async (method, params) => {
      const id = ++idSayac;
      await clientT.send({ jsonrpc: "2.0", id, method, params });
      for (let i = 0; i < 250 && !yanitlar.has(id); i++) await new Promise((r) => setTimeout(r, 20));
      const y = yanitlar.get(id);
      assert.ok(y && !y.error, `${method} basarisiz: ${JSON.stringify(y?.error)}`);
      return y.result;
    };
    try {
      await server.connect(serverT);
      await clientT.start();
      await gonder("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: { roots: { listChanged: true } },
        clientInfo: { name: "roots-test", version: "0" },
      });
      await clientT.send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
      await bekle(() => getClientRoots()[0] === gercek(sub), "roots/list yaniti depoya yansimadi");
      assert.equal(rootsIstegi, 1, "initialized sonrasi tam bir roots/list cekilmeli");
      // Workspace artik env koku (kok) degil, istemci alt koku (sub) ile sinirli.
      assert.deepEqual(getWorkspaceRoots(process.env, kok), [gercek(sub)]);
      assert.throws(
        () => applyWorkspaceRoot("rea_pe_info", { path: join(kok, "ust.bin") }, process.env, kok),
        WorkspaceRootError,
      );
      assert.equal(
        applyWorkspaceRoot("rea_pe_info", { path: join(sub, "ic.bin") }, process.env, kok).path,
        gercek(join(sub, "ic.bin")),
      );
    } finally {
      try { await server.close(); } catch { /* zaten kapali */ }
      try { await clientT.close(); } catch { /* zaten kapali */ }
      clearClientRoots();
      if (oncekiRoots === undefined) delete process.env.REA_ROOTS; else process.env.REA_ROOTS = oncekiRoots;
      if (oncekiWs === undefined) delete process.env.REA_WORKSPACE_ROOT; else process.env.REA_WORKSPACE_ROOT = oncekiWs;
    }
  });
});

describe("modern MRTR roots akisi (inputRequired/inputResponses)", () => {
  const envDar = () => ({ REA_ROOTS: "1", REA_WORKSPACE_ROOT: kok });
  // 2. tur retry govdesi: istisnasiz BARE ListRootsResult (SDK partitionInputResponses
  // sarmal {method,result} zarfini dusurur; burada da desteklenmez).
  const tur2 = (paths, anahtar = MODERN_ROOTS_REQUEST_KEY) =>
    ({ [anahtar]: uriSonuc(paths) });

  it("(a) istek literali SDK inputRequired()+inputRequired.listRoots() bicimindedir", () => {
    assert.equal(MODERN_ROOTS_REQUEST_KEY, "kokler");
    assert.deepEqual(buildModernRootsRequest(), {
      resultType: "input_required",
      inputRequests: { kokler: { method: "roots/list" } },
    });
    assert.deepEqual(buildModernRootsRequest("ozel"), {
      resultType: "input_required",
      inputRequests: { ozel: { method: "roots/list" } },
    });
  });

  it("(a) MRTR 2. tur: daraltma uygulanir, depo taze koklerle dolar", async () => {
    const store = createClientRootsStore();
    const r = await refreshRootsFromInputResponses(tur2([sub]), { enabled: true, store });
    assert.equal(r.status, "ok");
    assert.deepEqual(store.get(), [gercek(sub)]);
    assert.deepEqual(r.roots, [gercek(sub)]);
    // Ayni tura ozel anahtar da tasinir.
    const r2 = await refreshRootsFromInputResponses(tur2([kok], "ozel"), { enabled: true, store, key: "ozel" });
    assert.equal(r2.status, "ok");
    assert.deepEqual(store.get(), [gercek(kok)]);
  });

  it("(a) genisletme reddedilir: genis kok kirpilir, ayrik kok siniri kaldirmaz", async () => {
    const store = createClientRootsStore();
    await refreshRootsFromInputResponses(tur2([base]), { enabled: true, store });
    setClientRoots(store.get());
    try {
      // Istemci env kokunu kapsayan kok verdi: etkin sinir env kokunde kalir.
      assert.deepEqual(getWorkspaceRoots(envDar(), kok), [gercek(kok)]);
      assert.throws(
        () => applyWorkspaceRoot("rea_pe_info", { path: join(dis, "dis.bin") }, envDar(), kok),
        WorkspaceRootError,
      );
      // Ayrik kok: sert sinir dusmez, ic dosya erisimi surer.
      await refreshRootsFromInputResponses(tur2([dis]), { enabled: true, store });
      setClientRoots(store.get());
      assert.deepEqual(getWorkspaceRoots(envDar(), kok), [gercek(kok)]);
      assert.throws(
        () => applyWorkspaceRoot("rea_pe_info", { path: join(dis, "dis.bin") }, envDar(), kok),
        WorkspaceRootError,
      );
      assert.equal(
        applyWorkspaceRoot("rea_pe_info", { path: join(sub, "ic.bin") }, envDar(), kok).path,
        gercek(join(sub, "ic.bin")),
      );
    } finally {
      clearClientRoots();
    }
  });

  it("(a) cevrilemeyen URI rejected'a duser, gecerli kok yine depolanir (sahte basari yok)", async () => {
    const store = createClientRootsStore();
    const govde = { [MODERN_ROOTS_REQUEST_KEY]: { roots: [{ uri: href(sub) }, { uri: "https://ornek.invalid/x" }] } };
    const r = await refreshRootsFromInputResponses(govde, { enabled: true, store });
    assert.equal(r.status, "ok");
    assert.deepEqual(store.get(), [gercek(sub)]);
    assert.equal(r.rejected.length, 1);
  });

  it("(c) destek yoksa durust status: anahtar yok, zarf sarmalli, kapaliyken hic dokunulmaz", async () => {
    const store = createClientRootsStore();
    store.set([sub]);
    // inputResponses'ta beklenen anahtar yok: istemci kok vermedi.
    const yok = await refreshRootsFromInputResponses({ baska: uriSonuc([kok]) }, { enabled: true, store });
    assert.equal(yok.status, "unsupported");
    assert.match(yok.detail, /MRTR destegi vermedi/);
    assert.deepEqual(store.get(), [gercek(sub)], "unsupported dalinda depo korunur");
    // Sarmal {method,result} zarfi: SDK ile ayni sekilde dusurulur, basari sayilmaz.
    const zarf = await refreshRootsFromInputResponses(
      { [MODERN_ROOTS_REQUEST_KEY]: { method: "roots/list", result: uriSonuc([kok]) } },
      { enabled: true, store },
    );
    assert.equal(zarf.status, "unsupported");
    assert.deepEqual(store.get(), [gercek(sub)]);
    // Opt-in kapali: girdi hic okunmaz.
    const kapali = await refreshRootsFromInputResponses(tur2([kok]), { enabled: false, store });
    assert.equal(kapali.status, "disabled");
    assert.deepEqual(store.get(), [gercek(sub)]);
    const kapaliEnv = await refreshRootsFromInputResponses(tur2([kok]), { env: {}, store });
    assert.equal(kapaliEnv.status, "disabled");
  });

  it("(c) bicim bozuk govde error verir, depo korunur", async () => {
    const store = createClientRootsStore();
    store.set([sub]);
    // roots dizisi sart: dizi disi govde SDK inputResponse ile ayni sekilde missing->unsupported.
    const kotu = await refreshRootsFromInputResponses(
      { [MODERN_ROOTS_REQUEST_KEY]: { roots: "kok-degil" } }, { enabled: true, store });
    assert.equal(kotu.status, "unsupported");
    assert.deepEqual(store.get(), [gercek(sub)]);
  });
});

describe("attachModernRoots (bildirim omru + MRTR yenileme)", () => {
  it("(b) legacy-uyumlu hedefte list_changed push ile yeniden ceker, daraltma guncellenir", async () => {
    const store = createClientRootsStore();
    let guncel = [sub];
    const sahte = {
      handlers: {},
      setNotificationHandler(m, h) { this.handlers[m] = h; },
      removeNotificationHandler(m) { delete this.handlers[m]; },
      getClientCapabilities: () => ({ roots: { listChanged: true } }),
      listRoots: async () => ({ roots: guncel.map((p) => ({ uri: pathToFileURL(p).href })) }),
    };
    const bag = attachModernRoots(sahte, { enabled: true, store });
    assert.equal(bag.enabled, true);
    assert.equal(bag.listChangedBound, true);
    assert.equal(bag.stale(), false);
    // 1. tur: handler'a dondurulecek literal.
    assert.deepEqual(bag.rootsRequest(), buildModernRootsRequest());
    // 2. tur: retry ile gelen kokler depoya girer.
    const r = await bag.refreshFromResponses({ [MODERN_ROOTS_REQUEST_KEY]: { roots: guncel.map((p) => ({ uri: pathToFileURL(p).href })) } });
    assert.equal(r.status, "ok");
    assert.deepEqual(store.get(), [gercek(sub)]);
    assert.equal(bag.stale(), false);
    // Bildirim: istemci kokleri degisti (kok'a cikti) -> push yeniden ceker.
    guncel = [kok];
    sahte.handlers["notifications/roots/list_changed"]({});
    await bekle(() => store.get()[0] === gercek(kok), "list_changed push yenilemesi depoya yansimadi");
    assert.equal(bag.lastResult().status, "ok");
    assert.equal(bag.stale(), false);
    bag.detach();
    assert.deepEqual(sahte.handlers, {});
    bag.clear();
    assert.deepEqual(store.get(), []);
  });

  it("(b) modern cag hedefte push durust modern-mrtr-required + stale; sonraki MRTR turu gunceller", async () => {
    const store = createClientRootsStore();
    store.set([sub]);
    const modern = {
      handlers: {},
      setNotificationHandler(m, h) { this.handlers[m] = h; },
      removeNotificationHandler(m) { delete this.handlers[m]; },
      getClientCapabilities: () => ({ roots: {} }),
      listRoots: async () => {
        throw Object.assign(
          new Error("Server-to-client requests are not available on protocol revision 2026-07-28: 'roots/list' cannot be sent. Return inputRequired({ ... }) instead (multi round-trip requests)."),
          { code: "MethodNotSupportedByProtocolVersion" },
        );
      },
    };
    const bag = attachModernRoots(modern, { enabled: true, store });
    assert.equal(bag.listChangedBound, true);
    modern.handlers["notifications/roots/list_changed"]({});
    await bekle(() => bag.lastResult() !== null, "list_changed islenmedi");
    assert.equal(bag.lastResult().status, "modern-mrtr-required");
    assert.equal(bag.stale(), true, "modern cagda bildirim sonraki MRTR turunu beklemeli");
    assert.deepEqual(store.get(), [gercek(sub)], "hata dalinda depo korunur");
    // Sonraki MRTR turu (taze inputResponses): daraltma guncellenir, stale duser.
    const r = await bag.refreshFromResponses({ [MODERN_ROOTS_REQUEST_KEY]: { roots: [{ uri: pathToFileURL(kok).href }] } });
    assert.equal(r.status, "ok");
    assert.deepEqual(store.get(), [gercek(kok)]);
    assert.equal(bag.stale(), false);
    bag.detach();
  });

  it("kapaliyken hicbir handler degismez", () => {
    const sahte = { listRoots: async () => ({ roots: [] }) };
    const bag = attachModernRoots(sahte, { enabled: false, store: createClientRootsStore() });
    assert.equal(bag.enabled, false);
    assert.equal(bag.listChangedBound, false);
    assert.equal(sahte.oninitialized, undefined);
  });
});

describe("guvenlik invarianti (e): hicbir yolda workspace genislemez", () => {
  const envDar = () => ({ REA_ROOTS: "1", REA_WORKSPACE_ROOT: kok });
  const icindeMi = (aday) => {
    const fark = relative(gercek(kok), aday);
    return fark === "" || (fark !== ".." && !fark.startsWith(`..${sep}`) && !isAbsolute(fark));
  };

  it("legacy push, modern MRTR, kirpma, ayrik, stale-sonrasi: etkin kok hep env icinde", async () => {
    const senaryolar = [
      { ad: "legacy-push-sub", tur: "legacy", kokler: [sub] },
      { ad: "modern-sub", tur: "modern", kokler: [sub] },
      { ad: "modern-genis-base", tur: "modern", kokler: [base] },
      { ad: "modern-ayrik-dis", tur: "modern", kokler: [dis] },
      { ad: "modern-kok", tur: "modern", kokler: [kok] },
    ];
    for (const s of senaryolar) {
      const store = createClientRootsStore();
      if (s.tur === "legacy") {
        const sahte = { listRoots: async () => ({ roots: s.kokler.map((p) => ({ uri: pathToFileURL(p).href })) }) };
        const r = await refreshClientRoots(sahte, { enabled: true, store });
        assert.equal(r.status, "ok", s.ad);
      } else {
        const r = await refreshRootsFromInputResponses(
          { [MODERN_ROOTS_REQUEST_KEY]: { roots: s.kokler.map((p) => ({ uri: pathToFileURL(p).href })) } },
          { enabled: true, store },
        );
        assert.equal(r.status, "ok", s.ad);
      }
      setClientRoots(store.get());
      try {
        const etkin = getWorkspaceRoots(envDar(), kok);
        assert.ok(etkin.length > 0, `${s.ad}: etkin kok bos kalmamali (env sert sinir duser)`);
        for (const e of etkin) assert.ok(icindeMi(e), `${s.ad}: etkin kok env disina tasti: ${e}`);
        // Kok disi her yolda reddedilir.
        assert.throws(
          () => applyWorkspaceRoot("rea_pe_info", { path: join(dis, "dis.bin") }, envDar(), kok),
          WorkspaceRootError,
          s.ad,
        );
      } finally {
        clearClientRoots();
      }
    }
  });
});


