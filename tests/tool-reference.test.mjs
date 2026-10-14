// tool-reference.test.mjs: docs/TOOLS.md'nin derlenmis sunucunun gercek MCP
// yuzeyinden SAPMADIGINI dogrular. Uretim fonksiyonlari
// (scripts/generate-tool-reference.mjs) kullanilir: yuzey bir kez stdio ile
// toplanir, dokumanla ad kumeleri + toplamlar kiyaslanir. Tam sema bayt
// kiyasi yapilmaz (kirilgan olur); ad kumeleri ve toplamlar zorunludur.
// Kos: once `npm run build`, sonra `node --test tests/tool-reference.test.mjs`.
// Build yoksa test sessizce atlamaz: acik mesajla DUSER.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectSurface,
  renderReference,
  parseReference,
  checkReference,
  BUILD_REQUIRED_MESSAGE,
} from "../scripts/generate-tool-reference.mjs";

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const serverYolu = join(kok, "dist", "server.js");
const dokumanYolu = join(kok, "docs", "TOOLS.md");

const sirala = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
let yuzey;
let dokuman;
let ayristirilmis;

before(async () => {
  assert.ok(existsSync(serverYolu), BUILD_REQUIRED_MESSAGE);
  assert.ok(
    existsSync(dokumanYolu),
    "docs/TOOLS.md bulunamadi: once `node scripts/generate-tool-reference.mjs` calistirin.",
  );
  yuzey = await collectSurface();
  dokuman = readFileSync(dokumanYolu, "utf8");
  ayristirilmis = parseReference(dokuman);
});

describe("tool-reference: docs/TOOLS.md gercek yuzeyle eslesir", () => {
  it("checkReference hicbir sapma bildirmez", () => {
    const { ok, problemler } = checkReference(dokuman, yuzey);
    assert.equal(ok, true, problemler.join("\n"));
    assert.deepEqual(problemler, []);
  });

  it("arac ad kumeleri birebir ayni ve benzersizdir", () => {
    const gercek = yuzey.tools.map((t) => t.name).sort(sirala);
    assert.deepEqual([...ayristirilmis.tools].sort(sirala), gercek);
    assert.equal(new Set(ayristirilmis.tools).size, ayristirilmis.tools.length, "dokumanda yinelenen arac adi");
    assert.equal(new Set(gercek).size, gercek.length, "gercek yuzeyde yinelenen arac adi");
  });

  it("resource URI ve prompt ad kumeleri birebir aynidir", () => {
    assert.deepEqual(
      [...ayristirilmis.resources].sort(sirala),
      yuzey.resources.map((r) => r.uri).sort(sirala),
    );
    assert.deepEqual(
      [...ayristirilmis.prompts].sort(sirala),
      yuzey.prompts.map((p) => p.name).sort(sirala),
    );
  });

  it("ilan edilen toplamlar gercek sayilarla ve ad sayilariyla eslesir", () => {
    assert.equal(ayristirilmis.totals.tools, yuzey.tools.length);
    assert.equal(ayristirilmis.totals.resources, yuzey.resources.length);
    assert.equal(ayristirilmis.totals.prompts, yuzey.prompts.length);
    assert.equal(ayristirilmis.totals.tools, ayristirilmis.tools.length);
    assert.equal(ayristirilmis.totals.resources, ayristirilmis.resources.length);
    assert.equal(ayristirilmis.totals.prompts, ayristirilmis.prompts.length);
  });

  it("arac basliklari deterministik siradadir ve render tekrarlanabilirdir", () => {
    assert.deepEqual(ayristirilmis.tools, [...ayristirilmis.tools].sort(sirala), "arac basliklari sirali olmali");
    const a = renderReference(yuzey);
    const b = renderReference(yuzey);
    assert.equal(a, b, "renderReference ayni yuzeyden ayni metni uretmeli");
    // Yeniden uretilmis metnin ad kumeleri de committed dokumanla ayni olmali.
    assert.deepEqual(parseReference(a).tools, ayristirilmis.tools);
    assert.deepEqual(parseReference(a).resources, ayristirilmis.resources);
    assert.deepEqual(parseReference(a).prompts, ayristirilmis.prompts);
  });

  it("her arac bolumu girdi/outputSchema/annotations satiri tasir", () => {
    for (const t of yuzey.tools) {
      assert.ok(dokuman.includes(`### \`${t.name}\``), `${t.name} basligi yok`);
    }
    const girdiSayisi = (dokuman.match(/^- Girdi alanları/gm) ?? []).length;
    const outSayisi = (dokuman.match(/^- outputSchema: (var|yok)/gm) ?? []).length;
    const annSayisi = (dokuman.match(/^- annotations: (var|yok)/gm) ?? []).length;
    assert.equal(girdiSayisi, yuzey.tools.length);
    assert.equal(outSayisi, yuzey.tools.length);
    assert.equal(annSayisi, yuzey.tools.length);
    // Var/yok dagilimi gercek yuzeyle ayni olmali.
    const gercekOut = yuzey.tools.filter((t) => t.outputSchema && typeof t.outputSchema === "object").length;
    const gercekAnn = yuzey.tools.filter(
      (t) => t.annotations && typeof t.annotations === "object" && Object.keys(t.annotations).length,
    ).length;
    assert.equal((dokuman.match(/^- outputSchema: var/gm) ?? []).length, gercekOut);
    assert.equal((dokuman.match(/^- annotations: var/gm) ?? []).length, gercekAnn);
  });

  it("dokuman kisisel yol veya ev dizini sizdirmaz", () => {
    assert.ok(!dokuman.includes(homedir()), "ev dizini sizmamali");
    assert.ok(!dokuman.includes(kok), "proje koku sizmamali");
    assert.ok(!dokuman.includes(":\\Users\\"), "kullanici yolu sizmamali");
    assert.ok(!dokuman.includes(":/Users/"), "kullanici yolu (/) sizmamali");
  });

  it("sapma enjekte edilirse checkReference yakalar (negatif kontrol)", () => {
    const ilk = ayristirilmis.tools[0];
    const bozuk = dokuman.replace(`### \`${ilk}\``, "### `__olmayan_arac__`");
    const { ok, problemler } = checkReference(bozuk, yuzey);
    assert.equal(ok, false);
    assert.ok(problemler.some((p) => p.includes(ilk)), "eksik arac raporlanmali");
    assert.ok(problemler.some((p) => p.includes("__olmayan_arac__")), "fazla arac raporlanmali");
    const toplamBozuk = dokuman.replace(/^- Toplam araç: \d+$/m, "- Toplam araç: 999");
    assert.equal(checkReference(toplamBozuk, yuzey).ok, false, "yanlis toplam yakalanmali");
  });
});
