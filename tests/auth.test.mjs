// auth.test.mjs: DBG_BRIDGE_TOKEN kapısı (bearer doğru/yanlış/boş).
// Koş: node --test tests/auth.test.mjs (alternatif: node tests/auth.test.mjs)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, timingSafeEqual } from "node:crypto";
import { parseServeOptions } from "../dist/conduit-core/server.js";

// Kapı mantığı: src/server.ts authed() ile birebir (hash + sabit-süreli karşılaştırma).
function kapıKontrol(auth, want) {
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) return false;
  const özet = (s) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(özet(auth.slice("Bearer ".length)), özet(want));
}

describe("bearer kapısı", () => {
  // Doğru token kapıdan geçer.
  it("doğru bearer geçer", () => {
    assert.equal(kapıKontrol("Bearer gizli-123", "gizli-123"), true);
  });

  // Yanlış token 401 demektir: kapı false döner.
  it("yanlış bearer geçemez", () => {
    assert.equal(kapıKontrol("Bearer yanlış-token", "gizli-123"), false);
  });

  // Boş/eksik başlık geçemez (üç ayrı boş biçimi).
  it("boş başlık geçemez", () => {
    assert.equal(kapıKontrol("", "gizli-123"), false);
    assert.equal(kapıKontrol(undefined, "gizli-123"), false);
    assert.equal(kapıKontrol("Bearer ", "gizli-123"), false);
  });

  // Bearer öneki yoksa geçemez (Basic/çıplak token elenir).
  it("önek yoksa geçemez", () => {
    assert.equal(kapıKontrol("gizli-123", "gizli-123"), false);
    assert.equal(kapıKontrol("Basic gizli-123", "gizli-123"), false);
  });
});

describe("token okuma (parseServeOptions)", () => {
  // Dolu env token olarak okunur.
  it("dolu env token olur", () => {
    const o = parseServeOptions(["node", "x"], { DBG_BRIDGE_TOKEN: "gizli-123" });
    assert.equal(o.token, "gizli-123");
  });

  // Boş env açık localhost demektir (token tanımsız).
  it("boş env açık localhost demektir", () => {
    const o = parseServeOptions(["node", "x"], { DBG_BRIDGE_TOKEN: "" });
    assert.equal(o.token, undefined);
  });

  // Env yoksa da kapı kurulu değildir.
  it("env yoksa token tanımsız", () => {
    const o = parseServeOptions(["node", "x"], {});
    assert.equal(o.token, undefined);
  });
});
