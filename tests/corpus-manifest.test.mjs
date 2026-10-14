// tests/corpus-manifest.test.mjs: golden korpus kaynak/lisans/hash manifest kapısı (offline).
// Koş: node --test tests/corpus-manifest.test.mjs
// Kapsam: (a) tüm fixture'lar hash tutar, (b) bozuk hash dosya adıyla raporlanır,
// (c) manifest-dışı dosya raporlanır. Negatif testler tests/corpus'a DOKUNMAZ;
// geçici dizinde sahte fixture ile koşar.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  denetle,
  manifestiOku,
} from "../scripts/verify-corpus.mjs";

// Kök dizini test dosyasının konumundan türet.
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
// Korpus dizini ile manifest yolu.
const corpusDir = join(kok, "tests", "corpus");
const manifestYol = join(corpusDir, "HASHES.json");
const dogrulamaBetik = join(kok, "scripts", "verify-corpus.mjs");

// Geçici denetleme alanı kurar: verilen dosyaları yazar, mini manifest üretir.
// Gerçek tests/corpus dizinine yazılmaz.
function geciciAlan(dosyalar, manifestEk = {}) {
  const alan = mkdtempSync(join(tmpdir(), "korpus-manifest-"));
  for (const [ad, icerik] of Object.entries(dosyalar)) writeFileSync(join(alan, ad), icerik);
  const manifest = { surum: 1, dosyalar: { ...manifestEk } };
  const manifestDosya = join(alan, "HASHES.json");
  writeFileSync(manifestDosya, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return { alan, manifestDosya };
}

describe("corpus manifest", () => {
  // (a) Manifestteki her dosya diskte var ve hash'i tutuyor.
  it("(a) tüm mevcut fixture'lar hash tutar", () => {
    const manifest = manifestiOku(manifestYol);
    const sonuc = denetle(corpusDir, manifest);
    assert.deepEqual(sonuc.eksik, [], `eksik fixture: ${sonuc.eksik.join(", ")}`);
    assert.deepEqual(
      sonuc.uyusmaz.map((u) => u.dosya),
      [],
      `hash uyuşmazlığı: ${JSON.stringify(sonuc.uyusmaz)}`,
    );
    assert.deepEqual(sonuc.fazladan, [], `manifest-dışı dosya: ${sonuc.fazladan.join(", ")}`);
  });

  // (a2) Her manifest girdisinde kaynak + lisans kaydı var; uydurma lisans yok.
  it("(a) her girdide kaynak/lisans alanı dolu", () => {
    const manifest = manifestiOku(manifestYol);
    const adlar = Object.keys(manifest.dosyalar);
    assert.ok(adlar.length > 0, "manifest boş olmamalı");
    for (const ad of adlar) {
      const girdi = manifest.dosyalar[ad];
      assert.equal(typeof girdi.sha256, "string", `${ad}: sha256 yok`);
      assert.match(girdi.sha256, /^[0-9a-f]{64}$/, `${ad}: sha256 biçimi bozuk`);
      assert.equal(typeof girdi.kaynak, "string", `${ad}: kaynak yok`);
      assert.ok(girdi.kaynak.trim().length > 0, `${ad}: kaynak boş`);
      assert.equal(typeof girdi.lisans, "string", `${ad}: lisans yok`);
      assert.ok(girdi.lisans.trim().length > 0, `${ad}: lisans boş`);
    }
  });

  // (b) Bozuk hash: dosya adıyla raporlanır, doğrulayıcı sıfır-dışı çıkar.
  it("(b) bozuk hash açık hatayla raporlanır", () => {
    const { alan, manifestDosya } = geciciAlan(
      { "sahte.bin": "gerçek içerik" },
      { "sahte.bin": { sha256: "0".repeat(64), kaynak: "test", lisans: "bilinmiyor" } },
    );
    try {
      const manifest = manifestiOku(manifestDosya);
      const sonuc = denetle(alan, manifest);
      assert.deepEqual(
        sonuc.uyusmaz.map((u) => u.dosya),
        ["sahte.bin"],
        "bozuk dosya adıyla raporlanmalı",
      );
      let cikti = "";
      let kod = 0;
      try {
        cikti = execFileSync(process.execPath, [dogrulamaBetik, "--corpus", alan, "--manifest", manifestDosya], {
          cwd: kok,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (e) {
        kod = e.status ?? -1;
        cikti = String(e.stdout ?? "") + String(e.stderr ?? "");
      }
      assert.notEqual(kod, 0, "bozuk hash'te exit kodu sıfır-dışı olmalı");
      assert.ok(cikti.includes("sahte.bin"), "rapor bozuk dosyanın adını içermeli");
    } finally {
      rmSync(alan, { recursive: true, force: true });
    }
  });

  // (c) Manifestte olmayan dosya: raporda adı geçer, doğrulayıcı sıfır-dışı çıkar.
  it("(c) manifest-dışı dosya raporlanır", () => {
    const { alan, manifestDosya } = geciciAlan(
      { "kayitli.bin": "kayıtlı", "kayitsiz.bin": "kayıtsız" },
      { "kayitli.bin": { sha256: "0".repeat(64), kaynak: "test", lisans: "bilinmiyor" } },
    );
    // kayıtlı dosyanın manifestteki hash'ini gerçek değere çek ki yalnız fazladan kalsın.
    const gercek = denetle(alan, manifestiOku(manifestDosya)).uyusmaz.find((u) => u.dosya === "kayitli.bin");
    assert.ok(gercek, "kurulum: kayitli.bin uyuşmaz listesinde olmalı");
    const manifest = manifestiOku(manifestDosya);
    manifest.dosyalar["kayitli.bin"].sha256 = gercek.gercek;
    const sonuc = denetle(alan, manifest);
    assert.deepEqual(sonuc.fazladan, ["kayitsiz.bin"], "kayıtsız dosya adıyla raporlanmalı");
    let kod = 0;
    let cikti = "";
    const guncelManifest = join(alan, "HASHES.json");
    writeFileSync(guncelManifest, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    try {
      cikti = execFileSync(process.execPath, [dogrulamaBetik, "--corpus", alan, "--manifest", guncelManifest], {
        cwd: kok,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      kod = e.status ?? -1;
      cikti = String(e.stdout ?? "") + String(e.stderr ?? "");
    }
    assert.notEqual(kod, 0, "manifest-dışı dosyada exit kodu sıfır-dışı olmalı");
    assert.ok(cikti.includes("kayitsiz.bin"), "rapor kayıtsız dosyanın adını içermeli");
    rmSync(alan, { recursive: true, force: true });
  });
});
