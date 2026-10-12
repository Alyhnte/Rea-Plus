// provider-crash.test.mjs: hopper/ida/jeb kapıları + crash parser (node:test, gerçek I/O).
// Koş: npm run build sonrası `node tests/provider-crash.test.mjs`.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HOPPER_TOOLS, hopperDurumu, rea_hopper_istek, rea_hopper_tara } from "../dist/rea-domains/hopper/HopperProvider.js";
import { IDA_TOOLS, rea_ida_flirt, rea_ida_idb } from "../dist/rea-domains/ida/IdaProvider.js";
import { JEB_TOOLS, rea_jeb_sorgu } from "../dist/rea-domains/jeb/JebProvider.js";
import { rea_crash_kayit_parse, rea_crash_ozet } from "../dist/rea-domains/crash/RecordedCrash.js";

const YOK = "C:\\yok\\olmayan-hedef-rea-plus.bin";
const TMP = mkdtempSync(join(tmpdir(), "rea-prov-crash-"));
// Sahte hedef: metin taraması için derleyici + adres izleri içerir.
const SAHTE = join(TMP, "sahte.bin");
writeFileSync(SAHTE, "MSVC derlendi\nGCC: (GNU) 11.2.0\nmain 0x401000 in app\n0x401005 in foo\nhata satiri\n", "utf8");
// Sahte crash notu: sinyal + 2 thread + register + frameler.
const NOT = `Signal: SIGSEGV (signal 11) at 0x401005
Thread 0 Crashed:
#0 0x401005 in foo (/src/a.c:10)
#1 0x401020 in main (/src/a.c:20)
rax: 0x0
rip: 0x401005
Thread 1:
#0 0x7fff in poll (libc)
`;
const NOT_DOSYA = join(TMP, "ornek.crash");
writeFileSync(NOT_DOSYA, NOT, "utf8");

let sahteUrl = "";
let srv = null;
before(async () => {
  // Sahte MCP ucu: gövdeyi yankılayan yerel HTTP sunucusu (gerçek POST hedefi).
  srv = createServer((req, res) => {
    let ham = "";
    req.on("data", (p) => { ham += p; });
    req.on("end", () => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ yankı: ham, yontem: req.url })); });
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok()));
  const a = srv.address();
  sahteUrl = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 80}/mcp`;
});
after(async () => { await new Promise((ok) => srv.close(() => ok())); });

describe("provider-crash kapıları (gerçek)", () => {
  it("HOPPER_TOOLS 4 isimli, rea_hopper_ prefixli", () => {
    assert.equal(HOPPER_TOOLS.length, 4);
    for (const a of HOPPER_TOOLS) assert.ok(a.startsWith("rea_hopper_"));
  });
  it("hopper tara: düz string bulur (offline GERÇEK)", () => {
    const s = rea_hopper_tara(SAHTE, "gcc:");
    assert.equal(s.ok, true);
    assert.ok(s.sayi >= 1);
    assert.ok(s.eslesmeler[0].metin.toLowerCase().includes("gcc"));
  });
  it("hopper tara: regex desen bulur", () => {
    const s = rea_hopper_tara(SAHTE, "0x[0-9a-f]+", true);
    assert.equal(s.ok, true);
    assert.ok(s.sayi >= 2);
  });
  it("hopper tara: olmayan hedef unsupported", () => {
    const s = rea_hopper_tara(YOK, "x");
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
  it("hopper istek: kapı (yoksa fallbackli unsupported, varsa dosya üretir)", () => {
    const s = rea_hopper_istek(SAHTE, ["0x401000"]);
    if (!hopperDurumu().tamam) {
      assert.equal(s.ok, false);
      assert.match(s.neden, /fallback/i);
    } else {
      assert.equal(s.ok, true);
      assert.ok(existsSync(s.istekDosyasi));
      assert.ok(JSON.parse(readFileSync(s.istekDosyasi, "utf8")).hedef === SAHTE);
    }
  });
  it("IDA_TOOLS 4 isimli, rea_ida_ prefixli", () => {
    assert.equal(IDA_TOOLS.length, 4);
    for (const a of IDA_TOOLS) assert.ok(a.startsWith("rea_ida_"));
  });
  it("ida flirt: sahte metinde derleyici izi bulur (offline GERÇEK)", () => {
    const s = rea_ida_flirt(SAHTE);
    assert.equal(s.ok, true);
    assert.ok(s.eslesmeler.includes("MSVC"));
    assert.ok(s.surumler.some((v) => v.includes("GCC")));
  });
  it("ida flirt/idb: olmayan hedef unsupported", () => {
    assert.equal(rea_ida_flirt(YOK).code, "capability_unsupported");
    assert.equal(rea_ida_idb(YOK, join(TMP, "c.idb")).code, "capability_unsupported");
  });
  it("ida idb: boş cikti yolu unsupported (idat koşmaz)", () => {
    const s = rea_ida_idb(SAHTE, "   ");
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
  it("JEB_TOOLS rea_jeb_ prefixli, sorgu dahil", () => {
    for (const a of JEB_TOOLS) assert.ok(a.startsWith("rea_jeb_"));
    assert.ok(JEB_TOOLS.includes("rea_jeb_sorgu"));
  });
  it("jeb sorgu: URL yoksa unsupported", async () => {
    const s = await rea_jeb_sorgu("", "tools/call", "{}");
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
  it("jeb sorgu: yerel sahte MCP ucuna GERÇEK POST", async () => {
    const s = await rea_jeb_sorgu(sahteUrl, "tools/call", JSON.stringify({ ping: 1 }));
    assert.equal(s.ok, true);
    assert.equal(s.durum, 200);
    assert.ok(s.govde.includes("ping"));
  });
  it("crash parse: sahte not sinyal+thread+register verir", () => {
    const s = rea_crash_kayit_parse(NOT);
    assert.equal(s.ok, true);
    assert.match(s.sinyal, /SIGSEGV/i);
    assert.equal(s.threadSayisi, 2);
    assert.ok(s.registerlar.length >= 2);
  });
  it("crash özet: thread sayısı, sinyal, ilk frame", () => {
    const s = rea_crash_ozet(NOT);
    assert.equal(s.ok, true);
    assert.equal(s.threadSayisi, 2);
    assert.match(s.sinyal, /SIGSEGV/i);
    assert.ok(s.ilkFrame.includes("0x401005"));
  });
  it("crash: dosya yolu desteği + boş girdi kapısı", () => {
    const d = rea_crash_ozet(NOT_DOSYA);
    assert.equal(d.ok, true);
    assert.equal(d.threadSayisi, 2);
    const b = rea_crash_kayit_parse("   ");
    assert.equal(b.ok, false);
    assert.equal(b.code, "capability_unsupported");
  });
});
