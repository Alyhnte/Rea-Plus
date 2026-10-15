// resources-prompts.test.mjs: MCP resource + prompt kayit/callback sekilleri ve
// gercek protokol kaniti (offline, InMemoryTransport; surec spawn edilmez).
// Kos: npm run build sonrasi `node --test tests/resources-prompts.test.mjs`.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  registerResourcesPrompts,
  REA_SERVER_INFO_URI,
  REA_CAPABILITIES_SAFETY_URI,
  REA_PROMPT_NAMES,
} from "../dist/server/registerResourcesPrompts.js";
import { createReaPlusMcpServer, REA_PLUS_NAME, REA_PLUS_VERSION } from "../dist/server.js";

// Kayitlari yakalayan sahte sunucu: SDK imzalarini (ad, uri/cfg, cfg, cb) birebir izler.
function sahteSunucu() {
  const resources = new Map();
  const prompts = new Map();
  return {
    resources,
    prompts,
    registerResource: (ad, uri, cfg, cb) => resources.set(uri, { ad, cfg, cb }),
    registerPrompt: (ad, cfg, cb) => prompts.set(ad, { cfg, cb }),
  };
}

const INFO = { name: "rea-plus", version: "0.8.2" };
delete process.env.REA_TOOLSETS; // gercek protokol bolumu tam 187 arac bekler

describe("registerResourcesPrompts kayit sekilleri", () => {
  const s = sahteSunucu();
  registerResourcesPrompts(s, INFO);

  it("tam iki statik resource kaydeder, template acmaz", () => {
    assert.equal(s.resources.size, 2);
    assert.ok(s.resources.has(REA_SERVER_INFO_URI));
    assert.ok(s.resources.has(REA_CAPABILITIES_SAFETY_URI));
    for (const [uri, r] of s.resources) {
      assert.equal(typeof uri, "string", "uri statik string olmali (template degil)");
      assert.equal(r.cfg.mimeType, "application/json");
      assert.equal(typeof r.cb, "function");
    }
  });

  it("uc prompt kaydeder; argsSchema path zorunlu + focus opsiyoneldir", () => {
    assert.equal(s.prompts.size, 3);
    assert.deepEqual([...s.prompts.keys()], [...REA_PROMPT_NAMES]);
    for (const [, p] of s.prompts) {
      assert.equal(typeof p.cb, "function");
      assert.ok(p.cfg.argsSchema?.safeParse, "argsSchema zod semasi olmali");
      assert.equal(p.cfg.argsSchema.safeParse({ path: "ornek.bin" }).success, true);
      assert.equal(p.cfg.argsSchema.safeParse({ path: "ornek.bin", focus: "ag" }).success, true);
      assert.equal(p.cfg.argsSchema.safeParse({}).success, false);
      assert.equal(p.cfg.argsSchema.safeParse({ path: "" }).success, false);
    }
  });
});

describe("resource callback icerikleri", () => {
  const s = sahteSunucu();
  registerResourcesPrompts(s, INFO);

  async function oku(uri) {
    const r = s.resources.get(uri);
    const sonuc = await r.cb(new URL(uri), {});
    assert.ok(Array.isArray(sonuc.contents) && sonuc.contents.length === 1);
    const c = sonuc.contents[0];
    assert.equal(c.uri, uri);
    assert.equal(c.mimeType, "application/json");
    return { ham: c.text, json: JSON.parse(c.text) }; // parse patlarsa test duser
  }

  it("server-info JSON parse olur ve kimlik/sayi alanlari dogrudur", async () => {
    const { json } = await oku(REA_SERVER_INFO_URI);
    assert.equal(json.name, INFO.name);
    assert.equal(json.version, INFO.version);
    assert.deepEqual(json.tools, { total: 187, conduit: 30, rea: 157 });
    assert.deepEqual(json.resources, [REA_SERVER_INFO_URI, REA_CAPABILITIES_SAFETY_URI]);
    assert.deepEqual(json.prompts, [...REA_PROMPT_NAMES]);
  });

  it("capabilities-safety JSON parse olur ve guvenlik kurallari sabittir", async () => {
    const { json } = await oku(REA_CAPABILITIES_SAFETY_URI);
    assert.equal(json.capabilities.resources.subscribe, false);
    assert.equal(json.capabilities.prompts.sideEffectFree, true);
    assert.equal(json.safety.resourcesReadOnly, true);
    assert.equal(json.safety.arbitraryFileResources, false);
    assert.equal(json.safety.environmentValuesExposed, false);
    assert.equal(json.safety.personalPathsExposed, false);
    assert.equal(json.safety.liveExecution, "vm-ci-only");
    assert.match(json.safety.liveExecutionRule, /VM\/CI/);
  });

  it("icerik deterministiktir ve env/kisisel yol sizdirmaz", async () => {
    const gizli = "REA_TEST_SIZINTI_DEGERI_42";
    process.env.REA_TEST_SIZINTI = gizli;
    try {
      for (const uri of [REA_SERVER_INFO_URI, REA_CAPABILITIES_SAFETY_URI]) {
        const a = await oku(uri);
        const b = await oku(uri);
        assert.equal(a.ham, b.ham, "ayni resource ayni metni vermeli");
        assert.ok(!a.ham.includes(gizli), "env degeri sizmamali");
        assert.ok(!a.ham.includes(homedir()), "ev dizini sizmamali");
        assert.ok(!a.ham.includes(process.cwd()), "cwd sizmamali");
        assert.ok(!/^[a-z]:\\/im.test(a.ham) && !a.ham.includes(":\\Users\\"), "kisisel yol sizmamali");
      }
    } finally { delete process.env.REA_TEST_SIZINTI; }
  });
});

