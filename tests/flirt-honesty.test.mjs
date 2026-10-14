// flirt-honesty.test.mjs: rea_ida_flirt dürüstlüğü (Dalga B/2).
// String taraması "FLIRT" diye sunulamaz: açıklama yöntemi dürüst söyler,
// sonuç zarfı method + güven taşır, emin olunmayan eşleşme "bilinmiyor" olur.
// Koş: npm run build sonrası `node tests/flirt-honesty.test.mjs` (canlı IDA gerekmez).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_ida_flirt } from "../dist/rea-domains/ida/IdaProvider.js";
import { collectSurface } from "../scripts/generate-tool-reference.mjs";

const TMP = mkdtempSync(join(tmpdir(), "rea-flirt-honest-"));
const DOLU = join(TMP, "dolu.bin");
writeFileSync(DOLU, "MSVC derlendi\nGCC: (GNU) 11.2.0\n", "utf8");
const ZAYIF = join(TMP, "zayif.bin");
writeFileSync(ZAYIF, "siradan metin, derleyici izi yok\n", "utf8");
const TEKIL = join(TMP, "tekil.bin");
writeFileSync(TEKIL, "burada bir kez RTTI geciyor\n", "utf8");

let aciklama = "";
before(async () => {
  const yuzey = await collectSurface();
  const arac = yuzey.tools.find((t) => t.name === "rea_ida_flirt");
  assert.ok(arac, "rea_ida_flirt yüzeyde olmalı (ad değişmedi)");
  aciklama = arac.description ?? "";
});

describe("flirt dürüstlüğü", () => {
  it("(a) açıklama FLIRT iddiası taşımaz, yöntemi söyler", () => {
    // "gerçek FLIRT ... değil" türü feragat cümlesine izin ver, kalanında FLIRT geçmemeli.
    const kalan = aciklama.replace(/gerçek FLIRT[^.]*değil/i, "");
    assert.ok(!/FLIRT/i.test(kalan), `açıklama FLIRT iddiası taşıyor: ${aciklama}`);
    assert.match(aciklama, /string/i, "açıklama string-tabanlı yöntemi söylemeli");
  });

  it("(b) sonuçta method alanı string-heuristic", () => {
    const s = rea_ida_flirt(DOLU);
    assert.equal(s.ok, true);
    assert.equal(s.method, "string-heuristic");
  });

  it("(c) düşük güvenli eşleşme bilinmiyor döner", () => {
    const bos = rea_ida_flirt(ZAYIF);
    assert.equal(bos.ok, true);
    assert.equal(bos.kutuphane, "bilinmiyor");
    assert.equal(bos.guven, 0);
    const tek = rea_ida_flirt(TEKIL);
    assert.equal(tek.ok, true);
    assert.equal(tek.kutuphane, "bilinmiyor");
    assert.ok(tek.guven < 0.5, "tekil zayıf sinyal düşük güvenli olmalı");
  });

  it("(d) IDA yoksa dürüst dal", () => {
    const s = rea_ida_flirt(DOLU, { REA_IDA_PATH: "C:\\yok\\idat64.exe" });
    assert.equal(s.ok, true);
    assert.equal(s.method, "string-heuristic");
    assert.equal(s.idaMevcut, false);
    assert.match(s.not, /IDA/i, "IDA yokluğu dürüstçe belirtilmeli");
  });
});
