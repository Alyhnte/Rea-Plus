// frida-agent-exception.test.mjs: frida-agent.js exception handler'ının
// bilinen breakpoint slotuna eşleşmeyen adreslerde send/wait yapmadan
// `return false` ile erken çıktığını doğrular.
// CANLI TEST DEĞİL: gerçek Frida/debugger/enjeksiyon yoktur. Ajan kaynağı
// yalnızca vm.Script ile derlenir ve sahte Frida globalleriyle çalıştırılır.
// Koş: node --test tests/frida-agent-exception.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "src", "conduit-core", "engines", "frida-agent.js"), "utf8");

// Frida NativePointer'ın test için gereken en küçük karşılığı:
// kanonik hex gösterim ve ptr(...) dönüşümü.
class FakePtr {
  constructor(value) {
    this.value = typeof value === "number" ? value : Number.parseInt(String(value), 16);
  }
  toString() {
    return `0x${this.value.toString(16)}`;
  }
}

// Ajanı sahte bir Frida ortamıyla yükler; kayıtlı exception handler'ı ve
// tüm send/recv/thread çağrılarının kaydını döner. Her yükleme tazedir
// (slot durumu testler arası sızmaz).
function loadAgent() {
  const calls = { send: [], recv: [], unset: [], set: [] };
  const thread = {
    id: 7,
    context: {},
    setHardwareBreakpoint(index, address) {
      calls.set.push({ index, address: String(address) });
    },
    unsetHardwareBreakpoint(index) {
      calls.unset.push(index);
    },
  };
  let handler = null;
  const sandbox = {
    rpc: {},
    ptr: (value) => (value instanceof FakePtr ? value : new FakePtr(value)),
    send: (payload) => calls.send.push(payload),
    recv: (kind) => {
      calls.recv.push(kind);
      return { wait() {} };
    },
    Process: {
      arch: "x64",
      enumerateThreads: () => [thread],
      findModuleByAddress: () => null,
      getCurrentThreadId: () => 7,
      setExceptionHandler: (fn) => {
        handler = fn;
      },
    },
    Thread: { backtrace: () => [] },
    Backtracer: { ACCURATE: 1 },
  };
  vm.createContext(sandbox);
  new vm.Script(source, { filename: "frida-agent.js" }).runInContext(sandbox);
  assert.equal(typeof handler, "function", "ajan exception handler kaydetmeli");
  return { handler, calls, rpc: sandbox.rpc };
}

function detailsAt(address) {
  return { type: "single-step", address: new FakePtr(address), context: {} };
}

describe("frida-agent exception handler (canlı değil)", () => {
  it("ajan kaynağı vm.Script ile derlenebilir", () => {
    assert.doesNotThrow(() => new vm.Script(source, { filename: "frida-agent.js" }));
  });

  it("handler segmentinde erken false, captureHit/send ve wait'ten önce gelir", () => {
    const start = source.indexOf("Process.setExceptionHandler");
    assert.ok(start >= 0, "handler kaydı bulunmalı");
    const segment = source.slice(start);
    const findAt = segment.indexOf("findSlot(details.address)");
    const guardAt = segment.indexOf("if (index < 0)");
    const falseAt = segment.indexOf("return false");
    const hitAt = segment.indexOf("captureHit(details)");
    const waitAt = segment.indexOf('.wait()');
    assert.ok(findAt >= 0 && guardAt > findAt, "slot yoklaması guard'dan önce olmalı");
    assert.ok(falseAt > guardAt, "erken false guard içinde olmalı");
    assert.ok(hitAt > falseAt, "captureHit erken false'dan sonra gelmeli");
    assert.ok(waitAt > falseAt, "wait erken false'dan sonra gelmeli");
  });

  it("bilinmeyen adres: send/wait olmadan false döner", () => {
    const { handler, calls } = loadAgent();
    const result = handler(detailsAt(0xdead0000));
    assert.equal(result, false);
    assert.deepEqual(calls.send, [], "eşleşme yokken send çağrılmamalı");
    assert.deepEqual(calls.recv, [], "eşleşme yokken recv/wait çağrılmamalı");
    assert.deepEqual(calls.unset, [], "eşleşme yokken slot temizlenmemeli");
  });

  it("kurulu slot adresi: mevcut hit gövdesi ve yarış mantığı korunur", () => {
    const { handler, calls, rpc } = loadAgent();
    const armed = rpc.exports.setBreakpoint("0x401000");
    assert.equal(armed.slot, 0);

    const result = handler(detailsAt(0x401000));
    assert.equal(result, true);
    assert.equal(calls.send.length, 2, "hit + consumed gönderilmeli");
    assert.equal(calls.send[0].type, "breakpoint_hit");
    assert.equal(calls.send[0].address, "0x401000");
    assert.deepEqual(calls.recv, ["resume"], "hit sonrası resume beklenmeli");
    assert.deepEqual(calls.unset, [0], "hit'te yakalanan index ile slot düşürülmeli");
    assert.equal(calls.send[1].type, "breakpoint_consumed");
    assert.equal(calls.send[1].slot, 0);
  });

  it("başka slotun adresi ilk slotu tetiklemez", () => {
    const { handler, calls, rpc } = loadAgent();
    rpc.exports.setBreakpoint("0x401000");
    const result = handler(detailsAt(0x402000));
    assert.equal(result, false);
    assert.deepEqual(calls.send, []);
    assert.deepEqual(calls.recv, []);
  });
});
