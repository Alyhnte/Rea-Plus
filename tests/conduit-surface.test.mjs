// conduit-surface.test.mjs: conduit 30 aracinin MCP sozlesmesinin gercek
// protokol kaniti (InMemoryTransport). Kos: npm run build sonrasi
// `node --test tests/conduit-surface.test.mjs`.
// Kapsam: toplam 183 korunur; 30 conduit adinin tamami annotations tasir;
// tehlikeli araclar readOnly degildir; outputSchema 30 conduit aracinin
// tamaminda (dalga E/1: motor cevabi paylasilan arayuzde sabit olan 20 arac
// eklendi); tools/call'da structuredContent == text JSON (basari + isError).
// Canli motor/hedef ACILMAZ: cagrilan conduit araclari yalniz surec-ici
// registry'ye dokunur (health/session_*/events_pull), kapidan once donen
// dallarla sinanir (bilinmeyen session, confirm kapisi, acilmamis hedefin
// debug_state/static_info basarisi) veya bilinmeyen
// session_id ile motor cagrisindan ONCE hata zarfi doner (debug_state).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createReaPlusMcpServer } from "../dist/server.js";
import { CONDUIT_TOOL_NAMES, conduitToolMetadata, registerWithConduitSurface } from "../dist/server/conduitMetadata.js";

// Bagimsiz referans liste: src/conduit-core kayitlarindaki 30 donmus isim.
// CONDUIT_TOOL_NAMES bununla birebir ayni olmali; sapma testte patlar.
const BEKLENEN_30 = [
  "close_target", "debug_attach", "debug_breakpoint", "debug_callstack",
  "debug_close", "debug_code", "debug_continue", "debug_memory", "debug_open",
  "debug_pause", "debug_plugin", "debug_registers", "debug_state", "debug_step",
  "debug_thread", "debug_time", "disassemble", "dump", "events_pull", "explain",
  "get_cfg", "health", "open_target", "prerequisites", "session_close",
  "session_list", "session_open", "static_info", "strings", "xrefs",
];

const READ_ONLY_4 = ["health", "session_list", "events_pull", "prerequisites"];
const DESTRUCTIVE_13 = [
  "session_close", "open_target", "close_target", "debug_open", "debug_attach",
  "debug_close", "debug_breakpoint", "debug_continue", "debug_step",
  "debug_pause", "debug_code", "debug_thread", "debug_time",
];
const KAPALI_4 = ["health", "session_open", "session_list", "events_pull"]; // openWorld olmayanlar
const SEMALI_30 = [
  "health", "session_list", "session_open", "session_close", "close_target",
  "open_target", "debug_close", "events_pull", "prerequisites", "explain",
  // Dalga E/1: motor cevabi paylasilan arayuzde sabit 20 arac.
  "static_info", "disassemble", "get_cfg", "xrefs", "strings", "dump",
  "debug_open", "debug_attach", "debug_state", "debug_breakpoint",
  "debug_continue", "debug_step", "debug_pause", "debug_registers",
  "debug_callstack", "debug_memory", "debug_code", "debug_thread",
  "debug_plugin", "debug_time",
];
const BILINMEYEN_UUID = "00000000-0000-4000-8000-000000000000";

// REA_TOOLSETS / REA_AUDIT_LOG test boyunca kontrollu; onceki degerler geri yuklenir.
function envAyarla(toolsets) {
  const onceki = { ts: process.env.REA_TOOLSETS, audit: process.env.REA_AUDIT_LOG };
  if (toolsets === undefined) delete process.env.REA_TOOLSETS;
  else process.env.REA_TOOLSETS = toolsets;
  delete process.env.REA_AUDIT_LOG;
  return () => {
    if (onceki.ts === undefined) delete process.env.REA_TOOLSETS;
    else process.env.REA_TOOLSETS = onceki.ts;
    if (onceki.audit === undefined) delete process.env.REA_AUDIT_LOG;
    else process.env.REA_AUDIT_LOG = onceki.audit;
  };
}

