// docs-examples.test.mjs: docs/EXAMPLES.md'deki 5 senaryonun GERÇEKTEN koştuğunu
// doğrular (metin incelemesi yetmez). Her senaryo gerçek komut/fonksiyonu
// çalıştırır, beklenen anahtar çıktıyı assert eder, sayılar güncel tutulur.
// Koş: önce `npm run build`, sonra `node --test tests/docs-examples.test.mjs`.
// Tamamen offline: corpus fixture'ları + tmp dizinleri + yerel 127.0.0.1
// sembol sunucusu (dış ağ yok). Kişisel yol assert edilmez (yalnız taban ad).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { rea_behavior_timeline } from "../dist/rea-domains/behavior/BehaviorTimeline.js";
import { rea_scan_repo } from "../dist/rea-domains/reposcan/RepoScan.js";
import { resolveJadxCommand, rea_jadx_manifest } from "../dist/rea-domains/android/JadxBridge.js";
import { rea_pdb_yolu, rea_pdb_indir } from "../dist/rea-domains/typedef/PdbReader.js";

// Kök + derlenmiş CLI + corpus fixture yolları (yalnız okuma; yazma yok).
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(kok, "dist", "cli", "index.js");
const PE = join(kok, "tests", "corpus", "mini_pe_x64.exe");
const APK = join(kok, "tests", "corpus", "sahte.apk");
const TOOLS_MD = join(kok, "docs", "TOOLS.md");
const ORNEKLER_MD = join(kok, "docs", "EXAMPLES.md");

