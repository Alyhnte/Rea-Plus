// pdb-register-ready.test.mjs: Dalga E/3 — rea_pdb_indir MCP kayıt HAZIRLIĞI (TDD).
// KAYIT YOK: taslak (ad/açıklama/inputSchema/outputSchema/annotations) SAHTE
// sunucuya kaydedilir + şema doğrulanır; registerReaTools.ts'ye dokunulmaz.
// Koş: önce `npm run build`, sonra `node --test tests/pdb-register-ready.test.mjs`.
// Ağ yok: tüm indirme sahte fetchFn ile; corpus'a dokunulmaz (geçici PE üretilir).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  rea_pdb_indir,
  REA_PDB_INDIR_ARAC,
  REA_PDB_INDIR_ACIKLAMA,
  reaPdbIndirInputSchema,
  reaPdbIndirOutputSchema,
  REA_PDB_INDIR_ANNOTATIONS,
  REA_PDB_INDIR_KAYIT_TASLAGI,
  reaPdbIndirKayitHandler,
} from "../dist/rea-domains/typedef/PdbReader.js";

const GUID = "ABCDEF01-2345-6789-ABCD-EF0123456789";
const YAS = 1;
const PDB_AD = "ornek_test.pdb";

let KOK = "";
before(() => { KOK = mkdtempSync(join(tmpdir(), "pdb-kayit-")); });

function guidYaz(dv, off, guid) {
  const s = guid.replace(/-/g, "");
  dv.setUint32(off, parseInt(s.slice(0, 8), 16), true);
  dv.setUint16(off + 4, parseInt(s.slice(8, 12), 16), true);
  dv.setUint16(off + 6, parseInt(s.slice(12, 16), 16), true);
  for (let i = 0; i < 8; i++) dv.setUint8(off + 8 + i, parseInt(s.slice(16 + i * 2, 18 + i * 2), 16));
}

// Geçici minimal PE32+: debug=true ise CodeView RSDS kaydı içerir.
function minimalPe({ debug = false } = {}) {
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
  dv.setUint32(opt + 108, 16, true);
  const rva2off = (rva) => HAM_BAS + (rva - 0x1000);
  if (debug) {
    const DBG = 0x1080, RSDS = 0x10a0;
    dv.setUint32(opt + 160, DBG, true);
    dv.setUint32(opt + 164, 28, true);
    const g = rva2off(DBG);
    dv.setUint32(g + 12, 2, true);
    dv.setUint32(g + 16, 24 + PDB_AD.length + 1, true);
    dv.setUint32(g + 20, RSDS, true);
    dv.setUint32(g + 24, rva2off(RSDS), true);
    const p = rva2off(RSDS);
    b.write("RSDS", p, "latin1");
    guidYaz(dv, p + 4, GUID);
    dv.setUint32(p + 20, YAS, true);
    b.write(PDB_AD + "\0", p + 24, "latin1");
  }
  const sec = opt + 240;
  b.write(".text", sec, "latin1");
  dv.setUint32(sec + 8, 0x200, true);
  dv.setUint32(sec + 12, 0x1000, true);
  dv.setUint32(sec + 16, HAM_BOY, true);
  dv.setUint32(sec + 20, HAM_BAS, true);
  return b;
}

// Sahte MSF PDB: gerçek imza + gömülü GUID/YAS.
function sahtePdb() {
  const b = Buffer.alloc(4096, 0);
  b.write("Microsoft C/C++ MSF 7.00\r\n\x1aDS\0\0\0", 0, "latin1");
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  guidYaz(dv, 1024, GUID);
  dv.setUint32(1040, YAS, true);
  return b;
}

function sahteSunucu(icerik) {
  let sayac = 0;
  const fn = async (url) => {
    sayac++;
    const kopya = Buffer.from(icerik);
    return {
      ok: true, status: 200,
      arrayBuffer: async () => kopya.buffer.slice(kopya.byteOffset, kopya.byteOffset + kopya.byteLength),
    };
  };
  return { fn, sayac: () => sayac };
}

