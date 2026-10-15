// hopper-bridge.test.mjs: Hopper gerçek-köprü araştırması (Dalga G/4).
// Araştırma bulgusu: Hopper Disassembler'ın komut-satırı/headless disassembly
// API'si YOKTUR. Resmi yüzey (https://www.hopperapp.com/) yalnız GUI + GUI-içi
// Python betikleri + SDK + yapay-zekâ MCP sunucusu belgeler; toplu (batch) CLI
// yoktur. Topluluk dışa-aktarım iş-akışı da Hopper İÇİNDE koşar (Scripts menüsü).
// Bu yüzden rea_hopper_istek "istek hazırlama" aracıdır: Hopper KOŞMAZ, alt
// süreç AÇMAZ, yalnız istek JSON'u yazar. Lisanslı Hopper yoksa (bu makinede
// yok: win32) yok dalı test edilir; kişisel yol/anahtar YOK (sahte yollar).
// Koş: önce `npm run build`, sonra `node --test tests/hopper-bridge.test.mjs`.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  HOPPER_HEADLESS_ARASTIRMA,
  HOPPER_EDINME,
  HopperProvider,
  hopperDurumu,
  rea_hopper_istek,
  rea_hopper_tara,
} from "../dist/rea-domains/hopper/HopperProvider.js";
import { reaToolMetadata } from "../dist/server/toolMetadata.js";

const TMP = mkdtempSync(join(tmpdir(), "rea-hopper-bridge-"));
// Taranabilir sahte hedef: 2 satırda 0x40100 izi var (sayi === 2 gerçeğe dayalı).
const SAHTE = join(TMP, "sahte.bin");
writeFileSync(SAHTE, "satir bir 0x401000 burada\ndiger satir\nson satir 0x401005 burada\n", "utf8");
// Sahte "hopper yürütülebilir" dosyası: VAR OLSA BİLE koşulmamalı (içerik metin).
const SAHTE_EXE = join(TMP, "sahte-hopper-bin");
writeFileSync(SAHTE_EXE, "sahte hopper (kosulmaz)", "utf8");
const YOK = join(TMP, "olmayan-hedef-9f3k2.bin");

// REA_HOPPER_PATH'i deterministik konuma zorla ve geri yükle.
function hopperEnv(path, fn) {
  const once = process.env.REA_HOPPER_PATH;
  if (path === undefined) delete process.env.REA_HOPPER_PATH;
  else process.env.REA_HOPPER_PATH = path;
  try {
    return fn();
  } finally {
    if (once === undefined) delete process.env.REA_HOPPER_PATH;
    else process.env.REA_HOPPER_PATH = once;
  }
}

describe("hopper-bridge arastirmasi (Dalga G/4)", () => {
  it("(a) arastirma bulgusu belgeli: headless CLI yok, komut+format bos, neden+kaynak dolu", () => {
    assert.equal(HOPPER_HEADLESS_ARASTIRMA.headless, false);
    assert.equal(HOPPER_HEADLESS_ARASTIRMA.komut, null);
    assert.equal(HOPPER_HEADLESS_ARASTIRMA.ciktiFormati, null);
    assert.match(HOPPER_HEADLESS_ARASTIRMA.neden, /headless/i);
    assert.match(HOPPER_HEADLESS_ARASTIRMA.neden, /GUI-içi Python/i);
    assert.ok(HOPPER_HEADLESS_ARASTIRMA.kaynaklar.includes("https://www.hopperapp.com/"));
  });

  it("(a) edinme bilgisi: site + platform + demo kisiti, anahtar/yol yok", () => {
    assert.match(HOPPER_EDINME.site, /hopperapp\.com/);
    assert.match(HOPPER_EDINME.platform, /macOS/);
    assert.match(HOPPER_EDINME.demo, /demo/i);
    assert.equal(HOPPER_EDINME.env, "REA_HOPPER_PATH");
  });

  it("(b) yok dali: durum tamam=false, istek unsupported + edinme + fallback, dosya uretilmez", () => {
    hopperEnv(undefined, () => {
      assert.equal(hopperDurumu().tamam, false);
      const s = rea_hopper_istek(SAHTE, ["0x401000"]);
      assert.equal(s.ok, false);
      assert.equal(s.code, "capability_unsupported");
      assert.match(s.neden, /hopperapp\.com/);
      assert.match(s.neden, /fallback/i);
      assert.ok(!("istekDosyasi" in s));
    });
  });

  it("(b) sahte hopper sureci KOSULMAZ: mevcut sahte exe yolu da unsupported duser", () => {
    const onceki = process.env.REA_HOPPER_PATH;
    hopperEnv(SAHTE_EXE, () => {
      const durum = hopperDurumu();
      assert.equal(durum.tamam, false);
      const s = rea_hopper_istek(SAHTE, ["0x401000"]);
      assert.equal(s.ok, false);
      assert.equal(s.code, "capability_unsupported");
      assert.ok(!("istekDosyasi" in s));
    });
    assert.equal(process.env.REA_HOPPER_PATH, onceki);
  });

  it("(b) provider kapilari: open reddeder, close asili kalmaz (no-op)", async () => {
    const p = new HopperProvider();
    assert.equal(p.id, "hopper");
    await assert.rejects(() => p.open("oturum-1", SAHTE), /capability_unsupported/);
    await p.close("oturum-1");
  });

  it("(c) istek JSON semasi korunur: outputSchema alanlari birebir", () => {
    const meta = reaToolMetadata("rea_hopper_istek");
    assert.ok(meta?.outputSchema, "rea_hopper_istek outputSchema almali");
    const alanlar = Object.keys(meta.outputSchema.shape).sort();
    assert.deepEqual(alanlar, ["adresler", "arac", "hedef", "hopper", "istekDosyasi", "ok"]);
    const ornek = meta.outputSchema.parse({
      ok: true, arac: "rea_hopper_istek", hedef: SAHTE,
      adresler: ["0x401000"], istekDosyasi: join(TMP, "istek.json"), hopper: SAHTE_EXE,
    });
    assert.equal(ornek.adresler.length, 1);
  });

  it("(c) tara offline calisir: bilinen dosyada sayi gercek degere esit", () => {
    const s = rea_hopper_tara(SAHTE, "0x40100");
    assert.equal(s.ok, true);
    assert.equal(s.sayi, 2);
    assert.equal(s.eslesmeler.length, 2);
  });

  it("hedef yoksa unsupported (throw yok)", () => {
    const s = rea_hopper_istek(YOK, ["0x401000"]);
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
});
