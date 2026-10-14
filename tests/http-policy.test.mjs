// http-policy.test.mjs: tokensiz HTTP salt-okunur politikasi, audit ve limitler.
// Kos: npm run build sonrasi `node --test tests/http-policy.test.mjs`.
// Protokol kaniti InMemoryTransport iledir; canli surec/debugger yoktur, yalniz
// allowlist'teki saf bir arac (rea_evm_selector) audit kaniti icin cagrilir.
// Sozlesme: readOnlyOnly (startHttp'de DBG_BRIDGE_TOKEN yokken acilir) yalniz
// 44 araci kaydeder ve REA_TOOLSETS ile kesisir; token'li yol (readOnlyOnly
// false) 171'i aynen korur; audit JSONL'e arguman/yol/token sizmaz.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createReaPlusMcpServer } from "../dist/server.js";
import {
  HTTP_READ_ONLY_TOOLS,
  HTTP_READ_ONLY_TOOL_SET,
  ConcurrencyGate,
  FixedWindowRateLimiter,
  createAuditLogger,
  httpReadOnlyAllowed,
  parseHttpLimits,
} from "../dist/server/httpPolicy.js";
import { parseToolsets } from "../dist/server/toolsets.js";
import { REA_SERVER_INFO_URI, REA_CAPABILITIES_SAFETY_URI, REA_PROMPT_NAMES } from "../dist/server/registerResourcesPrompts.js";

const TEHLIKELI_ORNEKLER = [
  "debug_open", "debug_attach", "debug_memory", "session_open", "session_close",
  "open_target", "disassemble", "events_pull", "explain", "prerequisites",
  "rea_process_run", "rea_frida_api", "rea_r2_debug", "rea_browser_nav",
  "rea_browser_shot", "rea_adb_install", "rea_adb_devices", "rea_net_capture",
  "rea_ghidra_analyze", "rea_jadx_full", "rea_apktool_build", "rea_upx_unpack",
  "rea_ilspy_decompile", "rea_investigate", "rea_pe_info", "rea_scan_repo",
  "rea_fs_snapshot", "rea_crash_kayit_parse", "rea_jeb_sorgu", "rea_storage_dump",
  "rea_obligation_advance", "rea_evidence_bundle", "rea_managed_verify",
];

const GUVENLI_ORNEKLER = [
  "health", "rea_evm_selector", "rea_wasm_exports", "rea_evm_disasm",
  "rea_sniff", "rea_coverage", "rea_readiness", "rea_fs_diff", "rea_typedef_oner",
];

function envIle(degisiklik, is) {
  const onceki = new Map();
  for (const k of Object.keys(degisiklik)) {
    onceki.set(k, process.env[k]);
    if (degisiklik[k] === undefined) delete process.env[k];
    else process.env[k] = degisiklik[k];
  }
  const geriYukle = () => {
    for (const [k, v] of onceki) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  try {
    const sonuc = is();
    if (sonuc && typeof sonuc.finally === "function") return sonuc.finally(geriYukle);
    geriYukle();
    return sonuc;
  } catch (e) {
    geriYukle();
    throw e;
  }
}

// Gercek MCP protokoluyle (initialize sonrasi) bir oturum acar; gonder() ham method cagirir.
async function oturumda(opts, is) {
  const server = createReaPlusMcpServer(opts);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const yanitlar = new Map();
  let idSayac = 0;
  clientT.onmessage = (m) => { if (m.id !== undefined) yanitlar.set(m.id, m); };
  const gonder = async (method, params) => {
    const id = ++idSayac;
    await clientT.send({ jsonrpc: "2.0", id, method, params });
    for (let i = 0; i < 250 && !yanitlar.has(id); i++) await new Promise((r) => setTimeout(r, 20));
    const y = yanitlar.get(id);
    assert.ok(y, `${method} yaniti gelmedi`);
    assert.ok(!y.error, `${method} hata dondu: ${JSON.stringify(y.error)}`);
    return y.result;
  };
  try {
    await server.connect(serverT);
    await clientT.start();
    await gonder("initialize", {
      protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "http-policy-test", version: "0" },
    });
    await clientT.send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    return await is(gonder);
  } finally {
    try { await server.close(); } catch { /* zaten kapali */ }
    try { await clientT.close(); } catch { /* zaten kapali */ }
  }
}

async function aracAdlari(gonder) {
  const araclar = [];
  let cursor;
  do {
    const sayfa = await gonder("tools/list", cursor ? { cursor } : {});
    araclar.push(...sayfa.tools.map((t) => t.name));
    cursor = sayfa.nextCursor;
  } while (cursor);
  return araclar;
}

