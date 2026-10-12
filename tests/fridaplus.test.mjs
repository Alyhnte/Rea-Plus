// fridaplus.test.mjs: gerçek frida + notepad.exe spawn (GUI, canlı kalır).
// Koş: tsc sonrası `node --test tests/fridaplus.test.mjs` (toplam <120sn).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import frida from "frida";
import { FRIDAPLUS_TOOLS, rea_frida_step, rea_frida_pause, rea_frida_resume, rea_frida_cond, rea_frida_stalker } from "../dist/rea-domains/frida-plus/FridaPlus.js";
// Hedef: etkileşimsiz GUI, spawn sonrası canlı kalır.
const NOTEPAD = "C:\\Windows\\System32\\notepad.exe";
// Kısa bekleme (askı sonrası canlılık penceresi).
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
// Her test kendi hedefini açar, sonunda mutlaka öldürür (artık süreç yok).
async function hedefAc() {
  const dev = await frida.getLocalDevice();
  const pid = await dev.spawn(NOTEPAD);
  await dev.resume(pid);
  await bekle(400); // yeni process init otursun (flaky attach önlenir)
  return { dev, pid };
}
async function hedefOldur(dev, pid) { try { await dev.kill(pid); } catch { /* zaten ölmüş */ } }
// Canlılık: enumerateProcesses içinde pid görünür mü?
async function canliMi(dev, pid) { const l = await dev.enumerateProcesses(); return l.some((p) => p.pid === pid); }
// Gerçek export adresi (cond/step için deterministik vuruş noktası).
async function tickAdresi(pid) {
  const dev = await frida.getLocalDevice();
  const s = await dev.attach(pid);
  try {
    const sc = await s.createScript(`rpc.exports={a(){return Process.findModuleByName("kernel32.dll").getExportByName("GetTickCount").toString();}};`);
    await sc.load();
    const a = await sc.exports.a();
    await sc.unload();
    return String(a);
  } finally { await s.detach().catch(() => {}); }
}
describe("frida-plus katalog", () => {
  // 5 araç, rea_ önekli (facade uyumu).
  it("5 rea_ aracı listeler", () => {
    assert.equal(FRIDAPLUS_TOOLS.length, 5);
    for (const a of ["rea_frida_step", "rea_frida_pause", "rea_frida_resume", "rea_frida_cond", "rea_frida_stalker"]) assert.ok(FRIDAPLUS_TOOLS.includes(a));
  });
  // Boş pid: pause/resume kapıdan döner.
  it("boş pid pause/resume unsupported", async () => {
    assert.equal((await rea_frida_pause(0)).code, "capability_unsupported");
    assert.equal((await rea_frida_resume(-1)).code, "capability_unsupported");
  });
  // Boş pid: step/cond/stalker kapıdan döner.
  it("boş pid step/cond/stalker unsupported", async () => {
    assert.equal((await rea_frida_step(0)).code, "capability_unsupported");
    assert.equal((await rea_frida_cond(0, "0x0", "true")).code, "capability_unsupported");
    assert.equal((await rea_frida_stalker(0)).code, "capability_unsupported");
  });
});
describe("frida-plus canlı hedef (notepad)", () => {
  // Sayaç mantığı: pause öncesi/sonrası canlı sayacı 1 kalır, resume sonrası da 1.
  it("pause/resume hedefi canlı tutar", async () => {
    const { dev, pid } = await hedefAc();
    try {
      assert.equal(await canliMi(dev, pid), true);
      const p = await rea_frida_pause(pid);
      assert.equal(p.ok, true);
      await bekle(300);
      const sayacAskida = (await dev.enumerateProcesses()).filter((x) => x.pid === pid).length;
      assert.equal(sayacAskida, 1);
      const r = await rea_frida_resume(pid);
      assert.equal(r.ok, true);
      assert.equal(await canliMi(dev, pid), true);
    } finally { await hedefOldur(dev, pid); }
  });
  // Step: Instruction.parse ile sonraki PC hesaplanır.
  it("step sonraki PC hesaplar", async () => {
    const { dev, pid } = await hedefAc();
    try {
      const a = await tickAdresi(pid);
      const s = await rea_frida_step(pid, a);
      assert.equal(s.ok, true);
      assert.match(s.sonraki, /^0x[0-9a-f]+$/i);
    } finally { await hedefOldur(dev, pid); }
  });
  // Cond true: tutar + hit sayar.
  it("cond true tutar, hit sayar", async () => {
    const { dev, pid } = await hedefAc();
    try {
      const a = await tickAdresi(pid);
      const c = await rea_frida_cond(pid, a, "true", 10);
      assert.equal(c.ok, true);
      assert.equal(c.tuttu, true);
      assert.ok(c.hitSayisi >= 1);
    } finally { await hedefOldur(dev, pid); }
  });
  // Cond false: tutmaz ama hit sayar (otomatik continue kanıtı).
  it("cond false tutmaz ama hit sayar", async () => {
    const { dev, pid } = await hedefAc();
    try {
      const a = await tickAdresi(pid);
      const c = await rea_frida_cond(pid, a, "false", 10);
      assert.equal(c.ok, true);
      assert.equal(c.tuttu, false);
      assert.ok(c.hitSayisi >= 1);
    } finally { await hedefOldur(dev, pid); }
  });
  // Stalker: ajan içi tetiklemeyle çağrı listesi yakalar.
  it("stalker çağrı yakalar", async () => {
    const { dev, pid } = await hedefAc();
    try {
      const s = await rea_frida_stalker(pid, undefined, 800);
      assert.equal(s.ok, true);
      assert.ok(s.sayi >= 1);
      assert.ok(s.cagrilar.length >= 1);
    } finally { await hedefOldur(dev, pid); }
  });
});
