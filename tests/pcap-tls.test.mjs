// pcap-tls.test.mjs: PcapBridge — saf TS pcap okuma + TLS keylog çözme (Dalga G/5).
// Fixture'lar geçici dizinde üretilir (tests/corpus'a dosya EKLENMEZ).
// Koş: node --test tests/pcap-tls.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  PCAP_TOOLS,
  keylogOku,
  pcapAkislar,
  pcapPaketleri,
  tsharkIleOku,
  tsharkKontrol,
} from "../dist/rea-domains/behavior/PcapBridge.js";

// ---- minimal pcap üretici (geçici dizin; saf Ethernet/IPv4/TCP) ----
const ipB = (ip) => Buffer.from(ip.split(".").map(Number));
function tcpFrame(srcIp, dstIp, srcPort, dstPort, seq, payload) {
  const data = Buffer.from(payload);
  const eth = Buffer.alloc(14);
  eth.writeUInt16BE(0x0800, 12);
  const ip = Buffer.alloc(20);
  ip[0] = 0x45;
  ip.writeUInt16BE(20 + 20 + data.length, 2);
  ip.writeUInt16BE(0x4000, 6);
  ip[8] = 64;
  ip[9] = 6;
  ipB(srcIp).copy(ip, 12);
  ipB(dstIp).copy(ip, 16);
  const tcp = Buffer.alloc(20);
  tcp.writeUInt16BE(srcPort, 0);
  tcp.writeUInt16BE(dstPort, 2);
  tcp.writeUInt32BE(seq >>> 0, 4);
  tcp[12] = 0x50;
  tcp[13] = 0x18;
  tcp.writeUInt16BE(64240, 14);
  return Buffer.concat([eth, ip, tcp, data]);
}
function pcapYaz(frames) {
  const gh = Buffer.alloc(24);
  gh.writeUInt32LE(0xa1b2c3d4, 0);
  gh.writeUInt16LE(2, 4);
  gh.writeUInt16LE(4, 6);
  gh.writeUInt32LE(65535, 16);
  gh.writeUInt32LE(1, 20); // DLT_EN10MB
  const out = [gh];
  let ts = 1700000000;
  for (const f of frames) {
    const ph = Buffer.alloc(16);
    ph.writeUInt32LE(ts++, 0);
    ph.writeUInt32LE(f.length, 8);
    ph.writeUInt32LE(f.length, 12);
    out.push(ph, f);
  }
  return Buffer.concat(out);
}
// ClientHello: record(0x16) + handshake(0x01) + version + 32B random.
function clientHello(random32) {
  const body = Buffer.concat([Buffer.from([0x03, 0x03]), random32, Buffer.from([0x00])]);
  const hs = Buffer.alloc(4);
  hs[0] = 0x01;
  hs.writeUIntBE(body.length, 1, 3);
  const rec = Buffer.alloc(5);
  rec[0] = 0x16;
  rec[1] = 0x03;
  rec[2] = 0x01;
  rec.writeUInt16BE(hs.length + body.length, 3);
  return Buffer.concat([rec, hs, body]);
}
const xorCrypt = (buf, secret) =>
  Buffer.from(buf.map((b, i) => b ^ secret[i % secret.length]));

async function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), "rea-pcap-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("PcapBridge TCP akış birleştirme", () => {
  it("(a) sıra-dışı segmentler seq'e göre birleşir", async () => {
    await withTmp(async (dir) => {
      const yol = join(dir, "akis.pcap");
      const p1 = Buffer.from("merha");
      const p2 = Buffer.from("ba ");
      const p3 = Buffer.from("dünya");
      // Yakalama sırası karışık, seq doğru: 0, 5, 8.
      writeFileSync(
        yol,
        pcapYaz([
          tcpFrame("127.0.0.1", "127.0.0.1", 40001, 8443, 8, p3),
          tcpFrame("127.0.0.1", "127.0.0.1", 40001, 8443, 0, p1),
          tcpFrame("127.0.0.1", "127.0.0.1", 40001, 8443, 5, p2),
        ]),
      );
      const r = await pcapAkislar(yol);
      assert.equal(r.ok, true);
      assert.equal(r.details.paketSayisi, 3);
      assert.equal(r.details.akisSayisi, 1);
      const akis = r.details.akislar[0];
      assert.equal(akis.bayt, p1.length + p2.length + p3.length);
      assert.equal(akis.veri.toString("utf8"), "merhaba dünya");
    });
  });

  it("(a2) pcapPaketleri streaming üretir (tamamı belleğe alınmaz)", async () => {
    await withTmp(async (dir) => {
      const yol = join(dir, "stream.pcap");
      writeFileSync(
        yol,
        pcapYaz([
          tcpFrame("127.0.0.1", "127.0.0.1", 40002, 80, 0, Buffer.from("a")),
          tcpFrame("127.0.0.1", "127.0.0.1", 40002, 80, 1, Buffer.from("b")),
        ]),
      );
      let n = 0;
      for await (const p of pcapPaketleri(yol)) {
        n++;
        assert.equal(p.srcIp, "127.0.0.1");
        assert.equal(p.srcPort, 40002);
      }
      assert.equal(n, 2);
    });
  });
});