describe("allowlist + kesisim (birim)", () => {
  it("allowlist 44 benzersiz aractir; tehlikeli ornekler disarida, guvenliler iceridedir", () => {
    assert.equal(HTTP_READ_ONLY_TOOLS.length, 44);
    assert.equal(HTTP_READ_ONLY_TOOL_SET.size, 44);
    for (const ad of TEHLIKELI_ORNEKLER) assert.ok(!HTTP_READ_ONLY_TOOL_SET.has(ad), `allowlist icermemeli: ${ad}`);
    for (const ad of GUVENLI_ORNEKLER) assert.ok(HTTP_READ_ONLY_TOOL_SET.has(ad), `allowlist icermeli: ${ad}`);
  });

  it("readOnlyOnly=false toolset sonucunu aynen korur (token'li yol daralmasiz)", () => {
    assert.equal(httpReadOnlyAllowed(null, false), null);
    const debug = parseToolsets("debug").allowedTools;
    assert.equal(httpReadOnlyAllowed(debug, false), debug);
  });

  it("readOnlyOnly=true allowlistle kesisir; toolset yoksa allowlistin kendisidir", () => {
    assert.deepEqual([...httpReadOnlyAllowed(null, true)].sort(), [...HTTP_READ_ONLY_TOOLS].sort());
    const kesisim = httpReadOnlyAllowed(parseToolsets("debug").allowedTools, true);
    assert.equal(kesisim.size, 13); // cekirdekten 6 + behavior/crash/fs_diff'ten 7 saf arac
    assert.ok(kesisim.has("health") && kesisim.has("rea_sniff") && kesisim.has("rea_fs_diff"));
    assert.ok(!kesisim.has("debug_open") && !kesisim.has("rea_frida_api"));
    assert.ok(!kesisim.has("rea_investigate") && !kesisim.has("prerequisites"), "cekirdekteki saf olmayanlar da duser");
    const minimal = httpReadOnlyAllowed(parseToolsets("minimal").allowedTools, true);
    assert.deepEqual(
      [...minimal].sort(),
      ["health", "rea_best_motor", "rea_config_suggest", "rea_fallback", "rea_missing_reason", "rea_sniff"].sort(),
    );
  });
});

describe("limit env ayrimi (birim)", () => {
  it("tanimsiz/bos deger varsayilani (120/dk, 16 eszamanli) verir", () => {
    assert.deepEqual(parseHttpLimits({}), { rateLimitPerMin: 120, maxConcurrent: 16 });
    assert.deepEqual(
      parseHttpLimits({ REA_HTTP_RATE_LIMIT_PER_MIN: "", REA_HTTP_MAX_CONCURRENT: "  " }),
      { rateLimitPerMin: 120, maxConcurrent: 16 },
    );
  });

  it("gecerli degerler bosluk kirpilarak okunur", () => {
    assert.deepEqual(
      parseHttpLimits({ REA_HTTP_RATE_LIMIT_PER_MIN: " 30 ", REA_HTTP_MAX_CONCURRENT: "4" }),
      { rateLimitPerMin: 30, maxConcurrent: 4 },
    );
  });

  it("gecersiz deger sessiz varsayilana dusmez, acik hata verir", () => {
    for (const kotu of ["abc", "0", "-1", "1.5", "10/dk", "9999999999999999999"]) {
      assert.throws(
        () => parseHttpLimits({ REA_HTTP_RATE_LIMIT_PER_MIN: kotu }),
        /REA_HTTP_RATE_LIMIT_PER_MIN gecersiz/,
        `deger: ${kotu}`,
      );
      assert.throws(
        () => parseHttpLimits({ REA_HTTP_MAX_CONCURRENT: kotu }),
        /REA_HTTP_MAX_CONCURRENT gecersiz/,
        `deger: ${kotu}`,
      );
    }
  });
});

describe("FixedWindowRateLimiter (birim)", () => {
  it("pencere icinde limit dolar, asimda retryAfter pencere sonunu gosterir", () => {
    const rl = new FixedWindowRateLimiter(3, 60_000);
    const t0 = 600_000 + 5_000; // pencere [600000, 660000)
    assert.deepEqual(rl.check("1.2.3.4", t0), { allowed: true, limit: 3, remaining: 2, retryAfterMs: 0 });
    assert.equal(rl.check("1.2.3.4", t0 + 1).remaining, 1);
    assert.equal(rl.check("1.2.3.4", t0 + 2).remaining, 0);
    const red = rl.check("1.2.3.4", t0 + 3);
    assert.equal(red.allowed, false);
    assert.equal(red.retryAfterMs, 660_000 - (t0 + 3));
  });

  it("anahtarlar bagimsizdir; yeni pencerede sayac sifirlanir; eski anahtarlar budanir", () => {
    const rl = new FixedWindowRateLimiter(1, 60_000);
    assert.equal(rl.check("a", 0).allowed, true);
    assert.equal(rl.check("a", 1).allowed, false);
    assert.equal(rl.check("b", 1).allowed, true, "baska IP etkilenmez");
    assert.equal(rl.check("a", 60_000).allowed, true, "yeni pencere");
    rl.prune(120_000);
    assert.equal(rl.trackedKeys, 0);
  });

  it("gecersiz kurulum acik hata verir", () => {
    assert.throws(() => new FixedWindowRateLimiter(0), /limitPerWindow pozitif/);
    assert.throws(() => new FixedWindowRateLimiter(5, 0), /windowMs pozitif/);
  });
});