// CLI'yi çalıştır: stdout + exit kodu birlikte döner (PATH'e değil node'a güven).
function cliKos(args) {
  try {
    return { out: execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" }), kod: 0 };
  } catch (h) {
    return { out: `${h.stdout ?? ""}${h.stderr ?? ""}`, kod: h.status ?? 1 };
  }
}

describe("senaryo 1: PE triage (analyze-pe, gerçek mini_pe_x64.exe)", () => {
  // JSON kip: machine/bit/section/entry + import adları kanonik değerlerde.
  it("json alanları beklenen değerleri taşır", () => {
    const r = cliKos(["analyze-pe", PE, "--json"]);
    assert.equal(r.kod, 0, "analyze-pe --json exit 0 olmalı");
    const j = JSON.parse(r.out);
    assert.equal(j.ok, true);
    assert.equal(j.machine_hex, "0x8664");
    assert.equal(j.bit, "64");
    assert.equal(j.section_sayisi, 1);
    assert.equal(j.entry_hex, "0x1000");
    assert.ok(j.dlls.includes("kernel32.dll"));
    assert.ok(j.fonksiyonlar.includes("kernel32.dll!ExitProcess"));
  });

  // Metin kip: aynı anahtar dizgiler insan-okunur satırlarda görünür.
  it("metin kip anahtar dizgileri içerir", () => {
    const r = cliKos(["analyze-pe", PE]);
    assert.equal(r.kod, 0, "analyze-pe exit 0 olmalı");
    assert.ok(r.out.includes("0x8664"), "machine satırı olmalı");
    assert.ok(r.out.includes("kernel32.dll"), "dll satırı olmalı");
    assert.ok(r.out.includes("ExitProcess"), "fonksiyon satırı olmalı");
  });
});

describe("senaryo 2: APK manifest (rea_jadx_manifest, sahte.apk)", () => {
  // jadx kuruluysa gerçek parse, yoksa dürüst kapı (CI/offline yeşil kalır).
  const jadxVar = resolveJadxCommand(process.env, process.platform) !== null;

  it(jadxVar ? "paket adını gerçek parse ile çözer" : "jadx yoksa capability_unsupported verir", () => {
    const r = rea_jadx_manifest(APK);
    if (!jadxVar) {
      assert.equal(r.ok, false);
      assert.equal(r.code, "capability_unsupported");
      assert.match(r.neden, /jadx bulunamadı/);
      return;
    }
    assert.equal(r.ok, true);
    assert.equal(r.paket, "com.ornek.sahte");
    assert.deepEqual(r.izinler, []);
    assert.deepEqual(r.aktiviteler, []);
  });

  // Olmayan APK her makinede aynı kapıya takılır (araçtan bağımsız).
  it("olmayan APK capability_unsupported verir", () => {
    const r = rea_jadx_manifest(join(tmpdir(), "kesin-olmayan-docs-9f3k2.apk"));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
    assert.match(r.neden, /APK yok/);
  });
});

describe("senaryo 3: davranış profili (rea_behavior_timeline, saf fonksiyon)", () => {
  // Sabit 4 olay: kaynak önceliği + ilk/son + top_api özeti tutmalı.
  it("sıralama ve özet beklenen değerleri verir", () => {
    const r = rea_behavior_timeline([
      { kaynak: "api", zaman: 3, detay: "CreateFileW" },
      { kaynak: "net", zaman: 1, detay: "dns:ornek.test" },
      { kaynak: "api", zaman: 2, detay: "CreateFileW" },
      { kaynak: "process", zaman: 4, detay: "exit:0" },
    ]);
    assert.equal(r.ok, true);
    assert.equal(r.summary, "4 olay api@2 -> process@4 top_api=CreateFileW");
    assert.deepEqual(r.details.sıralı.map((o) => o.kaynak), ["api", "api", "net", "process"]);
    assert.deepEqual(r.details.sayılar, { api: 2, net: 1, process: 1 });
    assert.deepEqual(r.details.top_api, [{ ad: "CreateFileW", n: 2 }]);
    assert.equal(r.details.ilk, "api@2");
    assert.equal(r.details.son, "process@4");
  });

  // Boş liste kapıdan döner (uydurma timeline yok).
  it("boş liste capability_unsupported verir", () => {
    const r = rea_behavior_timeline([]);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("senaryo 4: repo tarama (rea_scan_repo, 5 sihirli dosya)", () => {
  // Karışık sahne: PE+ELF+APK+JS+WASM sihir baytlı 5 dosya tmp dizinde.
  function sahne() {
    const dir = mkdtempSync(join(tmpdir(), "rea-docs-reposcan-"));
    const b = (hex) => Buffer.from(hex, "hex");
    writeFileSync(join(dir, "a.exe"), b("4d5a900003000000"));
    writeFileSync(join(dir, "b.elf"), b("7f454c4602010100"));
    writeFileSync(join(dir, "c.apk"), b("504b030414000000"));
    writeFileSync(join(dir, "d.js"), "console.log(1);\n");
    writeFileSync(join(dir, "e.wasm"), b("0061736d01000000"));
    return dir;
  }

  // 5 dosya, 5 tip, 5 plan + özet satırı; PE cutter motoru önerir.
  it("tip sayımı + plan + özet tutar", async () => {
    const dir = sahne();
    try {
      const r = await rea_scan_repo(dir);
      assert.equal(r.ok, true);
      assert.deepEqual(r.details.tipler, { pe: 1, elf: 1, apk: 1, js: 1, wasm: 1 });
      assert.equal(r.details.planlar.length, 5);
      assert.ok(r.summary.includes("5 dosya"));
      assert.equal(r.details.dosyalar.find((d) => d.yol === "a.exe").tip, "pe");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // Hedef dosyasız dizin: boş ama ok sonuç (kapı değil).
  it("boş dizin boş liste döner", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rea-docs-bos-"));
    try {
      writeFileSync(join(dir, "not.txt"), "desteklenmeyen uzantı");
      const r = await rea_scan_repo(dir);
      assert.equal(r.ok, true);
      assert.deepEqual(r.details.dosyalar, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("senaryo 5: PDB indirme (yerel sembol sunucusu, ağ yok)", () => {
  const GUID = "ABCDEF01-2345-6789-ABCD-EF0123456789";
  const YAS = 1;
  const PDB_AD = "ornek_test.pdb";
  const SIG = GUID.replace(/-/g, "").toUpperCase() + String(YAS);

  let KOK = "";
  let PE_DBG = "";
  before(() => {
    KOK = mkdtempSync(join(tmpdir(), "rea-docs-pdb-"));
    PE_DBG = join(KOK, "ornek.exe");
    writeFileSync(PE_DBG, minimalDebugPe());
  });

  // GUID'i CodeView LE düzeninde yazar (Data1/2/3 LE, Data4 ham).
  function guidYaz(dv, off, guid) {
    const s = guid.replace(/-/g, "");
    dv.setUint32(off, parseInt(s.slice(0, 8), 16), true);
    dv.setUint16(off + 4, parseInt(s.slice(8, 12), 16), true);
    dv.setUint16(off + 6, parseInt(s.slice(12, 16), 16), true);
    for (let i = 0; i < 8; i++) dv.setUint8(off + 8 + i, parseInt(s.slice(16 + i * 2, 18 + i * 2), 16));
  }

  // Minimal PE32+ (tek .text) + CodeView RSDS debug kaydı (tmp'de üretilir).
  function minimalDebugPe() {
    const HAM_BAS = 0x200, HAM_BOY = 0x600;
    const b = Buffer.alloc(HAM_BAS + HAM_BOY, 0);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    b.write("MZ", 0, "latin1");
    dv.setUint32(0x3c, 64, true);
    b.write("PE\0\0", 64, "latin1");
    const coff = 68, opt = 88;
    dv.setUint16(coff, 0x8664, true);
    dv.setUint16(coff + 2, 1, true);
    dv.setUint16(coff + 16, 240, true);
    dv.setUint16(opt, 0x20b, true);
    dv.setUint32(opt + 16, 0x1000, true);
    const r2o = (rva) => HAM_BAS + (rva - 0x1000);
    const DBG = 0x1080, RSDS = 0x10a0;
    dv.setUint32(opt + 160, DBG, true);
    dv.setUint32(opt + 164, 28, true);
    const g = r2o(DBG);
    dv.setUint32(g + 12, 2, true);
    dv.setUint32(g + 16, 24 + PDB_AD.length + 1, true);
    dv.setUint32(g + 20, RSDS, true);
    dv.setUint32(g + 24, r2o(RSDS), true);
    const p = r2o(RSDS);
    b.write("RSDS", p, "latin1");
    guidYaz(dv, p + 4, GUID);
    dv.setUint32(p + 20, YAS, true);
    b.write(PDB_AD + "\0", p + 24, "latin1");
    const sec = opt + 240;
    b.write(".text", sec, "latin1");
    dv.setUint32(sec + 8, 0x200, true);
    dv.setUint32(sec + 12, 0x1000, true);
    dv.setUint32(sec + 16, HAM_BOY, true);
    dv.setUint32(sec + 20, HAM_BAS, true);
    return b;
  }

  // Sahte MSF PDB: gerçek imza + gömülü GUID/yaş (bütünlük kapısı için).
  function sahtePdb(bozuk = false) {
    const b = Buffer.alloc(4096, 0);
    b.write(bozuk ? "BOZUK-ICERIK" : "Microsoft C/C++ MSF 7.00\r\n\x1aDS\0\0\0", 0, "latin1");
    if (!bozuk) {
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      guidYaz(dv, 1024, GUID);
      dv.setUint32(1040, YAS, true);
    }
    return b;
  }

  // CodeView'dan PDB adı + GUID + yaş çözülür (kişisel yol assert edilmez).
  it("pdb_yolu guid+yaş çözer", () => {
    const r = rea_pdb_yolu(PE_DBG);
    assert.equal(r.ok, true);
    assert.equal(r.pdb, PDB_AD);
    assert.equal(r.guid, GUID);
    assert.equal(r.yas, YAS);
    assert.equal(basename(r.dosya), "ornek.exe");
  });

  // Yerel sembol sunucusu: indir (URL düzeni SymSrv) + ikinci çağrı önbellekten.
  it("indirir, URL düzeni doğrudur, ikinci çağrı önbellekten gelir", async () => {
    let sayac = 0;
    const srv = http.createServer(((_istek, yanit) => { sayac++; yanit.writeHead(200); yanit.end(sahtePdb()); }));
    await new Promise((cöz) => srv.listen(0, "127.0.0.1", cöz));
    const cache = join(KOK, "cache");
    try {
      const taban = `http://127.0.0.1:${srv.address().port}`;
      const ilk = await rea_pdb_indir(PE_DBG, { cacheDir: cache, serverUrl: taban });
      assert.equal(ilk.ok, true);
      assert.equal(sayac, 1);
      assert.match(ilk.url, new RegExp(`${PDB_AD}/${SIG}/${PDB_AD}$`));
      assert.equal(basename(ilk.yol), PDB_AD);
      assert.ok(existsSync(ilk.yol), "indirilen dosya yazılmalı");
      assert.equal(ilk.cache, false);
      const ikinci = await rea_pdb_indir(PE_DBG, { cacheDir: cache, serverUrl: taban });
      assert.equal(ikinci.ok, true);
      assert.equal(ikinci.cache, true);
      assert.equal(sayac, 1, "önbellek hit: ağa gidilmemeli");
    } finally {
      await new Promise((cöz) => srv.close(cöz));
      rmSync(cache, { recursive: true, force: true });
    }
  });

  // Bütünlük tutmayan içerik yazılmaz, açık kodla döner.
  it("bozuk içerik butunluk_hatasi verir, dosya yazılmaz", async () => {
    const srv = http.createServer(((_istek, yanit) => { yanit.writeHead(200); yanit.end(sahtePdb(true)); }));
    await new Promise((cöz) => srv.listen(0, "127.0.0.1", cöz));
    const cache = join(KOK, "cache-bozuk");
    try {
      const r = await rea_pdb_indir(PE_DBG, { cacheDir: cache, serverUrl: `http://127.0.0.1:${srv.address().port}` });
      assert.equal(r.ok, false);
      assert.equal(r.code, "butunluk_hatasi");
      assert.equal(existsSync(join(cache, PDB_AD, SIG, PDB_AD)), false);
    } finally {
      await new Promise((cöz) => srv.close(cöz));
      rmSync(cache, { recursive: true, force: true });
    }
  });
});

describe("sayı senkronu: EXAMPLES.md güncel yüzeyi yansıtır", () => {
  // TOOLS.md özetini parse et (üretilmiş referans = gerçek yüzey).
  function ozet(md) {
    const al = (re) => { const m = md.match(re); assert.ok(m, `${re} bulunamadı`); return Number(m[1]); };
    return {
      arac: al(/^- Toplam araç: (\d+)$/m),
      sema: al(/^- outputSchema taşıyan araç: (\d+)$/m),
      ann: al(/^- annotations taşıyan araç: (\d+)$/m),
      res: al(/^- Toplam resource: (\d+)$/m),
      prompt: al(/^- Toplam prompt: (\d+)$/m),
    };
  }

  // EXAMPLES.md'deki ilan edilen sayılar TOOLS.md ile birebir aynı olmalı.
  it("araç/şema/resource/prompt sayıları TOOLS.md ile eşleşir", () => {
    const g = ozet(readFileSync(TOOLS_MD, "utf8"));
    const ornekler = readFileSync(ORNEKLER_MD, "utf8");
    for (const [ad, deger] of [["araç", g.arac], ["outputSchema", g.sema], ["annotations", g.ann]]) {
      assert.ok(ornekler.includes(`**${deger} ${ad}`), `EXAMPLES.md **${deger} ${ad} içermeli`);
    }
    assert.ok(ornekler.includes(`${g.res} resource`), "resource sayısı geçmeli");
    assert.ok(ornekler.includes(`${g.prompt} prompt`), "prompt sayısı geçmeli");
    // Kişisel yol sızıntısı yok (ev dizini / kullanıcı profili).
    assert.ok(!ornekler.includes(":\\Users\\"), "kullanıcı yolu sızmamalı");
    assert.ok(!ornekler.includes(":/Users/"), "kullanıcı yolu (/) sızmamalı");
    assert.ok(!ornekler.includes("AppData"), "profil dizini sızmamalı");
  });
});
