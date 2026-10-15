// streaming-read.test.mjs: büyük dosya streaming okuma (Dalga G/8).
// Hedef: GB'lık imajlarda OOM bitirme — başlık + aralıklı pencere okuma
// (mmap yok, fs read + offset), sabit tampon (64KB), erken çıkış, iptal.
// Fixture'lar geçici dizinde (seyrek büyük dosyalar); tests/corpus'a dokunulmaz.
// Koş: npm run build sonrası `node --test tests/streaming-read.test.mjs`
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, truncateSync, statSync, openSync, writeSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PencereAkis, STREAMING_PENCERE, baslikOku, sniffFile } from "../dist/facade/sniff.js";
import { rea_investigate } from "../dist/facade/investigate.js";
import { rea_dotnet_metadata, rea_il2cpp_metadata } from "../dist/rea-domains/dotnet/ManagedInspector.js";
import { rea_unpack_try } from "../dist/rea-domains/unpack/Unpack.js";

const W = 64 * 1024;
const BUYUK_BOY = 56 * 1024 * 1024; // 56MB seyrek dosya
const IMZA = Buffer.from("REA-STREAM-IMZA", "latin1");
const IMZA_OFSET = 200 * 1024; // 200KB — 4. pencereye düşer ([196608,262144))

let DIR = "";
let BUYUK_ELF = "";
let BUYUK_PE = "";
let IMZA_DOSYA = "";
let BUYUK_META = "";
const KUCUK_PE = join(dirname(fileURLToPath(import.meta.url)), "corpus", "mini_pe_x64.exe");
const KUCUK_ELF = join(dirname(fileURLToPath(import.meta.url)), "corpus", "mini_branch.elf");

// En küçük PE32+ başlığı (fixes-regression ile aynı düzen): CLR dizini dolgulu/boş.
function sahtePE(clrRva) {
  const b = Buffer.alloc(512);
  b.write("MZ", 0);
  b.writeUInt32LE(128, 0x3c);
  b.write("PE\0\0", 128);
  b.writeUInt16LE(0x8664, 132);
  b.writeUInt16LE(1, 134);
  b.writeUInt16LE(240, 148);
  const opt = 152;
  b.writeUInt16LE(0x20b, opt);
  b.writeUInt32LE(16, opt + 108);
  b.writeUInt32LE(clrRva, opt + 112 + 14 * 8);
  b.writeUInt32LE(clrRva ? 72 : 0, opt + 112 + 14 * 8 + 4);
  return b;
}

// Sahte global-metadata.dat başlığı (il2cpp-depth ile aynı düzen).
function sahteMeta(sinif, metod) {
  const buf = Buffer.alloc(256, 0);
  buf.writeUInt32LE(0xfab11baf, 0);
  buf.writeUInt32LE(29, 4);
  buf.writeUInt32LE(64, 48); buf.writeUInt32LE(metod, 52);
  buf.writeUInt32LE(128, 160); buf.writeUInt32LE(sinif, 164);
  buf.writeUInt32LE(200, 168); buf.writeUInt32LE(1, 172);
  buf.writeUInt32LE(208, 176); buf.writeUInt32LE(1, 180);
  return buf;
}

// Belirli ofsete yaz (seyrek dosya ortasına imza gömme).
function ofseteYaz(yol, ofset, veri) {
  const fd = openSync(yol, "r+");
  try {
    let yazildi = 0;
    while (yazildi < veri.length) {
      const k = writeSync(fd, veri, yazildi, veri.length - yazildi, ofset + yazildi);
      if (k <= 0) throw new Error("yazılamadı");
      yazildi += k;
    }
  } finally {
    closeSync(fd);
  }
}

before(() => {
  DIR = mkdtempSync(join(tmpdir(), "streaming-read-"));
  BUYUK_ELF = join(DIR, "buyuk.elf");
  writeFileSync(BUYUK_ELF, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]));
  truncateSync(BUYUK_ELF, BUYUK_BOY);
  BUYUK_PE = join(DIR, "buyuk-managed.dll");
  writeFileSync(BUYUK_PE, sahtePE(0x2000));
  truncateSync(BUYUK_PE, 40 * 1024 * 1024);
  IMZA_DOSYA = join(DIR, "imza.bin");
  writeFileSync(IMZA_DOSYA, Buffer.from([0x4d, 0x5a]));
  truncateSync(IMZA_DOSYA, BUYUK_BOY);
  ofseteYaz(IMZA_DOSYA, IMZA_OFSET, IMZA);
  BUYUK_META = join(DIR, "global-metadata.dat");
  writeFileSync(BUYUK_META, sahteMeta(3, 7));
  truncateSync(BUYUK_META, 32 * 1024 * 1024);
});

after(() => {
  try { rmSync(DIR, { recursive: true, force: true }); } catch { /* temizlik en iyi efor */ }
});