// Sahte MCP sunucusu: registerTool imzasını yakalar, gerçek kayıt yapmaz.
function sahteMcp() {
  const kayitlar = [];
  return {
    kayitlar,
    registerTool: (ad, cfg, handler) => { kayitlar.push({ ad, cfg, handler }); },
  };
}

describe("rea_pdb_indir kayıt taslağı (sahte sunucu)", () => {
  it("(a) taslak sahte sunucuya eksiksiz kaydedilir", () => {
    assert.equal(REA_PDB_INDIR_ARAC, "rea_pdb_indir");
    assert.ok(typeof REA_PDB_INDIR_ACIKLAMA === "string" && REA_PDB_INDIR_ACIKLAMA.length > 10);
    const sunucu = sahteMcp();
    sunucu.registerTool(
      REA_PDB_INDIR_KAYIT_TASLAGI.name,
      {
        description: REA_PDB_INDIR_KAYIT_TASLAGI.description,
        inputSchema: REA_PDB_INDIR_KAYIT_TASLAGI.inputSchema,
        outputSchema: REA_PDB_INDIR_KAYIT_TASLAGI.outputSchema,
        annotations: REA_PDB_INDIR_KAYIT_TASLAGI.annotations,
      },
      reaPdbIndirKayitHandler,
    );
    assert.equal(sunucu.kayitlar.length, 1);
    const [kayit] = sunucu.kayitlar;
    assert.equal(kayit.ad, "rea_pdb_indir");
    assert.equal(typeof kayit.handler, "function");
    assert.equal(kayit.cfg.description, REA_PDB_INDIR_ACIKLAMA);
    assert.equal(kayit.cfg.inputSchema, reaPdbIndirInputSchema);
    assert.equal(kayit.cfg.outputSchema, reaPdbIndirOutputSchema);
    assert.equal(kayit.cfg.annotations, REA_PDB_INDIR_ANNOTATIONS);
  });

  it("(a) inputSchema: path zorunlu, boş path geçersiz", () => {
    assert.equal(reaPdbIndirInputSchema.safeParse({ path: "ornek.exe" }).success, true);
    assert.equal(reaPdbIndirInputSchema.safeParse({}).success, false);
    assert.equal(reaPdbIndirInputSchema.safeParse({ path: "" }).success, false);
  });

  it("(a) annotations: yazan + ağa çıkan iş — readOnly değil", () => {
    assert.deepEqual({ ...REA_PDB_INDIR_ANNOTATIONS }, {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    });
  });

  it("(a) kayıt handler'ı fonksiyonla uyumlu: debug'sız PE'de ağa çıkmadan dürüst hata", async () => {
    const { writeFileSync } = await import("node:fs");
    const yol = join(KOK, "debugsiz.exe");
    writeFileSync(yol, minimalPe({ debug: false }));
    const r = await reaPdbIndirKayitHandler({ path: yol });
    assert.equal(r.ok, false);
    assert.ok(typeof r.neden === "string" && r.neden.length > 0);
  });

  it("(a) gerçek başarı çıktısı outputSchema'dan geçer (sahte HTTP)", async () => {
    const { writeFileSync } = await import("node:fs");
    const pe = join(KOK, "indir.exe");
    writeFileSync(pe, minimalPe({ debug: true }));
    const srv = sahteSunucu(sahtePdb());
    const r = await rea_pdb_indir(pe, { cacheDir: join(KOK, "cache-sema"), fetchFn: srv.fn });
    assert.equal(r.ok, true);
    assert.equal(srv.sayac(), 1);
    const dogrulama = reaPdbIndirOutputSchema.safeParse(r);
    assert.equal(dogrulama.success, true);
  });

  it("KAYIT YAPILDI: registerReaTools.ts taslağı kaydeder (entegrasyon tamamlandı)", () => {
    const kok = dirname(dirname(fileURLToPath(import.meta.url)));
    const kayitJs = readFileSync(join(kok, "dist", "server", "registerReaTools.js"), "utf8");
    assert.ok(kayitJs.includes("rea_pdb_indir"), "entegrasyonda gerçek kayıt yapıldı");
  });
});