describe("PcapBridge TLS keylog", () => {
  it("(b) keylog ile işaretli yük çözülür", async () => {
    await withTmp(async (dir) => {
      const random32 = randomBytes(32);
      const secret = randomBytes(48);
      const gizli = Buffer.from("gizli-mesaj-123", "utf8");
      const sifreli = xorCrypt(gizli, secret);
      const yuk = Buffer.concat([Buffer.from("REA-XOR:"), sifreli]);
      const yol = join(dir, "tls.pcap");
      writeFileSync(
        yol,
        pcapYaz([
          tcpFrame("127.0.0.1", "127.0.0.1", 40003, 443, 0, clientHello(random32)),
          tcpFrame("127.0.0.1", "127.0.0.1", 40003, 443, 100, yuk),
        ]),
      );
      const keylog = `# SSLKEYLOGFILE\nCLIENT_RANDOM ${random32.toString("hex")} ${secret.toString("hex")}\n`;
      assert.equal(keylogOku(keylog).size, 1);
      const r = await pcapAkislar(yol, { keylogMetin: keylog });
      assert.equal(r.ok, true);
      const akis = r.details.akislar[0];
      assert.equal(akis.sifreli, false);
      assert.equal(akis.cozuldu, true);
      assert.equal(akis.icerik, "gizli-mesaj-123");
    });
  });

  it("(c) keylog yoksa akış 'şifreli' işaretlenir, sahte içerik yok", async () => {
    await withTmp(async (dir) => {
      const random32 = randomBytes(32);
      const secret = randomBytes(48);
      const yuk = Buffer.concat([Buffer.from("REA-XOR:"), xorCrypt(Buffer.from("gizli", "utf8"), secret)]);
      const yol = join(dir, "sifreli.pcap");
      writeFileSync(
        yol,
        pcapYaz([
          tcpFrame("127.0.0.1", "127.0.0.1", 40004, 443, 0, clientHello(random32)),
          tcpFrame("127.0.0.1", "127.0.0.1", 40004, 443, 100, yuk),
        ]),
      );
      const r = await pcapAkislar(yol);
      assert.equal(r.ok, true);
      const akis = r.details.akislar[0];
      assert.equal(akis.sifreli, true);
      assert.equal(akis.cozuldu, false);
      assert.equal(akis.icerik, null);
    });
  });

  it("(c2) yanlış keylog eşleşmezse yine şifreli kalır", async () => {
    await withTmp(async (dir) => {
      const random32 = randomBytes(32);
      const yol = join(dir, "yanlis.pcap");
      writeFileSync(
        yol,
        pcapYaz([tcpFrame("127.0.0.1", "127.0.0.1", 40005, 443, 0, clientHello(random32))]),
      );
      const baska = randomBytes(32).toString("hex");
      const r = await pcapAkislar(yol, {
        keylogMetin: `CLIENT_RANDOM ${baska} ${randomBytes(48).toString("hex")}\n`,
      });
      assert.equal(r.ok, true);
      assert.equal(r.details.akislar[0].sifreli, true);
      assert.equal(r.details.akislar[0].icerik, null);
    });
  });
});

describe("PcapBridge tshark + büyük pcap", () => {
  it("araç adı rea_pcap_oku", () => {
    assert.ok(PCAP_TOOLS.includes("rea_pcap_oku"));
  });

  it("(d) tshark yoksa dürüst dal (throw yok)", async () => {
    await withTmp(async (dir) => {
      const yol = join(dir, "bos.pcap");
      writeFileSync(yol, pcapYaz([tcpFrame("127.0.0.1", "127.0.0.1", 40006, 80, 0, Buffer.from("x"))]));
      if (!tsharkKontrol()) {
        const r = await tsharkIleOku(yol);
        assert.equal(r.ok, false);
        assert.match(r.reason, /tshark/i);
      } else {
        const r = await tsharkIleOku(yol);
        assert.equal(r.ok, true);
        assert.ok(r.details.paketSayisi >= 1);
      }
    });
  });

  it("(e) büyük pcap streaming okunur (N paket, sayı gerçek değere dayanır)", async () => {
    await withTmp(async (dir) => {
      const N = 2000;
      const govde = Buffer.from("k", "utf8");
      const frames = [];
      for (let i = 0; i < N; i++) {
        frames.push(tcpFrame("127.0.0.1", "127.0.0.1", 41000 + (i % 4), 80, i, govde));
      }
      const yol = join(dir, "buyuk.pcap");
      writeFileSync(yol, pcapYaz(frames));
      const r = await pcapAkislar(yol);
      assert.equal(r.ok, true);
      assert.equal(r.details.paketSayisi, N);
      assert.equal(r.details.akisSayisi, 4);
      for (const a of r.details.akislar) {
        assert.equal(a.bayt, (N / 4) * govde.length);
      }
      // Streaming kanıtı: kaynak createReadStream kullanır, pcap yolunu toptan okumaz.
      const kaynak = readFileSync(new URL("../src/rea-domains/behavior/PcapBridge.ts", import.meta.url), "utf8");
      assert.ok(kaynak.includes("createReadStream"), "streaming yok");
      assert.ok(!kaynak.includes("readFileSync(pcapYol") && !kaynak.includes("readFileSync(yol"), "toptan okuma var");
    });
  });
});