async function baglan({ toolsets, opts } = {}) {
  const geriYukle = envAyarla(toolsets);
  let server;
  try {
    server = createReaPlusMcpServer(opts);
  } finally {
    geriYukle();
  }
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
    assert.ok(!y.error, `${method} protokol hatasi dondu: ${JSON.stringify(y.error)}`);
    return y.result;
  };
  await server.connect(serverT);
  await clientT.start();
  await gonder("initialize", {
    protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "conduit-surface-test", version: "0" },
  });
  await clientT.send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  return {
    gonder,
    async araclariListele() {
      const araclar = [];
      let cursor;
      do {
        const sayfa = await gonder("tools/list", cursor ? { cursor } : {});
        araclar.push(...sayfa.tools);
        cursor = sayfa.nextCursor;
      } while (cursor);
      return araclar;
    },
    async kapat() {
      try { await server.close(); } catch { /* zaten kapali */ }
      try { await clientT.close(); } catch { /* zaten kapali */ }
    },
  };
}

function textJson(sonuc) {
  const metin = sonuc.content?.find((c) => c.type === "text");
  assert.ok(metin, "text icerigi korunmali");
  return JSON.parse(metin.text);
}

// Iki kanal sozlesmesi: structuredContent, text JSON'uyla birebir ayni.
function ikiKanalAyni(sonuc, ad) {
  assert.deepEqual(sonuc.structuredContent, textJson(sonuc), `${ad}: structuredContent text JSON ile ayni olmali`);
  return sonuc.structuredContent;
}

describe("conduit metadata (birim)", () => {
  it("isim listesi donmus 30 ile birebirdir, tekrarsizdir", () => {
    assert.equal(BEKLENEN_30.length, 30);
    assert.deepEqual([...CONDUIT_TOOL_NAMES].sort(), BEKLENEN_30);
    assert.equal(new Set(CONDUIT_TOOL_NAMES).size, 30);
  });

  it("bilinmeyen/yeni conduit adi ve rea adi metadata almaz", () => {
    for (const ad of ["debug_quantum", "health2", "session_open_v2", "rea_sniff", ""]) {
      assert.equal(conduitToolMetadata(ad), undefined, `"${ad}" metadata almamali`);
    }
  });

  it("30 aracin tamami annotations tasir; sayilar sabittir; sema 30 aracta", () => {
    const metal = BEKLENEN_30.map((ad) => [ad, conduitToolMetadata(ad)]);
    for (const [ad, m] of metal) assert.ok(m?.annotations, `${ad} annotations tasimali`);
    assert.deepEqual(metal.filter(([, m]) => m.outputSchema).map(([ad]) => ad).sort(), [...SEMALI_30].sort());
    assert.equal(SEMALI_30.length, 30);
    assert.deepEqual(metal.filter(([, m]) => m.annotations.readOnlyHint === true).map(([ad]) => ad).sort(), [...READ_ONLY_4].sort());
    assert.deepEqual(metal.filter(([, m]) => m.annotations.destructiveHint === true).map(([ad]) => ad).sort(), [...DESTRUCTIVE_13].sort());
    assert.equal(metal.filter(([, m]) => m.annotations.openWorldHint === true).length, 26);
  });

  it("zararsizlar readOnly, oturum acma kapali-yazan, bellek okuma yikici degil", () => {
    assert.deepEqual(conduitToolMetadata("health").annotations, {
      readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
    });
    // prerequisites degistirmez ama python alt sureci + host taramasi yapar.
    assert.deepEqual(conduitToolMetadata("prerequisites").annotations, {
      readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true,
    });
    assert.deepEqual(conduitToolMetadata("session_open").annotations, {
      readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false,
    });
    assert.deepEqual(conduitToolMetadata("debug_open").annotations, {
      readOnlyHint: false, destructiveHint: true, openWorldHint: true,
    });
    // debug_memory action kumesi read/search/dump: yazma yok, yikici iddiasi yok.
    assert.deepEqual(conduitToolMetadata("debug_memory").annotations, {
      readOnlyHint: false, openWorldHint: true,
    });
  });
});