describe("prompt callback icerikleri", () => {
  const s = sahteSunucu();
  registerResourcesPrompts(s, INFO);

  async function metin(ad, args) {
    const p = s.prompts.get(ad);
    const sonuc = await p.cb(args, {});
    assert.ok(Array.isArray(sonuc.messages) && sonuc.messages.length === 1);
    const m = sonuc.messages[0];
    assert.equal(m.role, "user");
    assert.equal(m.content.type, "text");
    return m.content.text;
  }
  const siraIle = (t, araclar) => {
    let onceki = -1;
    for (const a of araclar) {
      const i = t.indexOf(a);
      assert.ok(i > onceki, `${a} beklenen sirada degil`);
      onceki = i;
    }
  };

  it("packer-triage: yol+odak islenir, akis sirali ve VM/CI kurali var", async () => {
    const t = await metin("packer-triage", { path: "hedef.exe", focus: "yuksek entropi" });
    assert.ok(t.includes("hedef.exe"));
    assert.ok(t.includes("yuksek entropi"));
    siraIle(t, ["rea_investigate", "rea_pe_sections", "rea_upx_info", "rea_unpack_hunt"]);
    assert.match(t, /VM\/CI/);
    assert.match(t, /hicbir arac calistirmaz/);
  });

  it("dotnet-malware-triage: metadata -> cil -> ilspy sirasi, calistirma yasagi", async () => {
    const t = await metin("dotnet-malware-triage", { path: "supheli.dll" });
    assert.ok(t.includes("supheli.dll"));
    assert.match(t, /Odak belirtilmedi/);
    siraIle(t, ["rea_investigate", "rea_dotnet_metadata", "rea_dotnet_cil", "rea_ilspy_decompile"]);
    assert.match(t, /asla calistirma/);
    assert.match(t, /VM\/CI/);
  });

  it("android-triage: manifest -> classes -> decompile sirasi, canli adb disarida", async () => {
    const t = await metin("android-triage", { path: "uygulama.apk", focus: "izinler" });
    assert.ok(t.includes("uygulama.apk"));
    siraIle(t, ["rea_investigate", "rea_jadx_manifest", "rea_jadx_classes", "rea_jadx_decompile"]);
    assert.match(t, /rea_adb_install.*disindadir/);
    assert.match(t, /VM\/CI/);
  });
});

describe("gercek protokol (InMemoryTransport)", () => {
  let server, clientT, yanitlar, idSayac;
  const gonder = async (method, params) => {
    const id = ++idSayac;
    await clientT.send({ jsonrpc: "2.0", id, method, params });
    for (let i = 0; i < 250 && !yanitlar.has(id); i++) await new Promise((r) => setTimeout(r, 20));
    const y = yanitlar.get(id);
    assert.ok(y, `${method} yaniti gelmedi`);
    assert.ok(!y.error, `${method} hata dondu: ${JSON.stringify(y.error)}`);
    return y.result;
  };

  before(async () => {
    server = createReaPlusMcpServer();
    const [c, sT] = InMemoryTransport.createLinkedPair();
    clientT = c; yanitlar = new Map(); idSayac = 0;
    clientT.onmessage = (m) => { if (m.id !== undefined) yanitlar.set(m.id, m); };
    await server.connect(sT);
    await clientT.start();
  });
  after(async () => {
    try { await server.close(); } catch { /* zaten kapali */ }
    try { await clientT.close(); } catch { /* zaten kapali */ }
  });

  it("initialize: resources/prompts ilan edilir, subscribe ilan edilmez", async () => {
    const r = await gonder("initialize", {
      protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "0" },
    });
    assert.equal(r.serverInfo.name, REA_PLUS_NAME);
    assert.equal(r.serverInfo.version, REA_PLUS_VERSION);
    assert.ok(r.capabilities.resources, "resources capability yok");
    assert.equal(r.capabilities.resources.subscribe, undefined, "subscribe ilan edilmemeli");
    assert.ok(r.capabilities.prompts, "prompts capability yok");
    await clientT.send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  });

  it("tools/list 187 araci korur", async () => {
    const r = await gonder("tools/list", {});
    assert.equal(r.tools.length, 187);
  });

  it("resources/list + resources/read gercek protokolden calisir", async () => {
    const liste = await gonder("resources/list", {});
    assert.deepEqual(liste.resources.map((x) => x.uri), [REA_SERVER_INFO_URI, REA_CAPABILITIES_SAFETY_URI]);
    const oku = await gonder("resources/read", { uri: REA_CAPABILITIES_SAFETY_URI });
    const json = JSON.parse(oku.contents[0].text);
    assert.equal(json.safety.resourcesReadOnly, true);
    assert.equal(json.safety.arbitraryFileResources, false);
  });

  it("prompts/list + prompts/get gercek protokolden calisir", async () => {
    const liste = await gonder("prompts/list", {});
    assert.deepEqual(liste.prompts.map((x) => x.name), [...REA_PROMPT_NAMES]);
    const arglar = Object.fromEntries(liste.prompts[0].arguments.map((a) => [a.name, a.required]));
    assert.deepEqual(arglar, { path: true, focus: false });
    const al = await gonder("prompts/get", { name: "android-triage", arguments: { path: "uygulama.apk", focus: "ag" } });
    assert.match(al.messages[0].content.text, /rea_jadx_manifest/);
    assert.match(al.messages[0].content.text, /VM\/CI/);
  });
});
