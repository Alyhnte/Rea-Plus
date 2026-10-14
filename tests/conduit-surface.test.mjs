// conduit-surface.test.mjs: conduit 30 aracinin MCP sozlesmesinin gercek
// protokol kaniti (InMemoryTransport). Kos: npm run build sonrasi
// `node --test tests/conduit-surface.test.mjs`.
// Kapsam: toplam 171 korunur; 30 conduit adinin tamami annotations tasir;
// tehlikeli araclar readOnly degildir; outputSchema yalniz sabit sekilli 10
// aracta; tools/call'da structuredContent == text JSON (basari + isError).
// Canli motor/hedef ACILMAZ: cagrilan conduit araclari yalniz surec-ici
// registry'ye dokunur (health/session_*/events_pull) veya bilinmeyen
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
const SEMALI_10 = [
  "health", "session_list", "session_open", "session_close", "close_target",
  "open_target", "debug_close", "events_pull", "prerequisites", "explain",
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

  it("30 aracin tamami annotations tasir; sayilar sabittir; sema 10 aracta", () => {
    const metal = BEKLENEN_30.map((ad) => [ad, conduitToolMetadata(ad)]);
    for (const [ad, m] of metal) assert.ok(m?.annotations, `${ad} annotations tasimali`);
    assert.deepEqual(metal.filter(([, m]) => m.outputSchema).map(([ad]) => ad).sort(), [...SEMALI_10].sort());
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

  it("tools/list toplam 171 araci korur; conduit 30'un tamami vardir", () => {
    assert.equal(araclar.length, 171, `beklenen 171, gelen ${araclar.length}`);
    assert.equal(new Set(araclar.map((a) => a.name)).size, 171);
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

  it("outputSchema yalniz sabit sekilli 10 conduit araci uzerindedir", () => {
    assert.deepEqual(conduitAraclar.filter((a) => a.outputSchema).map((a) => a.name).sort(), [...SEMALI_10].sort());
    for (const ad of SEMALI_10) {
      assert.equal(araclar.find((t) => t.name === ad)?.outputSchema?.type, "object", `${ad} outputSchema nesne olmali`);
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
  });

  it("sarmalayici rea yuzune sizmaz: rea isaretleri ve isaretsizligi aynen durur", async () => {
    const selector = araclar.find((t) => t.name === "rea_evm_selector");
    assert.equal(selector.annotations?.readOnlyHint, true);
    assert.equal(selector.outputSchema?.type, "object");
    const pe = araclar.find((t) => t.name === "rea_pwn_elf_layout");
    assert.equal(pe.annotations, undefined, "rea_pwn_elf_layout conduit sarmalayicisindan isaret almamali");
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

