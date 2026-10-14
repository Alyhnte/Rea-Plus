// toolsets.test.mjs: REA_TOOLSETS profillerinin gercek protokol kaniti.
// Kos: npm run build sonrasi `node --test tests/toolsets.test.mjs`.
// Yalniz listeleme yapilir (InMemoryTransport); hicbir arac cagrilmaz, canli is yoktur.
// Sozlesme: tanimsiz/bos/all = 171; profiller acik isim listeleridir ve tools/list
// ciktisi listeyle birebir ayni kumeyi vermelidir; bilinmeyen profil kurulumda patlar.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createReaPlusMcpServer } from "../dist/server.js";
import { TOOLSETS, TOOLSET_NAMES, parseToolsets } from "../dist/server/toolsets.js";
import { REA_SERVER_INFO_URI, REA_CAPABILITIES_SAFETY_URI, REA_PROMPT_NAMES } from "../dist/server/registerResourcesPrompts.js";

// Deterministik profil sayilari: profil listesi degisirse bu tablo bilincli guncellenmelidir.
const BEKLENEN_SAYI = { minimal: 8, static: 98, android: 27, dotnet: 20, web: 26, debug: 50 };

const ORNEKLER = {
  minimal: { dahil: ["health", "rea_sniff", "rea_investigate"], haric: ["debug_open", "rea_jadx_manifest", "rea_browser_nav", "disassemble"] },
  static: { dahil: ["disassemble", "rea_ghidra_decompile", "rea_pe_sections", "rea_evm_disasm"], haric: ["debug_open", "events_pull", "rea_adb_install", "rea_browser_nav", "rea_frida_api"] },
  android: { dahil: ["rea_jadx_decompile", "rea_apktool_build", "rea_adb_devices"], haric: ["rea_dotnet_cil", "debug_open", "rea_ghidra_funcs"] },
  dotnet: { dahil: ["rea_dotnet_metadata", "rea_ilspy_decompile", "rea_managed_compare"], haric: ["rea_jadx_manifest", "rea_browser_nav", "rea_frida_api"] },
  web: { dahil: ["rea_browser_nav", "rea_js_sourcemap", "rea_storage_dump", "rea_wasm_exports"], haric: ["rea_evm_disasm", "debug_open", "rea_adb_install"] },
  debug: { dahil: ["debug_open", "events_pull", "rea_frida_api", "rea_r2_debug"], haric: ["rea_ghidra_decompile", "rea_jadx_manifest", "rea_ilspy_decompile", "rea_browser_nav"] },
};

function envIle(deger, is) {
  const onceki = process.env.REA_TOOLSETS;
  if (deger === undefined) delete process.env.REA_TOOLSETS;
  else process.env.REA_TOOLSETS = deger;
  const geriYukle = () => {
    if (onceki === undefined) delete process.env.REA_TOOLSETS;
    else process.env.REA_TOOLSETS = onceki;
  };
  try {
    const sonuc = is();
    if (sonuc && typeof sonuc.finally === "function") return sonuc.finally(geriYukle);
    geriYukle();
    return sonuc;
  } catch (e) {
    geriYukle();
    throw e;
  }
}

// Gercek MCP protokoluyle (initialize sonrasi) tool/resource/prompt listelerini alir.
async function listeleriAl(deger) {
  return envIle(deger, async () => {
    const server = createReaPlusMcpServer();
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const yanitlar = new Map();
    let idSayac = 0;
    clientT.onmessage = (m) => { if (m.id !== undefined) yanitlar.set(m.id, m); };
    const gonder = async (method, params) => {
      const id = ++idSayac;
      await clientT.send({ jsonrpc: "2.0", id, method, params });
      for (let i = 0; i < 250 && !yanitlar.has(id); i++) await new Promise((r) => setTimeout(r, 20));
      const y = yanitlar.get(id);
      assert.ok(y, `${method} yaniti gelmedi`);
      assert.ok(!y.error, `${method} hata dondu: ${JSON.stringify(y.error)}`);
      return y.result;
    };
    try {
      await server.connect(serverT);
      await clientT.start();
      await gonder("initialize", {
        protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "toolsets-test", version: "0" },
      });
      await clientT.send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
      const araclar = [];
      let cursor;
      do {
        const sayfa = await gonder("tools/list", cursor ? { cursor } : {});
        araclar.push(...sayfa.tools.map((t) => t.name));
        cursor = sayfa.nextCursor;
      } while (cursor);
      const resources = (await gonder("resources/list", {})).resources.map((r) => r.uri);
      const prompts = (await gonder("prompts/list", {})).prompts.map((p) => p.name);
      return { araclar, resources, prompts };
    } finally {
      try { await server.close(); } catch { /* zaten kapali */ }
      try { await clientT.close(); } catch { /* zaten kapali */ }
    }
  });
}