describe("ConcurrencyGate (birim)", () => {
  it("tavan dolunca acquire null doner; release tek seferliktir ve sizinti yapmaz", () => {
    const kapı = new ConcurrencyGate(2);
    const r1 = kapı.acquire();
    const r2 = kapı.acquire();
    assert.ok(r1 && r2);
    assert.equal(kapı.active, 2);
    assert.equal(kapı.acquire(), null, "tavanda yeni istek alinmaz");
    r1();
    r1(); // finish + close cift tetiklenmesi sayaci ikinci kez dusurmemeli
    assert.equal(kapı.active, 1);
    const r3 = kapı.acquire();
    assert.ok(r3, "bosalanca yeniden alinabilir");
    r2();
    r3();
    assert.equal(kapı.active, 0);
  });

  it("gecersiz kurulum acik hata verir", () => {
    assert.throws(() => new ConcurrencyGate(0), /maxConcurrent pozitif/);
  });
});

describe("createAuditLogger (birim)", () => {
  it("kayit yalniz ts/transport/tool/durationMs/isError tasir; ek alan ve gizli veri sizmaz", () => {
    const satirlar = [];
    const log = createAuditLogger({ path: "audit.jsonl", append: (_p, s) => satirlar.push(s) });
    assert.equal(log.enabled, true);
    log.record({
      ts: "2026-01-01T00:00:00.000Z", transport: "http", tool: "rea_evm_selector",
      durationMs: 12.6, isError: false, arguments: { sig: "GIZLI-ISARET" }, token: "GIZLI-TOKEN",
    });
    assert.equal(satirlar.length, 1);
    const kayit = JSON.parse(satirlar[0]);
    assert.deepEqual(Object.keys(kayit), ["ts", "transport", "tool", "durationMs", "isError"]);
    assert.deepEqual(kayit, {
      ts: "2026-01-01T00:00:00.000Z", transport: "http", tool: "rea_evm_selector", durationMs: 13, isError: false,
    });
    assert.ok(!satirlar[0].includes("GIZLI"), "arguman/token satıra giremez");
  });

  it("yazma hatasinda tek uyarı basar, yol sizdirmaz ve kendini kapatir (record firlatmaz)", () => {
    const uyarilar = [];
    const gizliYol = "C:\\Users\\kisi\\ozel-dizin\\audit.jsonl";
    const log = createAuditLogger({
      path: gizliYol,
      warn: (m) => uyarilar.push(m),
      append: () => { const e = new Error(`EACCES: ${gizliYol}`); e.code = "EACCES"; throw e; },
    });
    log.record({ transport: "stdio", tool: "health", durationMs: 1, isError: false });
    log.record({ transport: "stdio", tool: "health", durationMs: 1, isError: false });
    assert.equal(uyarilar.length, 1, "uyari tek seferlik olmali");
    assert.ok(uyarilar[0].includes("EACCES"));
    assert.ok(!uyarilar[0].includes(gizliYol) && !uyarilar[0].includes("kisi"), "uyari kisisel yol icermez");
    assert.equal(log.enabled, false);
  });

  it("yol yoksa logger kapalidir ve kayit sessiz no-op'tur", () => {
    const log = createAuditLogger({ path: undefined });
    assert.equal(log.enabled, false);
    log.record({ transport: "http", tool: "health", durationMs: 0, isError: true });
  });
});

