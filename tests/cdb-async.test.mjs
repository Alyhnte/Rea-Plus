// cdb-async.test.mjs: cdb async pause + push olaylari (Dalga A/3).
// Kos: once `npm run build`, sonra `node --test tests/cdb-async.test.mjs`.
// Kapsam: (a) pause event loop'u bloklamaz, (b) pause/breakpoint push aboneyeye
// ulasir, (c) cdb yoksa durust capability_unsupported + kurulum ipucu,
// (d) abone yoksa sessiz, (e) mevcut davranis (target_not_open/invalid_target).
// Canli debugger/cdb testi YOK: cdb sureci acilmaz, yalniz sahte pipe + hizli
// gecikmeler. Doyan timer test sonunda kapatilir; asili surec birakilmaz.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import * as cdb from "../dist/conduit-core/engines/cdb.js";

const { CdbEngine, CdbError, resolveCdbExe, resetCdbResolutionCache } = cdb;

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

const SAHTE_PID = 4242;
const SAHTE_RIP = "rip=00007ff6`12345678 rax=0000000000000001\nnv up ei pl zr na pe nc\n";
const SAHTE_BP = "Breakpoint 0 hit\n00007ff6`12345678 cc int3\n";

/** Gercek cdb acmadan CdbEngine.sessions'e konan sahte pipe. */
function sahtePipe({ bekleyen = false, kirmaMs = 0, kirmaKaydi = null } = {}) {
  return {
    exited: false,
    hasPending: () => bekleyen,
    requestBreak: async (pid) => {
      kirmaKaydi?.push(pid);
      if (kirmaMs > 0) {
        await bekle(kirmaMs);
      }
    },
    command: async (cmd) => {
      if (typeof cmd === "string" && cmd.startsWith("g")) {
        return SAHTE_BP;
      }
      return SAHTE_RIP;
    },
    shutdown: async () => {},
  };
}

function sahteOturum(pipe) {
  return {
    pipe,
    target: "C:\\sahte\\hedef.exe",
    arch: "x64",
    pid: SAHTE_PID,
    attached: false,
    exited: false,
    pauseReason: "initial_breakpoint",
    entryPoint: "0x140001000",
    moduleBase: "0x140000000",
    moduleEntry: "0x140001000",
    openedAt: new Date().toISOString(),
    pushes: [],
    bpTypes: new Map(),
  };
}

function enjekte(id, pipe) {
  const engine = new CdbEngine();
  engine.sessions.set(id, sahteOturum(pipe));
  return engine;
}

after(() => {
  resetCdbResolutionCache();
});

describe("cdb async pause + push (Dalga A/3)", () => {
  it("(a) pause event loop'u bloklamaz: kirma surerken baska is ilerler", async () => {
    const engine = enjekte("cdb-async-a", sahtePipe());
    assert.equal(typeof engine.pauseAsync, "function", "pauseAsync opt-in yolu yok (RED)");
    const kirmaKaydi = [];
    const engine2 = enjekte("cdb-async-a2", sahtePipe({ bekleyen: true, kirmaMs: 250, kirmaKaydi }));
    let tik = 0;
    const sayac = setInterval(() => {
      tik += 1;
    }, 50);
    try {
      const sonuc = await engine2.pauseAsync("cdb-async-a2");
      assert.equal(sonuc.reason, "paused");
      assert.deepEqual(kirmaKaydi, [SAHTE_PID]);
      assert.ok(tik >= 2, `event loop ilerlemedi (tik=${tik}): pause blokluyor`);
    } finally {
      clearInterval(sayac);
    }
    void engine;
  });

  it("(b) pause/breakpoint push olayi aboneyeye ulasir", async () => {
    const engine = enjekte("cdb-async-b", sahtePipe({ bekleyen: false }));
    assert.equal(typeof engine.pauseAsync, "function", "pauseAsync opt-in yolu yok (RED)");
    const alinan = [];
    engine.onPush("cdb-async-b", (tur, yuk) => {
      alinan.push([tur, yuk]);
    });
    const sonuc = await engine.pauseAsync("cdb-async-b");
    assert.equal(sonuc.reason, "paused");
    assert.ok(alinan.length >= 1, "pause push uretilmedi (onPush olu)");
    assert.equal(alinan[0][0], "debugEvent");
    assert.equal(alinan[0][1]?.reason, "paused");

    const engine2 = enjekte("cdb-async-b2", sahtePipe({ bekleyen: false }));
    const alinan2 = [];
    engine2.onPush("cdb-async-b2", (tur, yuk) => {
      alinan2.push([tur, yuk]);
    });
    const dev = await engine2.continue_("cdb-async-b2");
    assert.equal(dev.reason, "breakpoint");
    assert.ok(
      alinan2.some(([t, y]) => t === "debugEvent" && y?.reason === "breakpoint"),
      "breakpoint push aboneyeye ulasmadi",
    );
  });

  it("(c) cdb yoksa durust capability_unsupported + kurulum ipucu; sahte basari yok", async () => {
    assert.equal(typeof cdb.missingCdbError, "function", "missingCdbError export yok (RED)");
    const hata = cdb.missingCdbError("x64", ["C:\\yok\\x64\\cdb.exe"]);
    assert.ok(hata instanceof CdbError);
    assert.equal(hata.code, "capability_unsupported");
    assert.match(hata.message, /CDB_DIR/);
    assert.match(hata.message, /İndirme önerisi/);
    // Ortam-durust dal: cdb varsa gercek yol, yoksa durust hata. Atlama yok.
    resetCdbResolutionCache();
    try {
      const exe = await resolveCdbExe("x64");
      assert.match(exe, /cdb\.exe$/i, "cozulen yol gercek cdb.exe olmali (sahte basari yok)");
    } catch (e) {
      assert.ok(e instanceof CdbError, `beklenmeyen hata turu: ${String(e)}`);
      assert.equal(e.code, "capability_unsupported");
      assert.match(e.message, /İndirme önerisi/);
    } finally {
      resetCdbResolutionCache();
    }
  });

  it("(d) abone yoksa sessiz gecilir, hata yok", async () => {
    const engine = enjekte("cdb-async-d", sahtePipe({ bekleyen: false }));
    assert.equal(typeof engine.pauseAsync, "function", "pauseAsync opt-in yolu yok (RED)");
    const sonuc = await engine.pauseAsync("cdb-async-d");
    assert.equal(sonuc.reason, "paused");
  });

  it("(e) mevcut davranis korunur: acik olmayan oturum + gecersiz hedef durust hatasi", async () => {
    const engine = new CdbEngine();
    await assert.rejects(
      () => engine.pause("yok-oturum"),
      (e) => e instanceof CdbError && e.code === "target_not_open",
    );
    // Linux'ta open() hedefe bakmadan engine_unavailable doner (cdb Windows'a ozel);
    // Windows'ta var-olmayan hedef invalid_target olur. Ikisi de durust hata.
    await assert.rejects(
      () => engine.open("cdb-async-e", "C:\\kesinlikle\\yok\\hedef.exe"),
      (e) => e instanceof CdbError && (e.code === "invalid_target" || e.code === "engine_unavailable"),
    );
    assert.equal(engine.isOpen("cdb-async-e"), false);
  });
});
