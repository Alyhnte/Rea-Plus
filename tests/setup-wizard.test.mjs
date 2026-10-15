// setup-wizard.test.mjs: `rea-plus-cli setup` sihirbazı (Dalga F/1).
// Koş: npm run build sonrası `node tests/setup-wizard.test.mjs`.
// Kapsam: (a) her istemciye doğru yol+blok, (b) birleşme (diğer bloklar korunur),
// (c) bilinmeyen istemci -> liste + örnek, yazma yok, (d) bozuk JSON -> .bak + yazma;
// yedek alınamazsa durma, (e) --dry-run yazmaz, (f) mevcut CLI testleri ayrı koşar.
// BÜTÜN yazmalar geçici HOME dizinine (REA_PLUS_SETUP_HOME); gerçek kullanıcı
// config'ine ASLA dokunulmaz. Kayıt defteri taraması kapalıdır (NO_REGISTRY).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Kök dizini test dosyasının konumundan türet.
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
// CLI girişi: derlenmiş index.js (tsc emit sonrası var olmalı).
const cli = join(kok, "dist", "cli", "index.js");
// Kanonik blok: bütün JSON istemcilerde aynı ad+komut.
const BLOK = { command: "npx", args: ["-y", "rea-plus"] };
// Geçici HOME'lar: after() ile tek tek silinir.
const EVLER = [];

// Beklenen config yolu: sözleşme burada sabitlenir (implementasyondan bağımsız).
// win32 Claude yolu AppData altındadır, diğerleri HOME-görelidir.
function beklenenYol(home, id) {
  if (id === "cursor") return join(home, ".cursor", "mcp.json");
  if (id === "vscode") return join(home, ".vscode", "mcp.json");
  if (id === "windsurf") return join(home, ".codeium", "windsurf", "mcp_config.json");
  if (id === "codex") return join(home, ".codex", "config.toml");
  if (id === "claude") {
    if (process.platform === "win32") return join(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json");
    if (process.platform === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    return join(home, ".config", "Claude", "claude_desktop_config.json");
  }
  throw new Error(`bilinmeyen istemci: ${id}`);
}

// JSON istemcilerde üst anahtar: vscode "servers", diğerleri "mcpServers".
function ustAnahtar(id) {
  return id === "vscode" ? "servers" : "mcpServers";
}

// Yeni geçici HOME açar, listeye ekler (after'da temizlenir).
function yeniEv() {
  const ev = join(tmpdir(), `setup-wizard-${Date.now()}-${EVLER.length}-`);
  mkdirSync(ev, { recursive: true });
  EVLER.push(ev);
  return ev;
}

// CLI'yi çalıştır, stdout+stderr + exit kodunu birlikte döndür.
// HOME her çağrıda geçici dizine sabitlenir; kayıt defteri taraması kapalıdır.
function kos(home, args) {
  try {
    const out = execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      env: { ...process.env, REA_PLUS_SETUP_HOME: home, REA_PLUS_SETUP_NO_REGISTRY: "1" },
    });
    return { out, kod: 0 };
  } catch (h) {
    return { out: `${h.stdout ?? ""}${h.stderr ?? ""}`, kod: h.status ?? 1 };
  }
}

// Ev dizini altında bilinen config dosyalarından herhangi biri var mı?
function yazilanDosyalar(home) {
  const adaylar = ["cursor", "vscode", "windsurf", "codex", "claude"].map((id) => beklenenYol(home, id));
  return adaylar.filter((y) => existsSync(y));
}

before(() => {
  assert.ok(existsSync(cli), "önce `npm run build` gerekir (dist/cli/index.js yok)");
});

after(() => {
  for (const ev of EVLER) {
    try {
      rmSync(ev, { recursive: true, force: true });
    } catch {
      /* temizlik en iyi efor */
    }
  }
});

describe("setup (a): her istemciye doğru yol + doğru blok", () => {
  for (const id of ["cursor", "claude", "vscode", "codex", "windsurf"]) {
    it(`${id}: --yes ile yazar, blok kanonik olur`, () => {
      const ev = yeniEv();
      const r = kos(ev, ["setup", "--client", id, "--yes"]);
      assert.equal(r.kod, 0, `setup ${id} exit 0 olmalı :: ${r.out}`);
      const yol = beklenenYol(ev, id);
      assert.ok(existsSync(yol), `${id} config dosyası yazılmalı: ${yol}`);
      if (id === "codex") {
        const icerik = readFileSync(yol, "utf8");
        assert.ok(icerik.includes("[mcp_servers.rea-plus]"), "codex bölümü olmalı");
        assert.ok(icerik.includes('command = "npx"'), "codex command npx olmalı");
        assert.ok(icerik.includes('"-y", "rea-plus"'), "codex args olmalı");
      } else {
        const cfg = JSON.parse(readFileSync(yol, "utf8"));
        assert.deepEqual(cfg[ustAnahtar(id)]["rea-plus"], BLOK);
      }
    });
  }
});