describe("registerWithConduitSurface (birim, sahte kayit)", () => {
  // Sahte registerTool `this` kullanir: sarmalayici SDK this baglamini bozarsa patlar.
  function sahteKur(kayitIsi) {
    const sahte = {
      kayitlar: new Map(),
      registerTool(ad, config, handler) {
        this.kayitlar.set(ad, { config, handler });
        return "kayit-ok";
      },
    };
    const gercek = sahte.registerTool;
    registerWithConduitSurface(sahte, () => kayitIsi(sahte));
    assert.equal(sahte.registerTool, gercek, "golge registerTool kaldirilmis olmali");
    return sahte.kayitlar;
  }

  it("hazir structuredContent ezilmez; nesne disi/bozuk JSON structuredContent almaz", async () => {
    const kayitlar = sahteKur((s) => {
      s.registerTool("health", { description: "x" }, async () => ({
        content: [{ type: "text", text: JSON.stringify({ x: 1 }) }],
        structuredContent: { ozel: true },
      }));
      s.registerTool("session_list", { description: "x" }, async () => ({
        content: [{ type: "text", text: "[1,2]" }],
      }));
      s.registerTool("session_open", { description: "x" }, async () => ({
        content: [{ type: "text", text: "json degil" }],
        isError: true,
      }));
    });
    const hazir = await kayitlar.get("health").handler({});
    assert.deepEqual(hazir.structuredContent, { ozel: true }, "mevcut structuredContent aynen kalmali (cift uretim yok)");
    assert.equal(hazir.content[0].text, JSON.stringify({ x: 1 }), "text kanali aynen kalmali");
    assert.ok(kayitlar.get("health").config.outputSchema, "health config'e outputSchema eklenmeli");
    assert.equal(kayitlar.get("health").config.annotations.readOnlyHint, true);
    const dizi = await kayitlar.get("session_list").handler({});
    assert.equal(dizi.structuredContent, undefined, "dizi JSON'i structuredContent olmamali");
    const bozuk = await kayitlar.get("session_open").handler({});
    assert.equal(bozuk.structuredContent, undefined, "parse edilemeyen metin structuredContent olmamali");
    assert.equal(bozuk.isError, true, "isError aynen korunur");
  });

  it("bilinmeyen ad annotations/outputSchema almaz ama nesne sonucu iki kanalli doner", async () => {
    const kayitlar = sahteKur((s) => {
      s.registerTool("yeni_bilinmeyen", { description: "x" }, async () => ({
        content: [{ type: "text", text: JSON.stringify({ a: 1 }) }],
      }));
    });
    const { config, handler } = kayitlar.get("yeni_bilinmeyen");
    assert.equal(config.annotations, undefined);
    assert.equal(config.outputSchema, undefined);
    const sonuc = await handler({});
    assert.deepEqual(sonuc.structuredContent, { a: 1 });
    assert.equal(sonuc.content[0].text, JSON.stringify({ a: 1 }));
  });
});