describe("(a) büyük dosyada başlık doğru okunur", () => {
  it("sabit tampon 64KB'tır", () => {
    assert.equal(STREAMING_PENCERE, W);
  });
  it("56MB dosyada ELF başlığı doğru tanınır", () => {
    assert.equal(statSync(BUYUK_ELF).size, BUYUK_BOY);
    assert.deepEqual(sniffFile(BUYUK_ELF), { tip: "elf", motor: "radare2" });
  });
  it("baslikOku ilk baytları tam dosyayı açmadan verir", () => {
    const ilk = baslikOku(BUYUK_ELF, 4);
    assert.ok(ilk);
    assert.deepEqual(Buffer.from(ilk), Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
    assert.equal(baslikOku(join(DIR, "yok.bin"), 4), null);
  });
  it("40MB managed PE'de CLR başlığı doğrulanır", () => {
    assert.equal(statSync(BUYUK_PE).size, 40 * 1024 * 1024);
    const r = rea_dotnet_metadata(BUYUK_PE);
    assert.equal(r.ok, true);
  });
  it("32MB metadata'da sınıf/metod sayımı başlıktan çıkar", () => {
    assert.equal(statSync(BUYUK_META).size, 32 * 1024 * 1024);
    const r = rea_il2cpp_metadata(BUYUK_META);
    assert.equal(r.ok, true);
    assert.equal(r.sinifSayisi, 3);
    assert.equal(r.metodSayisi, 7);
  });
  it("56MB dosyada investigate elf planı kurar", () => {
    const r = rea_investigate(BUYUK_ELF, "ne yapıyor?");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.tip, "elf");
    assert.equal(r.motor, "radare2");
  });
});

describe("(b) bellek tavanı aşılmaz (kanıtlı)", () => {
  it("56MB taramada tek pencere 64KB'ı aşmaz, heap deltası küçüktür", () => {
    const akis = new PencereAkis(BUYUK_ELF);
    const heapOnce = process.memoryUsage().heapUsed;
    let toplam = 0;
    for (const p of akis.pencereler()) {
      assert.ok(p.veri.length <= W, `pencere ${p.veri.length}`);
      toplam += p.veri.length;
    }
    const heapDelta = process.memoryUsage().heapUsed - heapOnce;
    assert.equal(toplam, BUYUK_BOY);
    assert.equal(akis.pencereSayisi, Math.ceil(BUYUK_BOY / W)); // 896
    assert.equal(akis.okunan, BUYUK_BOY);
    assert.ok(akis.tavan <= W, `tavan ${akis.tavan}`);
    assert.equal(akis.kapatildi, true);
    assert.ok(heapDelta < 16 * 1024 * 1024, `heapDelta ${heapDelta}`);
    console.log(`    [kanıt] pencere=${akis.pencereSayisi} okunan=${akis.okunan}B tavan=${akis.tavan}B heapDelta=${heapDelta}B`);
  });
});

describe("(c) erken çıkış çalışır", () => {
  it("imza bulununca üretici durur, dosyanın tamamı okunmaz", () => {
    const akis = new PencereAkis(IMZA_DOSYA);
    let bulunan = -1;
    for (const p of akis.pencereler()) {
      const i = p.veri.indexOf(IMZA);
      if (i >= 0) { bulunan = p.ofset + i; break; }
    }
    assert.equal(bulunan, IMZA_OFSET);
    assert.equal(akis.pencereSayisi, 4); // imza 4. pencerede
    assert.equal(akis.okunan, 4 * W); // 262144B << 56MB
    assert.ok(akis.okunan < BUYUK_BOY);
    assert.equal(akis.kapatildi, true);
    console.log(`    [kanıt] ofset=${bulunan} okunan=${akis.okunan}B dosya=${BUYUK_BOY}B`);
  });
});

describe("(d) iptal üreticiyi durdurur", () => {
  it("önceden iptal edilmiş sinyalde hiç okuma yapılmaz", () => {
    const c = new AbortController();
    c.abort();
    const akis = new PencereAkis(IMZA_DOSYA, { sinyal: c.signal });
    assert.throws(() => { akis.pencereler().next(); }, (e) => e.name === "AbortError");
    assert.equal(akis.okunan, 0);
    assert.equal(akis.pencereSayisi, 0);
    assert.equal(akis.kapatildi, true);
  });
  it("ortada iptal edilince üretim durur, fd kapanır", () => {
    const c = new AbortController();
    const akis = new PencereAkis(IMZA_DOSYA, { sinyal: c.signal });
    const uret = akis.pencereler();
    uret.next();
    uret.next();
    c.abort();
    assert.throws(() => { uret.next(); }, (e) => e.name === "AbortError");
    assert.equal(akis.okunan, 2 * W);
    assert.equal(akis.kapatildi, true);
  });
});

describe("(e) küçük dosya davranışı değişmez", () => {
  it("corpus PE aynı sniff sonucunu verir", () => {
    assert.deepEqual(sniffFile(KUCUK_PE), { tip: "pe", motor: "x64dbg" });
  });
  it("corpus ELF aynı investigate planını kurar", () => {
    const r = rea_investigate(KUCUK_ELF, "ne yapıyor?");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.tip, "elf");
    assert.equal(r.motor, "radare2");
  });
  it("küçük native PE .NET sayılmaz", () => {
    const yol = join(DIR, "native.exe");
    writeFileSync(yol, sahtePE(0));
    const r = rea_dotnet_metadata(yol);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  it("küçük managed PE .NET sayılır", () => {
    const yol = join(DIR, "managed.dll");
    writeFileSync(yol, sahtePE(0x2000));
    const r = rea_dotnet_metadata(yol);
    assert.equal(r.ok, true);
  });
  it("2 baytlık .dll COM değil kuralı korunur (uzunluk kapısı)", () => {
    const yol = join(DIR, "iki.dll");
    writeFileSync(yol, Buffer.from([0x4d, 0x5a]));
    const r = rea_unpack_try(yol);
    assert.equal(r.yontem, "dump-hunt");
  });
  it("küçük MZ .dll ilspy önerisine gider", () => {
    const yol = join(DIR, "kucuk.dll");
    writeFileSync(yol, sahtePE(0x2000));
    const r = rea_unpack_try(yol);
    assert.equal(r.yontem, "ilspy");
  });
});