describe("setup (b): mevcut config birleşir, diğer bloklar korunur", () => {
  it("cursor: mevcut sunucu + üst anahtarlar korunur, rea-plus eklenir", () => {
    const ev = yeniEv();
    const yol = beklenenYol(ev, "cursor");
    mkdirSync(dirname(yol), { recursive: true });
    const mevcut = { command: "node", args: ["mevcut.js"] };
    writeFileSync(yol, JSON.stringify({ mcpServers: { mevcut }, inputs: [] }, null, 2) + "\n", "utf8");
    const r = kos(ev, ["setup", "--client", "cursor", "--yes"]);
    assert.equal(r.kod, 0, `birleşme exit 0 olmalı :: ${r.out}`);
    const cfg = JSON.parse(readFileSync(yol, "utf8"));
    assert.deepEqual(cfg.mcpServers.mevcut, mevcut, "mevcut blok korunmalı");
    assert.deepEqual(cfg.mcpServers["rea-plus"], BLOK, "rea-plus eklenmeli");
    assert.deepEqual(cfg.inputs, [], "diğer üst anahtar korunmalı");
    // Sayı: 1 mevcut + 1 rea-plus = 2 sunucu (fixture'dan türetildi).
    assert.equal(Object.keys(cfg.mcpServers).length, 2, "sunucu sayısı 2 olmalı");
  });
  it("cursor: eski rea-plus bloğu güncellenir", () => {
    const ev = yeniEv();
    const yol = beklenenYol(ev, "cursor");
    mkdirSync(dirname(yol), { recursive: true });
    writeFileSync(yol, JSON.stringify({ mcpServers: { "rea-plus": { command: "node", args: ["eski.js"] } } }), "utf8");
    const r = kos(ev, ["setup", "--client", "cursor", "--yes"]);
    assert.equal(r.kod, 0, `güncelleme exit 0 olmalı :: ${r.out}`);
    const cfg = JSON.parse(readFileSync(yol, "utf8"));
    assert.deepEqual(cfg.mcpServers["rea-plus"], BLOK, "eski blok kanonikle güncellenmeli");
  });
  it("codex: mevcut TOML bölümü korunur, rea-plus bölümü eklenir", () => {
    const ev = yeniEv();
    const yol = beklenenYol(ev, "codex");
    mkdirSync(dirname(yol), { recursive: true });
    writeFileSync(yol, '[mcp_servers.baska]\ncommand = "baska"\n', "utf8");
    const r = kos(ev, ["setup", "--client", "codex", "--yes"]);
    assert.equal(r.kod, 0, `codex birleşme exit 0 olmalı :: ${r.out}`);
    const icerik = readFileSync(yol, "utf8");
    assert.ok(icerik.includes('[mcp_servers.baska]\ncommand = "baska"'), "mevcut TOML bölümü korunmalı");
    assert.ok(icerik.includes("[mcp_servers.rea-plus]"), "rea-plus bölümü eklenmeli");
  });
});

describe("setup (c): bilinmeyen istemci -> liste + örnek, yazma yok", () => {
  it("bilinmeyen --client exit 1 verir, destek listesi + manuel örnek basar", () => {
    const ev = yeniEv();
    const r = kos(ev, ["setup", "--client", "boyle-bir-istemci-yok", "--yes"]);
    assert.equal(r.kod, 1, "bilinmeyen istemci exit 1 olmalı");
    assert.ok(r.out.includes("bilinmeyen istemci"), "hata metni açık olmalı");
    for (const id of ["cursor", "claude", "vscode", "codex", "windsurf"]) {
      assert.ok(r.out.includes(id), `destek listesi ${id} içermeli`);
    }
    assert.ok(r.out.includes("mcpServers"), "manuel JSON örneği olmalı");
    assert.ok(r.out.includes("[mcp_servers.rea-plus]"), "manuel TOML örneği olmalı");
    assert.deepEqual(yazilanDosyalar(ev), [], "hiçbir config yazılmamalı");
  });
  it("istemci bulunamazsa (boş ev): liste + örnek, yazma yok", () => {
    const ev = yeniEv();
    const r = kos(ev, ["setup", "--yes"]);
    assert.equal(r.kod, 1, "istemcisiz ev exit 1 olmalı");
    assert.ok(r.out.includes("cursor"), "kurulu/destek listesi basılmalı");
    assert.ok(r.out.includes("mcpServers"), "manuel örnek basılmalı");
    assert.deepEqual(yazilanDosyalar(ev), [], "hiçbir config yazılmamalı");
  });
  it("birden fazla algıda --client istenir, yazma yok", () => {
    const ev = yeniEv();
    mkdirSync(join(ev, ".cursor"), { recursive: true });
    mkdirSync(join(ev, ".vscode"), { recursive: true });
    const r = kos(ev, ["setup", "--yes"]);
    assert.equal(r.kod, 1, "çoklu algı exit 1 olmalı");
    assert.ok(r.out.includes("--client"), "--client istenmeli");
    assert.deepEqual(yazilanDosyalar(ev), [], "seçim yapılmadan yazılmamalı");
  });
});