describe("conduit yuzeyi (gercek protokol, InMemoryTransport)", () => {
  let bag;
  let araclar;
  let conduitAraclar;
  let acilanSessionId;

  before(async () => {
    bag = await baglan();
    araclar = await bag.araclariListele();
    conduitAraclar = araclar.filter((a) => BEKLENEN_30.includes(a.name));
  });

  after(async () => {
    await bag?.kapat();
  });

  it("tools/list toplam 191 araci korur; conduit 30'un tamami vardir", () => {
    assert.equal(araclar.length, 191, `beklenen 191, gelen ${araclar.length}`);
    assert.equal(new Set(araclar.map((a) => a.name)).size, 191);
    assert.deepEqual(conduitAraclar.map((a) => a.name).sort(), BEKLENEN_30);
  });

  it("30 conduit aracinin tamami annotations tasir; toplamlar conduit altkumesinde sabittir", () => {
    for (const a of conduitAraclar) {
      assert.ok(a.annotations, `${a.name} annotations tasimali`);
      assert.equal(typeof a.annotations.readOnlyHint, "boolean", `${a.name} readOnlyHint acik olmali`);
    }
    assert.deepEqual(conduitAraclar.filter((a) => a.annotations.readOnlyHint === true).map((a) => a.name).sort(), [...READ_ONLY_4].sort());
    assert.deepEqual(conduitAraclar.filter((a) => a.annotations.destructiveHint === true).map((a) => a.name).sort(), [...DESTRUCTIVE_13].sort());
    assert.deepEqual(
      conduitAraclar.filter((a) => a.annotations.openWorldHint !== true).map((a) => a.name).sort(),
      [...KAPALI_4].sort(),
    );
    assert.equal(conduitAraclar.filter((a) => a.annotations.openWorldHint === true).length, 26);
  });

  it("tehlikeli ornekler readOnly degildir; yikici + dis dunya isaretlidir", () => {
    for (const ad of ["debug_open", "debug_attach", "debug_breakpoint", "debug_step", "debug_continue", "debug_code", "debug_time", "debug_thread", "open_target", "session_close"]) {
      const a = araclar.find((t) => t.name === ad);
      assert.equal(a.annotations.readOnlyHint, false, `${ad} readOnly olmamali`);
      assert.equal(a.annotations.destructiveHint, true, `${ad} destructive olmali`);
      assert.equal(a.annotations.openWorldHint, true, `${ad} openWorld olmali`);
    }
    // Canli bellek okuma ve motor durumu: readOnly degil ama yikici iddiasi da yok.
    for (const ad of ["debug_memory", "debug_state", "debug_registers", "disassemble", "explain"]) {
      const a = araclar.find((t) => t.name === ad);
      assert.equal(a.annotations.readOnlyHint, false, `${ad} readOnly olmamali`);
      assert.equal(a.annotations.destructiveHint, undefined, `${ad} destructive iddia etmemeli`);
      assert.equal(a.annotations.openWorldHint, true, `${ad} openWorld olmali`);
    }
    const health = araclar.find((t) => t.name === "health");
    assert.deepEqual(health.annotations, {
      readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
    });
  });

  it("outputSchema 30 conduit aracinin tamaminda; alan orneklemesi", () => {
    assert.deepEqual(conduitAraclar.filter((a) => a.outputSchema).map((a) => a.name).sort(), [...SEMALI_30].sort());
    for (const ad of SEMALI_30) {
      const s = araclar.find((t) => t.name === ad)?.outputSchema;
      const nesneMi = s?.type === "object" ||
        (Array.isArray(s?.anyOf) && s.anyOf.length > 0 && s.anyOf.every((m) => m?.type === "object"));
      assert.ok(nesneMi, `${ad} nesne/anyOf semasi tasimali`);
    }
    const health = araclar.find((t) => t.name === "health");
    for (const alan of ["status", "name", "protocol", "sessions"]) {
      assert.ok(health.outputSchema.properties[alan], `health semasi ${alan} icermeli`);
    }
    const liste = araclar.find((t) => t.name === "session_list");
    assert.ok(liste.outputSchema.properties.sessions, "session_list semasi sessions icermeli");
    const ac = araclar.find((t) => t.name === "session_open");
    assert.ok(ac.outputSchema.properties.session_id, "session_open semasi session_id icermeli");
    // Dalga D/2: kapatma zarfi, acma zarfi, olay havi, yoklama ve aciklama.
    for (const ad of ["session_close", "close_target", "debug_close"]) {
      const sema = araclar.find((t) => t.name === ad)?.outputSchema;
      assert.ok(sema.properties.closed, `${ad} semasi closed icermeli`);
      assert.ok(sema.properties.session_id, `${ad} semasi session_id icermeli`);
    }
    const hedefAc = araclar.find((t) => t.name === "open_target")?.outputSchema;
    for (const alan of ["opened", "session_id", "engine", "mode", "path"]) {
      assert.ok(hedefAc.properties[alan], `open_target semasi ${alan} icermeli`);
    }
    const olaylar = araclar.find((t) => t.name === "events_pull")?.outputSchema;
    for (const alan of ["session_id", "retainedFrom", "events"]) {
      assert.ok(olaylar.properties[alan], `events_pull semasi ${alan} icermeli`);
    }
    const yoklama = araclar.find((t) => t.name === "prerequisites")?.outputSchema;
    assert.ok(yoklama.properties.ozet, "prerequisites semasi ozet icermeli");
    assert.ok(yoklama.properties.araclar, "prerequisites semasi araclar icermeli");
    const aciklama = araclar.find((t) => t.name === "explain")?.outputSchema;
    for (const alan of ["kaynak", "dil", "ozet", "satirlar", "atlamalar", "cagrilar", "bildirimler", "komut_sayisi", "gosterilen"]) {
      assert.ok(aciklama.properties[alan], `explain semasi ${alan} icermeli`);
    }
    // Dalga E/1: tekil semalarda properties, unionlarda anyOf uyeleri.
    const alanVar = (ad, ...alanlar) => {
      const s = araclar.find((t) => t.name === ad)?.outputSchema;
      const hepsi = s?.type === "object"
        ? Object.keys(s.properties ?? {})
        : [...new Set((s.anyOf ?? []).flatMap((m) => Object.keys(m.properties ?? {})))];
      for (const alan of alanlar) assert.ok(hepsi.includes(alan), `${ad} semasi ${alan} icermeli`);
    };
    alanVar("static_info", "session_id", "engine", "capabilities", "r2", "target");
    alanVar("disassemble", "session_id", "location", "count", "ops", "text");
    alanVar("get_cfg", "session_id", "location", "function");
    alanVar("xrefs", "session_id", "address", "to", "from");
    alanVar("strings", "session_id", "total", "offset", "strings");
    alanVar("dump", "session_id", "address", "length", "format");
    alanVar("debug_open", "opened", "session_id", "engine", "mode", "attached", "path", "pid");
    alanVar("debug_attach", "attached", "session_id", "engine", "mode", "path", "pid");
    alanVar("debug_continue", "session_id", "reason", "address");
    alanVar("debug_pause", "session_id", "reason", "address");
    alanVar("debug_step", "session_id", "kind", "address");
    alanVar("debug_registers", "session_id", "general", "flags");
    alanVar("debug_callstack", "session_id", "threadId", "frames");
    const unionUye = (ad, beklenen) => {
      const s = araclar.find((t) => t.name === ad)?.outputSchema;
      assert.ok(Array.isArray(s?.anyOf), `${ad} anyOf semasi olmali`);
      assert.equal(s.anyOf.length, beklenen, `${ad} anyOf uye sayisi`);
    };
    unionUye("debug_state", 2);
    unionUye("debug_breakpoint", 3);
    unionUye("debug_memory", 2);
    unionUye("debug_code", 3);
    unionUye("debug_thread", 3);
    unionUye("debug_plugin", 3);
    unionUye("debug_time", 3);
  });

  it("sarmalayici rea yuzune sizmaz: rea isaretleri aynen durur", async () => {
    const selector = araclar.find((t) => t.name === "rea_evm_selector");
    assert.equal(selector.annotations?.readOnlyHint, true);
    assert.equal(selector.outputSchema?.type, "object");
    // Dalga E/1: pwn_elf_layout rea tarafindan readOnly isaretlidir (etkisiz
    // kapi); conduit sarmalayicisi ona sema/isaret EKLEMEZ (sema yoklugu aynidir).
    const pe = araclar.find((t) => t.name === "rea_pwn_elf_layout");
    assert.equal(pe.annotations?.readOnlyHint, true, "rea_pwn_elf_layout rea readOnly isaretini korumali");
    assert.equal(pe.outputSchema, undefined);
    const kapsama = await bag.gonder("tools/call", { name: "rea_coverage", arguments: { incelenen: 1, toplam: 4 } });
    assert.equal(ikiKanalAyni(kapsama, "rea_coverage").oran, 0.25);
  });

  it("health cagrisi: structuredContent text JSON ile ayni, sema alanlari dolu", async () => {
    const sonuc = await bag.gonder("tools/call", { name: "health", arguments: {} });
    assert.notEqual(sonuc.isError, true);
    const s = ikiKanalAyni(sonuc, "health");
    assert.equal(s.status, "ok");
    assert.equal(s.name, "conduit");
    assert.equal(typeof s.protocol, "string");
    assert.equal(typeof s.sessions, "number");
  });

  it("session_open/list/events_pull yalniz registry'ye dokunur; iki kanal ayni", async () => {
    const ac = await bag.gonder("tools/call", { name: "session_open", arguments: { engine: "radare2" } });
    assert.notEqual(ac.isError, true);
    const acS = ikiKanalAyni(ac, "session_open");
    assert.equal(acS.engine, "radare2");
    assert.match(acS.session_id, /^[0-9a-f-]{36}$/);
    acilanSessionId = acS.session_id;

    const liste = await bag.gonder("tools/call", { name: "session_list", arguments: {} });
    const listeS = ikiKanalAyni(liste, "session_list");
    assert.ok(listeS.sessions.some((x) => x.session_id === acilanSessionId), "acilan oturum listede olmali");

    const olaylar = await bag.gonder("tools/call", { name: "events_pull", arguments: { session_id: acilanSessionId } });
    assert.notEqual(olaylar.isError, true);
    const olayS = ikiKanalAyni(olaylar, "events_pull");
    assert.equal(olayS.session_id, acilanSessionId);
    assert.equal(olayS.events[0]?.kind, "session.opened");
  });

  it("explain hazir komutla debugger'a dokunmadan semaya uygun doner", async () => {
    const sonuc = await bag.gonder("tools/call", {
      name: "explain",
      arguments: {
        instructions: [
          { address: "0x1000", mnemonic: "push", operands: "rbp" },
          { address: "0x1001", mnemonic: "ret", operands: "" },
        ],
      },
    });
    assert.notEqual(sonuc.isError, true);
    const s = ikiKanalAyni(sonuc, "explain");
    assert.equal(s.kaynak, "verilen_komutlar");
    assert.equal(s.dil, "tr");
    assert.equal(s.komut_sayisi, 2);
    assert.equal(s.satirlar.length, 2);
  });

  it("dalga-E/1: static_info ve debug_state kapali zarfi semaya uygun doner", async () => {
    // Canli motor acilmaz: radare2 oturumu r2 sureci baslatmaz (static_info
    // r2 yoklamasini try/catch ile karsilar, hedef null'dur); frida oturumu
    // debug_state'te acilmamis hedef dalina duser.
    const r2Ac = await bag.gonder("tools/call", { name: "session_open", arguments: { engine: "radare2" } });
    const r2Id = ikiKanalAyni(r2Ac, "session_open(r2)").session_id;
    const bilgi = await bag.gonder("tools/call", { name: "static_info", arguments: { session_id: r2Id } });
    assert.notEqual(bilgi.isError, true);
    const bS = ikiKanalAyni(bilgi, "static_info");
    assert.equal(bS.session_id, r2Id);
    assert.equal(bS.engine, "radare2");
    assert.equal(bS.capabilities.kind, "static");
    assert.equal(bS.target, null);
    assert.equal(typeof bS.r2.available, "boolean");
    if (bS.r2.available === true) {
      assert.equal(typeof bS.r2.binary, "string");
      assert.equal(typeof bS.r2.version, "string");
    } else {
      assert.equal(typeof bS.r2.detail, "string");
    }
    const r2Kapat = await bag.gonder("tools/call", { name: "session_close", arguments: { session_id: r2Id } });
    assert.deepEqual(ikiKanalAyni(r2Kapat, "static_info(temizlik)"), { closed: true, session_id: r2Id });

    const frAc = await bag.gonder("tools/call", { name: "session_open", arguments: { engine: "frida" } });
    const frId = ikiKanalAyni(frAc, "session_open(frida)").session_id;
    const kapali = await bag.gonder("tools/call", { name: "debug_state", arguments: { session_id: frId } });
    assert.notEqual(kapali.isError, true);
    assert.deepEqual(ikiKanalAyni(kapali, "debug_state(kapali)"), {
      session_id: frId, engine: "frida", open: false, target: null,
    });
    // Confirm kapisi: gecerli oturumda bile onaysiz cagri debuggee'ye ulasmaz.
    const onaysiz = await bag.gonder("tools/call", {
      name: "debug_memory", arguments: { session_id: frId, action: "read", address: "0x0" },
    });
    assert.equal(onaysiz.isError, true);
    assert.equal(ikiKanalAyni(onaysiz, "debug_memory(onaysiz)").error, "confirmation_required");
    const frKapat = await bag.gonder("tools/call", { name: "session_close", arguments: { session_id: frId } });
    assert.deepEqual(ikiKanalAyni(frKapat, "debug_state(temizlik)"), { closed: true, session_id: frId });
  });

  it("dalga-E/1: 20 motor aracinda kapi hatasi iki kanalli doner", async () => {
    // Tum dallar motor cagrisindan once doner (session_not_found); sema hata
    // zarfina zorlanmaz ama iki kanal sozlesmesi her aracta gecerlidir.
    const hataCagrilari = [
      ["static_info", {}], ["disassemble", {}], ["get_cfg", {}],
      ["xrefs", { address: "0x400200" }], ["strings", {}], ["dump", { address: "0x400200" }],
      ["debug_open", { path: "yok.exe" }], ["debug_attach", { pid: 1 }],
      ["debug_state", {}], ["debug_breakpoint", { action: "list" }],
      ["debug_continue", {}], ["debug_step", {}], ["debug_pause", {}],
      ["debug_registers", {}], ["debug_callstack", {}],
      ["debug_memory", { action: "read", address: "0x0" }],
      ["debug_code", { action: "disassemble" }], ["debug_thread", { action: "list" }],
      ["debug_plugin", { action: "status" }], ["debug_time", { action: "timeline" }],
    ];
    assert.equal(hataCagrilari.length, 20);
    for (const [ad, args] of hataCagrilari) {
      const sonuc = await bag.gonder("tools/call", { name: ad, arguments: { session_id: BILINMEYEN_UUID, ...args } });
      assert.equal(sonuc.isError, true, `${ad} bilinmeyen oturumda hata donmeli`);
      assert.equal(ikiKanalAyni(sonuc, `${ad}(hata)`).error, "session_not_found", `${ad} kapi hatasi`);
    }
  });

  it("bilinmeyen session hatasinda isError kalir; structuredContent text ile tutarlidir", async () => {
    const olayHata = await bag.gonder("tools/call", { name: "events_pull", arguments: { session_id: BILINMEYEN_UUID } });
    assert.equal(olayHata.isError, true);
    assert.equal(ikiKanalAyni(olayHata, "events_pull(hata)").error, "session_not_found");

    const kapatHata = await bag.gonder("tools/call", { name: "session_close", arguments: { session_id: BILINMEYEN_UUID } });
    assert.equal(kapatHata.isError, true);
    assert.equal(ikiKanalAyni(kapatHata, "session_close(hata)").error, "session_not_found");

    // debug_state kapi denetimi motordan once doner: canli debugger acilmaz.
    const durumHata = await bag.gonder("tools/call", { name: "debug_state", arguments: { session_id: BILINMEYEN_UUID } });
    assert.equal(durumHata.isError, true);
    const dS = ikiKanalAyni(durumHata, "debug_state(hata)");
    assert.equal(dS.error, "session_not_found");
    assert.equal(dS.tool, "debug_state");
  });

  it("session_close ile temizlik: basarida da iki kanal ayni", async () => {
    assert.ok(acilanSessionId, "onceki oturum acik olmali");
    const kapat = await bag.gonder("tools/call", { name: "session_close", arguments: { session_id: acilanSessionId } });
    assert.notEqual(kapat.isError, true);
    assert.deepEqual(ikiKanalAyni(kapat, "session_close"), { closed: true, session_id: acilanSessionId });
    const liste = await bag.gonder("tools/call", { name: "session_list", arguments: {} });
    assert.ok(!ikiKanalAyni(liste, "session_list(temizlik)").sessions.some((x) => x.session_id === acilanSessionId));
  });
});

