// frida-api.test.mjs: gerçek frida ApiTracer + notepad.exe spawn (GUI, canlı kalır).
// Koş: tsc sonrası `node --test tests/frida-api.test.mjs` (toplam <120sn).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import frida from "frida";
import { FRIDA_API_TOOLS, rea_frida_api } from "../dist/rea-domains/frida-plus/ApiTracer.js";
// Hedef: etkileşimsiz GUI, spawn sonrası canlı kalır.
const NOTEPAD = "C:\\Windows\\System32\\notepad.exe";
// Kısa bekleme (init otursun, flaky attach önlenir).
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
// Her test kendi hedefini açar, sonunda mutlaka öldürür.
async function hedefAc() {
  const dev = await frida.getLocalDevice();
  const pid = await dev.spawn(NOTEPAD);
  await dev.resume(pid);
  await bekle(400);
  return { dev, pid };
}
async function hedefOldur(dev, pid) { try { await dev.kill(pid); } catch { /* zaten ölmüş */ } }
// Canlılık: enumerateProcesses içinde pid görünür mü?
async function canliMi(dev, pid) { const l = await dev.enumerateProcesses(); return l.some((p) => p.pid === pid); }
const HEX = /^0x[0-9a-f]+$/i;
describe("frida-api katalog", () => {
  // rea_ önekli araç listelenir.
  it("rea_frida_api aracını listeler", () => {
    assert.ok(FRIDA_API_TOOLS.includes("rea_frida_api"));
  });
  // Boş pid kapıdan döner.
  it("boş pid unsupported", async () => {
    assert.equal((await rea_frida_api(0)).code, "capability_unsupported");
    assert.equal((await rea_frida_api(-1)).code, "capability_unsupported");
  });
});
describe("frida-api canlı hedef (notepad)", () => {
  // Ajan CreateFileW tetikler: liste boş dönmez, tetiklenen ad görünür.
  it("default iz boş dönmez (CreateFileW tetiklenir)", async () => {
    const { dev, pid } = await hedefAc();
    try {
      const r = await rea_frida_api(pid, "*", 200, 1200);
      assert.equal(r.ok, true);
      assert.ok(r.sayi >= 1);
      assert.ok(r.cagrilar.length >= 1);
      assert.ok(r.cagrilar.some((c) => c.api === "CreateFileW" || c.api === "GetTickCount"));
    } finally { await hedefOldur(dev, pid); }
  });
  // İlk 4 arg hex, tid pozitif, retval dolu.
  it("arg formatı hex + tid + retval", async () => {
    const { dev, pid } = await hedefAc();
    try {
      const r = await rea_frida_api(pid, "kernel32.dll", 200, 1200);
      assert.equal(r.ok, true);
      const ilk = r.cagrilar[0];
      assert.equal(ilk.args.length, 4);
      for (const a of ilk.args) assert.match(String(a), HEX);
      assert.ok(Number.isInteger(ilk.tid) && ilk.tid > 0);
      assert.ok(typeof ilk.retval === "string" && ilk.retval.length > 0);
    } finally { await hedefOldur(dev, pid); }
  });
  // limit üstü kayıt kesilir.
  it("limit saygısı (5)", async () => {
    const { dev, pid } = await hedefAc();
    try {
      const r = await rea_frida_api(pid, "*", 5, 1200);
      assert.equal(r.ok, true);
      assert.ok(r.cagrilar.length >= 1);
      assert.ok(r.cagrilar.length <= 5);
    } finally { await hedefOldur(dev, pid); }
  });
  // kernel32 deseni api isimleri taşır, tetiklenen ad görünür.
  it("kernel32 izi api isimleri taşır", async () => {
    const { dev, pid } = await hedefAc();
    try {
      const r = await rea_frida_api(pid, "kernel32.dll", 50, 1200);
      assert.equal(r.ok, true);
      assert.ok(r.cagrilar.every((c) => typeof c.api === "string" && c.api.length > 0));
      assert.ok(r.cagrilar.some((c) => c.api === "CreateFileW" || c.api === "GetTickCount"));
    } finally { await hedefOldur(dev, pid); }
  });
  // İz hedefi öldürmez: detach sonrası process canlı.
  it("hedefi öldürmez (iz sonrası canlı)", async () => {
    const { dev, pid } = await hedefAc();
    try {
      const r = await rea_frida_api(pid, "*", 20, 800);
      assert.equal(r.ok, true);
      assert.equal(await canliMi(dev, pid), true);
    } finally { await hedefOldur(dev, pid); }
  });
});