describe("setup (d): bozuk JSON -> .bak + yazma; yedek alınamazsa durma", () => {
  it("bozuk cursor config'i .bak'e alınıp tazelenir", () => {
    const ev = yeniEv();
    const yol = beklenenYol(ev, "cursor");
    mkdirSync(dirname(yol), { recursive: true });
    const bozuk = "{bozuk json,,,";
    writeFileSync(yol, bozuk, "utf8");
    const r = kos(ev, ["setup", "--client", "cursor", "--yes"]);
    assert.equal(r.kod, 0, `bozuk sonrası yazma exit 0 olmalı :: ${r.out}`);
    const yedek = `${yol}.bak`;
    assert.ok(existsSync(yedek), ".bak yedeği alınmalı");
    assert.equal(readFileSync(yedek, "utf8"), bozuk, ".bak özgün bozuk baytları taşımalı");
    const cfg = JSON.parse(readFileSync(yol, "utf8"));
    assert.deepEqual(cfg.mcpServers["rea-plus"], BLOK, "taze config rea-plus içermeli");
  });
  it("yedek alınamazsa (.bak dizinse) DURUR, config'e dokunmaz", () => {
    const ev = yeniEv();
    const yol = beklenenYol(ev, "cursor");
    mkdirSync(dirname(yol), { recursive: true });
    const bozuk = "{bozuk json,,,";
    writeFileSync(yol, bozuk, "utf8");
    mkdirSync(`${yol}.bak`, { recursive: true }); // copyFile hedefi dizin -> yedek başarısız olur
    const r = kos(ev, ["setup", "--client", "cursor", "--yes"]);
    assert.equal(r.kod, 1, "yedeksiz yazma exit 1 olmalı");
    assert.ok(r.out.toLowerCase().includes("yedek"), "yedek hatası açıkça raporlanmalı");
    assert.equal(readFileSync(yol, "utf8"), bozuk, "config değiştirilmeden durmalı");
  });
  it("yazılamayan dizinde (config yolu dizinse) açık hata verir", () => {
    const ev = yeniEv();
    const yol = beklenenYol(ev, "cursor");
    mkdirSync(yol, { recursive: true }); // dosya yerine dizin -> yazma başarısız olur
    const r = kos(ev, ["setup", "--client", "cursor", "--yes"]);
    assert.equal(r.kod, 1, "yazılamayan yol exit 1 olmalı");
    assert.ok(r.out.length > 0, "hata çıktısı boş olmamalı");
  });
});

describe("setup (e): --dry-run yazmaz, önizleme basar", () => {
  it("dry-run dosya oluşturmaz ama hedef + bloğu gösterir", () => {
    const ev = yeniEv();
    const yol = beklenenYol(ev, "cursor");
    const r = kos(ev, ["setup", "--client", "cursor", "--dry-run"]);
    assert.equal(r.kod, 0, "dry-run exit 0 olmalı");
    assert.ok(!existsSync(yol), "dry-run dosyası yazmamalı");
    assert.ok(r.out.includes("rea-plus"), "önizleme bloğu göstermeli");
    assert.ok(r.out.includes("mcp.json"), "önizleme hedef yolu göstermeli");
  });
});

describe("setup algı + liste", () => {
  it("tek kurulu istemci (yalnız .codex izi) otomatik seçilir", () => {
    const ev = yeniEv();
    mkdirSync(join(ev, ".codex"), { recursive: true });
    const r = kos(ev, ["setup", "--yes"]);
    assert.equal(r.kod, 0, `tek algı exit 0 olmalı :: ${r.out}`);
    assert.ok(existsSync(beklenenYol(ev, "codex")), "codex config yazılmalı");
  });
  it("--list desteklenenleri ve yolları basar, yazmaz", () => {
    const ev = yeniEv();
    const r = kos(ev, ["setup", "--list"]);
    assert.equal(r.kod, 0, "--list exit 0 olmalı");
    for (const id of ["cursor", "claude", "vscode", "codex", "windsurf"]) {
      assert.ok(r.out.includes(id), `--list ${id} içermeli`);
    }
    assert.deepEqual(yazilanDosyalar(ev), [], "--list yazmamalı");
  });
});
