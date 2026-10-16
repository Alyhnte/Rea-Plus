#!/usr/bin/env node
// olcut-semabutce.mjs: ReaPlus şema bütçesi ölçümü (Dalga K/1).
// Koş: npm run build sonrası `node scripts/olcut-semabutce.mjs`.
// Ne ölçer (hepsi UTF-8 JSON baytı, Buffer.byteLength):
//   - listeBayt: tools/list yanıtındaki araç dizisinin JSON baytı
//     (sayfalama döngüsüyle toplanır; bugün tek sayfa, 187 araç).
//   - semaToplamBayt: outputSchema taşıyan araçların şema JSON bayt toplamı.
//   - ortalamaBayt: semaToplamBayt / araçSayısı (payda 187; şemasız 4 araç
//     dahil — muhafazakâr, şişmeyi gizlemez).
// Bilgi amaçlı da döner: semaSayisi, girdiToplamBayt (inputSchema toplamı,
// bütçesiz — compact 13KB kapısı ayrı tests/compact.test.mjs'tedir).
// Yan etki yok: süreç-içi InMemoryTransport, audit log kapalı, dosya/ağ yazmaz.
// Açtığı sunucu/istemciyi kapatır; asılı timer/süreç bırakmaz.
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createReaPlusMcpServer } from "../dist/server.js";

const ISTEK_TAVAN_MS = 15_000;

export async function olcSemabutce() {
  // Tam yüzey: profil filtresi ve dosya audit'i ölçümde kapalı (önceki değerler geri yüklenir).
  const oncekiToolsets = process.env.REA_TOOLSETS;
  const oncekiAudit = process.env.REA_AUDIT_LOG;
  delete process.env.REA_TOOLSETS;
  delete process.env.REA_AUDIT_LOG;
  let server = null;
  let clientT = null;
  try {
    server = createReaPlusMcpServer();
    const pair = InMemoryTransport.createLinkedPair();
    clientT = pair[0];
    const serverT = pair[1];
    const yanitlar = new Map();
    let idSayac = 0;
    clientT.onmessage = (m) => {
      if (m.id !== undefined) yanitlar.set(m.id, m);
    };
    const gonder = async (method, params) => {
      const id = ++idSayac;
      await clientT.send({ jsonrpc: "2.0", id, method, params });
      const t0 = Date.now();
      while (!yanitlar.has(id)) {
        if (Date.now() - t0 > ISTEK_TAVAN_MS) throw new Error(`${method} yanıtı gelmedi`);
        await new Promise((r) => setTimeout(r, 5));
      }
      const y = yanitlar.get(id);
      if (y.error) throw new Error(`${method} protokol hatası: ${JSON.stringify(y.error)}`);
      return y.result;
    };
    await server.connect(serverT);
    await clientT.start();
    await gonder("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "olcut-semabutce", version: "0" },
    });
    await clientT.send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    const araclar = [];
    let cursor;
    do {
      const sayfa = await gonder("tools/list", cursor ? { cursor } : {});
      araclar.push(...sayfa.tools);
      cursor = sayfa.nextCursor;
    } while (cursor);

    const listeBayt = Buffer.byteLength(JSON.stringify({ tools: araclar }), "utf8");
    let semaToplamBayt = 0;
    let semaSayisi = 0;
    let girdiToplamBayt = 0;
    for (const a of araclar) {
      if (a.outputSchema) {
        semaSayisi++;
        semaToplamBayt += Buffer.byteLength(JSON.stringify(a.outputSchema), "utf8");
      }
      if (a.inputSchema) girdiToplamBayt += Buffer.byteLength(JSON.stringify(a.inputSchema), "utf8");
    }
    return {
      aracSayisi: araclar.length,
      listeBayt,
      semaSayisi,
      semaToplamBayt,
      girdiToplamBayt,
      ortalamaBayt: araclar.length ? semaToplamBayt / araclar.length : 0,
    };
  } finally {
    try {
      await server?.close();
    } catch {
      /* zaten kapalı */
    }
    try {
      await clientT?.close();
    } catch {
      /* zaten kapalı */
    }
    if (oncekiToolsets === undefined) delete process.env.REA_TOOLSETS;
    else process.env.REA_TOOLSETS = oncekiToolsets;
    if (oncekiAudit === undefined) delete process.env.REA_AUDIT_LOG;
    else process.env.REA_AUDIT_LOG = oncekiAudit;
  }
}

const argv1 = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (argv1.endsWith("/scripts/olcut-semabutce.mjs")) {
  const r = await olcSemabutce();
  console.log(
    `araç=${r.aracSayisi} şemalı=${r.semaSayisi} liste=${r.listeBayt}B ` +
      `şemaToplam=${r.semaToplamBayt}B girdiToplam=${r.girdiToplamBayt}B ` +
      `ortalama=${r.ortalamaBayt.toFixed(1)}B/araç`,
  );
}
