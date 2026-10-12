// harmony.test.mjs: sahte HAP zip fixture + liste + manifest + bozuk kapıları (offline).
// Koş: node --test tests/harmony.test.mjs
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { rea_hap_liste, rea_hap_manifest } from "../dist/rea-domains/harmony/Harmony.js";

let DIR = "";
// Fixture HAP'ı test içinde kur: config.json deflate, module.json stored.
const CFG = JSON.stringify({ app: { bundleName: "com.ornek.hap", version: { name: "1.2.3" } } });
const MOD = JSON.stringify({ package: "com.ornek.yedek", version: "9.9.9" });
// Minimal zip yazıcı: local + central + EOCD (CRC bakılmaz, okuyucu denetlemez).
function zipYap(girdiler) {
  const yer = [], mer = [];
  let ofset = 0;
  for (const g of girdiler) {
    const ad = Buffer.from(g.ad, "utf8");
    const ham = g.yontem === 8 ? deflateRawSync(g.veri) : Buffer.from(g.veri);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(g.yontem, 8);
    lh.writeUInt32LE(ham.length, 18); lh.writeUInt32LE(g.veri.length, 22);
    lh.writeUInt16LE(ad.length, 26);
    yer.push(lh, ad, ham);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(g.yontem, 10);
    ch.writeUInt32LE(ham.length, 20); ch.writeUInt32LE(g.veri.length, 24);
    ch.writeUInt16LE(ad.length, 28); ch.writeUInt32LE(ofset, 42);
    mer.push(ch, ad);
    ofset += 30 + ad.length + ham.length;
  }
  const mbuf = Buffer.concat(mer);
  const eo = Buffer.alloc(22);
  eo.writeUInt32LE(0x06054b50, 0);
  eo.writeUInt16LE(girdiler.length, 8); eo.writeUInt16LE(girdiler.length, 10);
  eo.writeUInt32LE(mbuf.length, 12); eo.writeUInt32LE(ofset, 16);
  return Buffer.concat([...yer, mbuf, eo]);
}

before(() => {
  DIR = mkdtempSync(join(tmpdir(), "hap-"));
  writeFileSync(join(DIR, "ornek.hap"), zipYap([
    { ad: "config.json", veri: Buffer.from(CFG, "utf8"), yontem: 8 },
    { ad: "module.json", veri: Buffer.from(MOD, "utf8"), yontem: 0 },
  ]));
  writeFileSync(join(DIR, "yedek.hap"), zipYap([{ ad: "entry/module.json", veri: Buffer.from(MOD, "utf8"), yontem: 0 }]));
  writeFileSync(join(DIR, "duz.txt"), "HAP değilim, düz metnim");
  writeFileSync(join(DIR, "kesik.hap"), Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.alloc(100)]));
});

describe("rea_hap_liste", () => {
  // Central directory iki adı da sırasıyla vermeli.
  it("iki dosya adını listeler", () => {
    const r = rea_hap_liste(join(DIR, "ornek.hap"));
    assert.equal(r.ok, true);
    assert.deepEqual(r.dosyalar, ["config.json", "module.json"]);
  });
  // Özet sayacı central adet alanıyla tutarlı olmalı.
  it("sayi alanını taşır", () => {
    const r = rea_hap_liste(join(DIR, "ornek.hap"));
    assert.equal(r.ok, true);
    assert.equal(r.sayi, 2);
  });
  // PK imzası yoksa HAP değildir: sessiz kapı.
  it("zip olmayan dosya capability_unsupported verir", () => {
    const r = rea_hap_liste(join(DIR, "duz.txt"));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  // Olmayan yol dosya kapısına takılır.
  it("olmayan dosya capability_unsupported verir", () => {
    const r = rea_hap_liste(join(DIR, "yok.hap"));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_hap_manifest", () => {
  // Deflate config.json inflate edilip bundle+version çözülmeli.
  it("config.json'dan bundleName/version çözer", () => {
    const r = rea_hap_manifest(join(DIR, "ornek.hap"));
    assert.equal(r.ok, true);
    assert.equal(r.bundleName, "com.ornek.hap");
    assert.equal(r.version, "1.2.3");
    assert.equal(r.kaynak, "config.json");
  });
  // config yoksa alt dizindeki module.json yedeğe düşmeli.
  it("config yoksa module.json yedeğini kullanır", () => {
    const r = rea_hap_manifest(join(DIR, "yedek.hap"));
    assert.equal(r.ok, true);
    assert.equal(r.bundleName, "com.ornek.yedek");
    assert.equal(r.version, "9.9.9");
  });
  // EOCD'siz kesik dosya manifest kapısına takılır, fırlatmaz.
  it("kesik HAP capability_unsupported verir", () => {
    const r = rea_hap_manifest(join(DIR, "kesik.hap"));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});
