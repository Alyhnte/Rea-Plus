// frida-setup-timeout.test.mjs: inject() kurulum adimlarinin (attach /
// createScript / load) ayri timeout'lari (Dalga A/2 retry, HOST tarafi).
// CANLI TEST DEGIL: gercek Frida/debugger/enjeksiyon yoktur. FridaEngine'in
// inject() metoduna yalniz sahte Frida nesneleri verilir; asilan adimlar kisa
// REA_FRIDA_*_TIMEOUT_MS degerleriyle hizli timeout'a zorlanir.
// Kos: npm run build sonrasi `node --test tests/frida-setup-timeout.test.mjs`
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fridaMod from "../dist/conduit-core/engines/frida.js";

const ENV_ADLARI = [
  "REA_FRIDA_ATTACH_TIMEOUT_MS",
  "REA_FRIDA_SCRIPT_TIMEOUT_MS",
  "REA_FRIDA_LOAD_TIMEOUT_MS",
  "DBG_BRIDGE_FRIDA_TIMEOUT_MS",
];
const GUARD = Symbol("guard-timeout");

const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

// inject() cagrisi cozulur/reddedilir ya da guard suresinde hukmunu verir.
// Guard zamanlayicisi her yolda temizlenir (asili timer birakilmaz).
async function hucreCoz(promise, guardMs = 2000) {
  let timer;
  try {
    const guard = new Promise((resolve) => {
      timer = setTimeout(() => resolve(GUARD), guardMs);
    });
    const yerlesik = promise.then(
      (value) => ({ settled: "resolved", value }),
      (error) => ({ settled: "rejected", error }),
    );
    return await Promise.race([yerlesik, guard]);
  } finally {
    clearTimeout(timer);
  }
}

function sahteBetik({ asiliLoad = false } = {}) {
  const durum = { loadCalled: false, unloadCalled: false };
  const betik = {
    __durum: durum,
    message: { connect() {} },
    exports: {
      describe: async () => ({
        arch: "x64",
        moduleBase: "0x400000",
        entry: "0x401000",
        module: "test.exe",
        path: "",
      }),
    },
    load: asiliLoad ? () => new Promise(() => {}) : async () => { durum.loadCalled = true; },
    unload: async () => { durum.unloadCalled = true; },
  };
  return betik;
}

function sahteOturum({ betik = null, asiliCreate = false } = {}) {
  const durum = { createCalled: false, detachCalled: false };
  return {
    __durum: durum,
    detached: { connect() {} },
    createScript: asiliCreate
      ? () => new Promise(() => {})
      : async () => { durum.createCalled = true; return betik ?? sahteBetik(); },
    detach: async () => { durum.detachCalled = true; },
  };
}

let yedekEnv;
let yedekAttach;

beforeEach(() => {
  yedekEnv = {};
  for (const ad of ENV_ADLARI) yedekEnv[ad] = process.env[ad];
  for (const ad of ENV_ADLARI) delete process.env[ad];
  yedekAttach = fridaMod.__fridaTestHooks?.attach;
  if (fridaMod.__fridaTestHooks) fridaMod.__fridaTestHooks.attach = undefined;
});

afterEach(() => {
  for (const ad of ENV_ADLARI) {
    if (yedekEnv[ad] === undefined) delete process.env[ad];
    else process.env[ad] = yedekEnv[ad];
  }
  if (fridaMod.__fridaTestHooks) fridaMod.__fridaTestHooks.attach = yedekAttach;
});