describe("parseToolsets (birim)", () => {
  it("tanimsiz/bos/all filtre yok (allowedTools null) demektir", () => {
    for (const v of [undefined, "", "   ", "all", "ALL", " all , android "]) {
      assert.equal(parseToolsets(v).allowedTools, null, `deger: ${JSON.stringify(v)}`);
    }
    assert.deepEqual(parseToolsets(undefined).names, ["all"]);
  });

  it("virgullu birlesim tekrarsizdir; bosluk/buyuk-kucuk harf normalize edilir", () => {
    const s = parseToolsets(" Android ,dotnet, ANDROID ");
    assert.deepEqual(s.names, ["android", "dotnet"]);
    const birlesim = new Set([...TOOLSETS.android, ...TOOLSETS.dotnet]);
    assert.deepEqual([...s.allowedTools].sort(), [...birlesim].sort());
    assert.equal(s.allowedTools.size, 39); // 27 + 20 - 8 ortak cekirdek
  });

  it("bilinmeyen profil sessizce all'a dusmez, acik hata verir", () => {
    assert.throws(() => parseToolsets("bilinmeyen"), /REA_TOOLSETS bilinmeyen profil: "bilinmeyen"/);
    assert.throws(() => parseToolsets("static,yok-boyle"), /bilinmeyen profil: "yok-boyle"/);
    assert.throws(() => parseToolsets("static,,web"), /bos profil parcasi/);
    assert.throws(() => parseToolsets(","), /bos profil parcasi/);
  });

  it("profil listeleri tekrarsizdir ve sayilari sabittir", () => {
    assert.deepEqual([...TOOLSET_NAMES], ["all", "minimal", "static", "android", "dotnet", "web", "debug"]);
    for (const [ad, liste] of Object.entries(TOOLSETS)) {
      assert.equal(new Set(liste).size, liste.length, `${ad} listesinde tekrar var`);
      assert.equal(liste.length, BEKLENEN_SAYI[ad], `${ad} sayisi degisti`);
    }
  });
});

describe("toolsetler (gercek protokol, InMemoryTransport)", () => {
  it("varsayilan (tanimsiz/bos/all) mevcut 171 araci aynen korur", async () => {
    const tam = await listeleriAl(undefined);
    assert.equal(tam.araclar.length, 171);
    assert.equal(new Set(tam.araclar).size, 171, "arac adlari benzersiz olmali");
    for (const v of ["", "all"]) {
      const r = await listeleriAl(v);
      assert.deepEqual(r.araclar, tam.araclar, `REA_TOOLSETS=${JSON.stringify(v)} varsayilandan sapiyor`);
    }
  });

  it("profil listelerindeki her isim gercek bir aractir; birlesimleri 171'i kapsar", async () => {
    const tam = new Set((await listeleriAl(undefined)).araclar);
    const birlesim = new Set();
    for (const [ad, liste] of Object.entries(TOOLSETS)) {
      for (const arac of liste) {
        assert.ok(tam.has(arac), `${ad} profilindeki "${arac}" gercek tools/list'te yok`);
        birlesim.add(arac);
      }
    }
    assert.equal(birlesim.size, 171, "adlandirilmis profillerin birlesimi tum araclari kapsamali");
  });

  for (const ad of Object.keys(TOOLSETS)) {
    it(`${ad}: tools/list profil listesiyle birebir ayni kumeyi verir (${BEKLENEN_SAYI[ad]})`, async () => {
      const { araclar } = await listeleriAl(ad);
      assert.equal(araclar.length, BEKLENEN_SAYI[ad]);
      assert.deepEqual([...araclar].sort(), [...TOOLSETS[ad]].sort());
      const kume = new Set(araclar);
      for (const ornek of ORNEKLER[ad].dahil) assert.ok(kume.has(ornek), `${ad} icermeli: ${ornek}`);
      for (const ornek of ORNEKLER[ad].haric) assert.ok(!kume.has(ornek), `${ad} icermemeli: ${ornek}`);
    });
  }

  it("virgullu birlesim protokolde de birlesimdir (android,dotnet = 39; static,debug = 136)", async () => {
    const ad39 = await listeleriAl("android,dotnet");
    assert.equal(ad39.araclar.length, 39);
    assert.deepEqual(
      [...ad39.araclar].sort(),
      [...new Set([...TOOLSETS.android, ...TOOLSETS.dotnet])].sort(),
    );
    const sd = await listeleriAl("static,debug");
    assert.equal(sd.araclar.length, 136); // 98 + 50 - 12 ortak (cekirdek 8 + session 3 + explain)
    assert.ok(sd.araclar.includes("rea_ghidra_decompile") && sd.araclar.includes("debug_open"));
    assert.ok(!sd.araclar.includes("rea_jadx_manifest") && !sd.araclar.includes("rea_browser_nav"));
    const hepsi = await listeleriAl("minimal,static,android,dotnet,web,debug");
    assert.equal(hepsi.araclar.length, 171);
  });

  it("resources/prompts listesi toolset'ten etkilenmez", async () => {
    for (const v of [undefined, "minimal", "debug"]) {
      const { resources, prompts } = await listeleriAl(v);
      assert.deepEqual(resources, [REA_SERVER_INFO_URI, REA_CAPABILITIES_SAFETY_URI], `deger: ${JSON.stringify(v)}`);
      assert.deepEqual(prompts, [...REA_PROMPT_NAMES], `deger: ${JSON.stringify(v)}`);
    }
  });

  it("bilinmeyen profil sunucu kurulumunda hata verir; sonrasi temiz kurulum calisir", async () => {
    envIle("boyle-profil-yok", () => {
      assert.throws(() => createReaPlusMcpServer(), /REA_TOOLSETS bilinmeyen profil: "boyle-profil-yok"/);
    });
    // Sarmalayici prototipi kirletmemeli: filtreli ve filtresiz kurulumlar birbirini etkilemez.
    assert.equal((await listeleriAl("minimal")).araclar.length, 8);
    assert.equal((await listeleriAl(undefined)).araclar.length, 171);
    assert.equal((await listeleriAl("web")).araclar.length, 26);
  });
});