describe("fabrika yuzeyleri (gercek protokol, InMemoryTransport)", () => {
  it("tokensiz fabrika (readOnlyOnly) tam olarak allowlist'i kaydeder; resources/prompts kalir", async () => {
    await envIle({ REA_TOOLSETS: undefined, REA_AUDIT_LOG: undefined }, async () => {
      await oturumda({ readOnlyOnly: true, transport: "http" }, async (gonder) => {
        const araclar = await aracAdlari(gonder);
        assert.equal(araclar.length, 44);
        assert.deepEqual([...araclar].sort(), [...HTTP_READ_ONLY_TOOLS].sort());
        const kume = new Set(araclar);
        for (const ad of TEHLIKELI_ORNEKLER) assert.ok(!kume.has(ad), `tokensizde olmamali: ${ad}`);
        for (const ad of GUVENLI_ORNEKLER) assert.ok(kume.has(ad), `tokensizde olmali: ${ad}`);
        const resources = (await gonder("resources/list", {})).resources.map((r) => r.uri);
        const prompts = (await gonder("prompts/list", {})).prompts.map((p) => p.name);
        assert.deepEqual(resources, [REA_SERVER_INFO_URI, REA_CAPABILITIES_SAFETY_URI]);
        assert.deepEqual(prompts, [...REA_PROMPT_NAMES]);
      });
    });
  });

  it("token'li fabrika (readOnlyOnly:false) ve varsayilan fabrika 171 araci korur; allowlist gercek altkumedir", async () => {
    await envIle({ REA_TOOLSETS: undefined, REA_AUDIT_LOG: undefined }, async () => {
      for (const opts of [{ readOnlyOnly: false, transport: "http" }, {}]) {
        await oturumda(opts, async (gonder) => {
          const araclar = await aracAdlari(gonder);
          assert.equal(araclar.length, 171, `opts: ${JSON.stringify(opts)}`);
          const kume = new Set(araclar);
          for (const ad of HTTP_READ_ONLY_TOOLS) assert.ok(kume.has(ad), `allowlist ismi gercek arac degil: ${ad}`);
          for (const ad of ["debug_open", "rea_frida_api", "rea_browser_nav"]) assert.ok(kume.has(ad), `tam yuzeyde olmali: ${ad}`);
        });
      }
    });
  });

  it("tokensiz mod REA_TOOLSETS ile kesisir (minimal -> 6 arac)", async () => {
    await envIle({ REA_TOOLSETS: "minimal", REA_AUDIT_LOG: undefined }, async () => {
      await oturumda({ readOnlyOnly: true, transport: "http" }, async (gonder) => {
        const araclar = await aracAdlari(gonder);
        assert.deepEqual(
          [...araclar].sort(),
          ["health", "rea_best_motor", "rea_config_suggest", "rea_fallback", "rea_missing_reason", "rea_sniff"].sort(),
        );
      });
      // Ayni toolset token'li yolda minimal'in 8 aracini aynen verir.
      await oturumda({ readOnlyOnly: false, transport: "http" }, async (gonder) => {
        assert.equal((await aracAdlari(gonder)).length, 8);
      });
    });
  });

  it("audit: arac cagrisi JSONL'e argumansiz kayit dusurur (basari + isError)", async () => {
    const dizin = mkdtempSync(join(tmpdir(), "rea-http-policy-"));
    const auditYolu = join(dizin, "audit.jsonl");
    try {
      await envIle({ REA_TOOLSETS: undefined, REA_AUDIT_LOG: undefined }, async () => {
        await oturumda({ readOnlyOnly: true, transport: "http", auditLogPath: auditYolu }, async (gonder) => {
          await aracAdlari(gonder); // listeleme audit'e yazilmaz (yalniz arac cagrilari)
          const okYanit = await gonder("tools/call", {
            name: "rea_evm_selector",
            arguments: { sig: "transfer(address,uint256)" },
          });
          assert.ok(!okYanit.isError, "saf arac basarili olmali");
          assert.ok(JSON.stringify(okYanit).includes("0xa9059cbb"), "selector sonucu gercek olmali");
          const hataYanit = await gonder("tools/call", {
            name: "rea_evm_selector",
            arguments: { sig: "parantezsiz-imza" },
          });
          assert.equal(hataYanit.isError, true, "gecersiz girdi isError zarfi donmeli");
        });
      });
      const icerik = readFileSync(auditYolu, "utf8");
      const kayitlar = icerik.trim().split("\n").map((s) => JSON.parse(s));
      assert.equal(kayitlar.length, 2, "iki arac cagrisi iki satir olmali");
      for (const kayit of kayitlar) {
        assert.deepEqual(Object.keys(kayit), ["ts", "transport", "tool", "durationMs", "isError"]);
        assert.equal(kayit.transport, "http");
        assert.equal(kayit.tool, "rea_evm_selector");
        assert.ok(typeof kayit.durationMs === "number" && kayit.durationMs >= 0);
        assert.ok(!Number.isNaN(Date.parse(kayit.ts)), "ts gecerli ISO zaman olmali");
      }
      assert.equal(kayitlar[0].isError, false);
      assert.equal(kayitlar[1].isError, true);
      assert.ok(!icerik.includes("transfer("), "arguman icerigi loga sizmamali");
      assert.ok(!icerik.includes("parantezsiz"), "hata girdisi de loga sizmamali");
      assert.ok(!icerik.includes(dizin), "yerel yol loga sizmamali");
    } finally {
      rmSync(dizin, { recursive: true, force: true });
    }
  });
});
