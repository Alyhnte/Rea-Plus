// schema-budget.test.mjs: ReaPlus şema bütçeleri (Dalga K/1).
// HEDEF: "13KB şema" iddiası ölçülür ve zorlanır: tools/list yanıt baytı +
// tüm outputSchema JSON baytı bütçeli. Bütçe aşımı testi kırar (sessiz şişme biter).
// Koş: npm run build sonrası `node --test tests/schema-budget.test.mjs` (veya npm test).
//
// ÖLÇÜM (2026-10-16, bu makine: Node v24.19.0, win32 x64, dalga-k/semabutce):
//   araç=191, şemalı=191, şemasız=4 (rea_best_motor, rea_fallback,
//   rea_process_compare, rea_pwn_elf_layout — nesne dönmedikleri için şemasız),
//   listeBayt=172647 (~168.6KB), şemaToplam=89902 (~87.8KB),
//   girdiToplam=44370, ortalama=480.8 bayt/araç, şemalı-ort=491.3 bayt.
//   Tekrar ölçümde birebir aynı (tek sayfa, sayfalama yok, bayt deterministik).
//
// BÜTÇELER (keyfi değil; ölçümün üstüne cömert pay — bayt deterministik, CI flake'i yok):
//   LISTE_BUTCE = 200*1024 = 204800  (ölçüm 172647 → %18.6 pay; ~34 yeni araç payı)
//   SEMA_BUTCE  = 110*1024 = 112640  (ölçüm 89902 → %25.3 pay; ~22KB yeni şema payı)
//   ORT_BUTCE   = 600 bayt            (ölçüm 480.8 → %24.8 pay)
// YÖNTEM (flake karşıtı): before() bir kez ölçer (süreç-içi InMemoryTransport,
// timersız); it() blokları yalnız assert eder. Süreç after()'da değil, ölçüm
// sonunda kapatılır (ölçü fonksiyonu açtığını kapatır); asılı timer/süreç yok.
// Gerçek kullanıcı dizinine/ağa yazma yok (saf listelemedir, audit log kapalı).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { olcSemabutce } from "../scripts/olcut-semabutce.mjs";

// Bütçeler: üstteki ÖLÇÜM bloğuna bağlı; sayı değişirse yorum da güncellenir.
const BUTCE = {
  listeBayt: 200 * 1024, // 204800
  semaToplamBayt: 110 * 1024, // 112640
  ortalamaBayt: 600,
};

describe("şema bütçeleri (saf, InMemory tools/list)", () => {
  let olcum;

  before(async () => {
    olcum = await olcSemabutce();
    console.log(
      `SEMA medyan-değil-tek-ölçüm (deterministik): araç=${olcum.aracSayisi} ` +
        `liste=${olcum.listeBayt}B sema=${olcum.semaToplamBayt}B ` +
        `ort=${olcum.ortalamaBayt.toFixed(1)}B/araç`,
    );
  });

  it("(a) tools/list yanıt baytı bütçe altında", () => {
    assert.equal(olcum.aracSayisi, 191, "araç sayısı 191 olmalı (gerçek değer)");
    assert.equal(olcum.semaSayisi, 187, "şemalı araç 187 olmalı (gerçek değer)");
    assert.ok(
      olcum.listeBayt < BUTCE.listeBayt,
      `tools/list ${olcum.listeBayt}B bütçe ${BUTCE.listeBayt}B üstünde`,
    );
  });

  it("(b) outputSchema toplam baytı bütçe altında", () => {
    assert.ok(
      olcum.semaToplamBayt < BUTCE.semaToplamBayt,
      `şema toplam ${olcum.semaToplamBayt}B bütçe ${BUTCE.semaToplamBayt}B üstünde`,
    );
  });

  it("(c) araç başına ortalama şema baytı bütçe altında", () => {
    assert.ok(
      olcum.ortalamaBayt < BUTCE.ortalamaBayt,
      `ortalama ${olcum.ortalamaBayt.toFixed(1)}B/araç bütçe ${BUTCE.ortalamaBayt}B üstünde`,
    );
  });
});