describe("frida kurulum timeout'lari (canli degil)", () => {
  it("ayri timeout okuyuculari vardir ve varsayilanlari dogrudur", () => {
    assert.equal(typeof fridaMod.fridaAttachTimeoutMs, "function", "fridaAttachTimeoutMs olmali");
    assert.equal(typeof fridaMod.fridaScriptTimeoutMs, "function", "fridaScriptTimeoutMs olmali");
    assert.equal(typeof fridaMod.fridaLoadTimeoutMs, "function", "fridaLoadTimeoutMs olmali");
    assert.equal(fridaMod.fridaAttachTimeoutMs(), 15000);
    assert.equal(fridaMod.fridaScriptTimeoutMs(), 10000);
    assert.equal(fridaMod.fridaLoadTimeoutMs(), 15000);
  });

  it("(a) asilan attach timeout'a duser, geciken session detach edilir", async () => {
    process.env.REA_FRIDA_ATTACH_TIMEOUT_MS = "60";
    const geciken = sahteOturum();
    assert.ok(fridaMod.__fridaTestHooks, "attach test seam olmali");
    fridaMod.__fridaTestHooks.attach = () => uyu(150).then(() => geciken);

    const motor = new fridaMod.FridaEngine();
    const id = "setup-timeout-attach";
    const sonuc = await hucreCoz(motor.inject(id, 1234, "test.exe", true, "running", null));
    assert.notEqual(sonuc, GUARD, "attach asilinca guard'a kalmamali");
    assert.equal(sonuc.settled, "rejected", "sahte ok:true yok, durust hata");
    assert.ok(sonuc.error instanceof fridaMod.FridaError);
    assert.equal(sonuc.error.code, "engine_timeout");
    assert.match(sonuc.error.message, /attach/i);
    assert.equal(motor.isOpen(id), false, "yarim oturum kalmamali");

    await uyu(300); // geciken attach cozulsun
    assert.equal(geciken.__durum.detachCalled, true, "geciken session detach edilmeli");
    assert.equal(motor.isOpen(id), false);
  });

  it("(b) asilan load timeout'a duser, unload + detach cagrilir", async () => {
    process.env.REA_FRIDA_LOAD_TIMEOUT_MS = "60";
    const betik = sahteBetik({ asiliLoad: true });
    const mevcut = sahteOturum({ betik });

    const motor = new fridaMod.FridaEngine();
    const id = "setup-timeout-load";
    const sonuc = await hucreCoz(motor.inject(id, 1234, "test.exe", true, "running", null, mevcut));
    assert.notEqual(sonuc, GUARD, "load asilinca guard'a kalmamali");
    assert.equal(sonuc.settled, "rejected");
    assert.ok(sonuc.error instanceof fridaMod.FridaError);
    assert.equal(sonuc.error.code, "engine_timeout");
    assert.match(sonuc.error.message, /load/i);
    assert.equal(betik.__durum.unloadCalled, true, "timeout'ta unload korunur");
    assert.equal(mevcut.__durum.detachCalled, true, "timeout'ta detach korunur");
    assert.equal(motor.isOpen(id), false, "yarim oturum kalmamali");
  });

  it("(b2) asilan createScript timeout'a duser, detach cagrilir", async () => {
    process.env.REA_FRIDA_SCRIPT_TIMEOUT_MS = "60";
    const mevcut = sahteOturum({ asiliCreate: true });

    const motor = new fridaMod.FridaEngine();
    const id = "setup-timeout-createscript";
    const sonuc = await hucreCoz(motor.inject(id, 1234, "test.exe", true, "running", null, mevcut));
    assert.notEqual(sonuc, GUARD, "createScript asilinca guard'a kalmamali");
    assert.equal(sonuc.settled, "rejected");
    assert.ok(sonuc.error instanceof fridaMod.FridaError);
    assert.equal(sonuc.error.code, "engine_timeout");
    assert.match(sonuc.error.message, /createScript/i);
    assert.equal(mevcut.__durum.detachCalled, true, "timeout'ta detach korunur");
    assert.equal(motor.isOpen(id), false, "yarim oturum kalmamali");
  });

  it("(c) hizli kurulum etkilenmez", async () => {
    const betik = sahteBetik();
    const mevcut = sahteOturum({ betik });
    const motor = new fridaMod.FridaEngine();
    const id = "setup-timeout-hizli";
    const tutulan = await motor.inject(id, 1234, "test.exe", true, "running", null, mevcut);
    assert.equal(tutulan.arch, "x64");
    assert.equal(motor.isOpen(id), true);
    await motor.close(id);
    assert.equal(betik.__durum.unloadCalled, true, "close unload cagirir");
    assert.equal(mevcut.__durum.detachCalled, true, "close detach cagirir");
    assert.equal(motor.isOpen(id), false);
  });

  it("(d) gecersiz env acik hatadir, sessiz fallback yok", () => {
    const kotuler = ["abc", "-5", "0"];
    const okuyucular = [
      ["REA_FRIDA_ATTACH_TIMEOUT_MS", () => fridaMod.fridaAttachTimeoutMs()],
      ["REA_FRIDA_SCRIPT_TIMEOUT_MS", () => fridaMod.fridaScriptTimeoutMs()],
      ["REA_FRIDA_LOAD_TIMEOUT_MS", () => fridaMod.fridaLoadTimeoutMs()],
      ["DBG_BRIDGE_FRIDA_TIMEOUT_MS", () => fridaMod.fridaTimeoutMs()],
    ];
    for (const [ad, oku] of okuyucular) {
      for (const kotu of kotuler) {
        process.env[ad] = kotu;
        assert.throws(oku, (hata) => {
          assert.ok(hata instanceof fridaMod.FridaError, `${ad}=${kotu} FridaError olmali`);
          assert.equal(hata.code, "invalid_argument");
          assert.match(hata.message, new RegExp(ad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
          return true;
        }, `${ad}=${kotu} acik hata vermeli`);
        delete process.env[ad];
      }
    }
  });

  it("(d2) gecersiz attach env ile inject asili kalmaz, acik hata verir", async () => {
    process.env.REA_FRIDA_ATTACH_TIMEOUT_MS = "abc";
    let cagrildi = false;
    fridaMod.__fridaTestHooks.attach = () => { cagrildi = true; return new Promise(() => {}); };

    const motor = new fridaMod.FridaEngine();
    const id = "setup-timeout-kotu-env";
    const sonuc = await hucreCoz(motor.inject(id, 1234, "test.exe", true, "running", null));
    assert.notEqual(sonuc, GUARD, "kotü env guard'a kalmamali");
    assert.equal(sonuc.settled, "rejected");
    assert.ok(sonuc.error instanceof fridaMod.FridaError);
    assert.equal(sonuc.error.code, "invalid_argument");
    assert.match(sonuc.error.message, /REA_FRIDA_ATTACH_TIMEOUT_MS/);
    assert.equal(cagrildi, false, "kotü env'de attach baslamamali");
    assert.equal(motor.isOpen(id), false);
  });
});