describe("toolset filtresi ve audit ile birlikte calisma", () => {
  it("minimal toolset'te conduit isaretleri ve structuredContent korunur", async () => {
    const bag2 = await baglan({ toolsets: "minimal" });
    try {
      const liste = await bag2.araclariListele();
      assert.equal(liste.length, 8);
      const health = liste.find((t) => t.name === "health");
      const prereq = liste.find((t) => t.name === "prerequisites");
      assert.equal(health.annotations?.readOnlyHint, true);
      assert.equal(prereq.annotations?.openWorldHint, true);
      assert.equal(liste.find((t) => t.name === "debug_open"), undefined, "debug_open minimal'de kaydolmamali");
      const sonuc = await bag2.gonder("tools/call", { name: "health", arguments: {} });
      assert.equal(ikiKanalAyni(sonuc, "health(minimal)").status, "ok");
    } finally {
      await bag2.kapat();
    }
  });

  it("audit logger conduit cagrilarini basari/hata olarak kaydeder", async () => {
    const dizin = mkdtempSync(join(tmpdir(), "conduit-surface-audit-"));
    const auditYolu = join(dizin, "audit.jsonl");
    const bag3 = await baglan({ opts: { auditLogPath: auditYolu } });
    try {
      const tamam = await bag3.gonder("tools/call", { name: "health", arguments: {} });
      assert.equal(ikiKanalAyni(tamam, "health(audit)").status, "ok");
      const hata = await bag3.gonder("tools/call", { name: "events_pull", arguments: { session_id: BILINMEYEN_UUID } });
      assert.equal(hata.isError, true);
      ikiKanalAyni(hata, "events_pull(audit-hata)");
    } finally {
      await bag3.kapat();
    }
    const kayitlar = readFileSync(auditYolu, "utf8").trim().split("\n").map((s) => JSON.parse(s));
    const healthKaydi = kayitlar.find((k) => k.tool === "health");
    const olayKaydi = kayitlar.find((k) => k.tool === "events_pull");
    assert.equal(healthKaydi?.isError, false, "health isError=false kaydolmalı");
    assert.equal(olayKaydi?.isError, true, "events_pull isError=true kaydolmalı");
    rmSync(dizin, { recursive: true, force: true });
  });
});

