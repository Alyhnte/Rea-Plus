// session-ttl.test.mjs: Dalga E/3 — oturum TTL çekirdeği (TDD).
// Koş: önce `npm run build`, sonra `node --test tests/session-ttl.test.mjs`.
// Kapsam:
//  (b) TTL dolan oturum temizlenir + sonraki çağrı dürüst "süresi doldu" döner.
//  (c) TTL=0 kapalı demek: davranış değişmez (yaşlı oturum bile yaşar).
//  (d) Geçersiz env → açık hata (sessiz varsayılana düşme yok).
// Düzey: gerçek SessionRegistry + saf TTL çekirdeği; sunucu spawn yok, ağ yok,
// corpus'a dokunulmaz (oturumlar süreç-içi, dosya yazılmaz).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SessionRegistry } from "../dist/conduit-core/registry.js";
import {
  DEFAULT_SESSION_TTL_MS,
  REA_SESSION_TTL_ENV,
  parseSessionTtlConfig,
  sessionTtlEnabled,
  isSessionExpired,
  sweepExpiredSessions,
  requireLiveSession,
  SessionTtlTracker,
} from "../dist/server/sessionTtl.js";

const SIMDI = Date.now();
const iso = (ms) => new Date(ms).toISOString();

describe("parseSessionTtlConfig: varsayılan + TTL=0 + geçersiz env", () => {
  it("env tanımsızken varsayılan 30dk ve etkindir", () => {
    assert.equal(DEFAULT_SESSION_TTL_MS, 30 * 60 * 1000);
    assert.equal(REA_SESSION_TTL_ENV, "REA_SESSION_TTL_MS");
    assert.deepEqual(parseSessionTtlConfig({}), { enabled: true, ttlMs: 30 * 60 * 1000 });
    assert.equal(sessionTtlEnabled({}), true);
  });

  it("(c) TTL=0 kapalı demektir", () => {
    assert.deepEqual(parseSessionTtlConfig({ REA_SESSION_TTL_MS: "0" }), { enabled: false, ttlMs: 0 });
    assert.equal(sessionTtlEnabled({ REA_SESSION_TTL_MS: "0" }), false);
  });

  it("özel TTL milisaniye olarak okunur", () => {
    assert.deepEqual(parseSessionTtlConfig({ REA_SESSION_TTL_MS: "60000" }), { enabled: true, ttlMs: 60000 });
  });

  it("(d) geçersiz env açık hata verir", () => {
    for (const ham of ["abc", "-5", "1.5", "10ms", "0x10", "99999999999999999999999"]) {
      assert.throws(
        () => parseSessionTtlConfig({ REA_SESSION_TTL_MS: ham }),
        /REA_SESSION_TTL_MS/,
        `geçersiz değer sessizce yutulmamalı: ${ham}`,
      );
      assert.throws(() => sessionTtlEnabled({ REA_SESSION_TTL_MS: ham }), /REA_SESSION_TTL_MS/);
    }
  });
});

describe("isSessionExpired: saf yaş hesabı", () => {
  it("TTL içinde yaşayan oturum süresi dolmamıştır", () => {
    assert.equal(isSessionExpired(iso(SIMDI - 1000), 60_000, SIMDI), false);
  });

  it("TTL aşan oturum süresi dolmuştur", () => {
    assert.equal(isSessionExpired(iso(SIMDI - 61_000), 60_000, SIMDI), true);
  });

  it("TTL=0 (kapalı) iken hiçbir şey dolmaz", () => {
    assert.equal(isSessionExpired(iso(0), 0, SIMDI), false);
  });
});

describe("(b) TTL dolan oturum temizlenir + dürüst hata", () => {
  it("sweepExpiredSessions yaşlı oturumu kapatır, genci bırakır", () => {
    const kayit = new SessionRegistry();
    const yasli = kayit.open("radare2");
    yasli.createdAt = iso(SIMDI - 61_000);
    const genc = kayit.open("radare2");
    genc.createdAt = iso(SIMDI - 1000);
    const kapanan = sweepExpiredSessions(kayit, 60_000, SIMDI);
    assert.deepEqual(kapanan, [yasli.id]);
    assert.equal(kayit.get(yasli.id), undefined);
    assert.ok(kayit.get(genc.id), "genç oturum temizlenmemeli");
  });

  it("requireLiveSession: dolan oturumu temizler, dürüst session_expired döner", () => {
    const kayit = new SessionRegistry();
    const oturum = kayit.open("radare2");
    oturum.createdAt = iso(SIMDI - 61_000);
    const sonuc = requireLiveSession(kayit, oturum.id, 60_000, SIMDI);
    assert.equal(sonuc.ok, false);
    assert.equal(sonuc.error, "session_expired");
    assert.equal(sonuc.session_id, oturum.id);
    assert.ok(sonuc.neden.length > 0);
    assert.ok(!("ok" in sonuc) || sonuc.ok !== true, "sahte ok:true YOK");
    assert.equal(kayit.get(oturum.id), undefined, "süresi dolan oturum temizlenmeli");
  });

  it("requireLiveSession: bilinmeyen oturum session_not_found döner", () => {
    const kayit = new SessionRegistry();
    const sonuc = requireLiveSession(kayit, "yok-boyle-oturum", 60_000, SIMDI);
    assert.equal(sonuc.ok, false);
    assert.equal(sonuc.error, "session_not_found");
    assert.equal(sonuc.session_id, "yok-boyle-oturum");
  });

  it("requireLiveSession: taze oturum ok:true ile yaşar", () => {
    const kayit = new SessionRegistry();
    const oturum = kayit.open("radare2");
    const sonuc = requireLiveSession(kayit, oturum.id, 60_000, SIMDI);
    assert.equal(sonuc.ok, true);
    assert.equal(sonuc.session.id, oturum.id);
    assert.ok(kayit.get(oturum.id), "taze oturum korunmalı");
  });
});

describe("(c) TTL=0'da davranış değişmez", () => {
  it("çok yaşlı oturum bile sweep/require'dan sağ çıkar", () => {
    const kayit = new SessionRegistry();
    const kadim = kayit.open("radare2");
    kadim.createdAt = iso(0);
    assert.deepEqual(sweepExpiredSessions(kayit, 0, SIMDI), []);
    const sonuc = requireLiveSession(kayit, kadim.id, 0, SIMDI);
    assert.equal(sonuc.ok, true);
    assert.ok(kayit.get(kadim.id), "TTL kapalıyken oturum korunmalı");
  });
});

describe("SessionTtlTracker: kayan (sliding) vade izleyici", () => {
  it("dokunulan (touch) oturum yaşlı createdAt'e rağmen yaşar", () => {
    const kayit = new SessionRegistry();
    const izlenen = kayit.open("radare2");
    izlenen.createdAt = iso(0);
    const dokunulmayan = kayit.open("radare2");
    dokunulmayan.createdAt = iso(0);
    const izleyici = new SessionTtlTracker(60_000);
    izleyici.touch(izlenen.id, SIMDI);
    assert.deepEqual(izleyici.sweep(kayit, SIMDI), [dokunulmayan.id]);
    assert.ok(kayit.get(izlenen.id), "dokunulan oturum yaşamalı");
    assert.equal(kayit.get(dokunulmayan.id), undefined);
  });

  it("geçersiz TTL ile kurulamaz (açık hata)", () => {
    assert.throws(() => new SessionTtlTracker(-1), /REA_SESSION_TTL/);
    assert.throws(() => new SessionTtlTracker(Number.NaN), /REA_SESSION_TTL/);
  });
});
