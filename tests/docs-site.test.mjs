// docs-site.test.mjs: Dalga K/2 — statik docs sitesi + prompt kütüphanesi doğrulaması.
// Üretim: `node scripts/site-uret.mjs` (docs/site/*.html). Bu test üretimi
// doğrular, kendisi üretmez: site yoksa açık mesajla DÜŞER (önce kırmızı).
// Koş: `node tests/docs-site.test.mjs` (tek dosya) veya `npm test` (tam küme).
// Tamamen offline + salt okunur: yalnız fs okuma, ağ/timer/süreç yok.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const siteDir = join(kok, "docs", "site");
const uretici = join(kok, "scripts", "site-uret.mjs");
const promptsMd = join(kok, "docs", "PROMPTS.md");
const toolsMd = join(kok, "docs", "TOOLS.md");

// Sitede olması beklenen sayfalar (üretici + kaynak eşleşmesi).
const SAYFALAR = [
  "index.html",
  "readme.html",
  "tools.html",
  "examples.html",
  "roadmap.html",
  "changelog.html",
  "prompts.html",
];

// PROMPTS.md'de geçmesi zorunlu gerçek araç/iz adları (TOOLS.md'de doğrulanmış
// adlar + repo-içi gerçek dosyalar; uydurma ad YOK).
const GEREKLI_TERIMLER = [
  "rea_investigate",
  "rea_jadx_manifest",
  "rea_behavior_timeline",
  "rea_scan_repo",
  "rea_pdb_yolu",
  "rea_bindiff_karsilastir",
  "rea_pcap_oku",
  "rea_android_dinamik_recete",
  "fuzz-parsers",
  "perf-budget",
];

let ozet; // { arac, sema, ann, res, prompt } — TOOLS.md özetinden (gerçek koşu).
let sayfalar = new Map(); // ad -> html metni

// TOOLS.md özetini parse et (üretilmiş referans = gerçek yüzey).
function ozetOku(md) {
  const al = (re) => {
    const m = md.match(re);
    assert.ok(m, `${re} TOOLS.md özetinde bulunamadı`);
    return Number(m[1]);
  };
  return {
    arac: al(/^- Toplam araç: (\d+)$/m),
    sema: al(/^- outputSchema taşıyan araç: (\d+)$/m),
    ann: al(/^- annotations taşıyan araç: (\d+)$/m),
    res: al(/^- Toplam resource: (\d+)$/m),
    prompt: al(/^- Toplam prompt: (\d+)$/m),
  };
}

before(() => {
  assert.ok(existsSync(uretici), "scripts/site-uret.mjs yok (üretim script'le olur)");
  assert.ok(existsSync(toolsMd), "docs/TOOLS.md yok");
  ozet = ozetOku(readFileSync(toolsMd, "utf8"));
  assert.ok(
    existsSync(siteDir),
    `docs/site/ yok: önce \`node scripts/site-uret.mjs\` çalıştırın (test üretmez, doğrular)`,
  );
  assert.ok(existsSync(promptsMd), "docs/PROMPTS.md yok (10 promptluk kütüphane)");
  for (const s of SAYFALAR) {
    const yol = join(siteDir, s);
    assert.ok(existsSync(yol), `${s} yok: üretici tüm sayfaları yazmalı`);
    sayfalar.set(s, readFileSync(yol, "utf8"));
  }
});

describe("(a) site üretilir, tüm sayfalar var", () => {
  it("beklenen 7 sayfa dolu HTML'dir", () => {
    assert.deepEqual(readdirSync(siteDir).filter((f) => f.endsWith(".html")).sort(), [...SAYFALAR].sort());
    for (const [ad, html] of sayfalar) {
      assert.ok(html.length > 500, `${ad} çok kısa (${html.length} bayt)`);
      assert.ok(html.includes("<html"), `${ad} <html> içermeli`);
      assert.ok(html.includes("</html>"), `${ad} kapanmalı`);
    }
  });

  it("her sayfada gezinme + arama var", () => {
    const baslik = {
      "index.html": "Ana Sayfa",
      "readme.html": "README",
      "tools.html": "Araç Referansı",
      "examples.html": "Örnekler",
      "roadmap.html": "Yol Haritası",
      "changelog.html": "Değişiklikler",
      "prompts.html": "Prompt Kütüphanesi",
    };
    for (const [ad, html] of sayfalar) {
      for (const hedef of SAYFALAR) {
        // Diğer sayfalar link, aktif sayfa vurgu (<strong>) olarak nav'dadır.
        const link = html.includes(`href="${hedef}"`);
        const vurgu = ad === hedef && html.includes(`<strong>${baslik[hedef]}</strong>`);
        assert.ok(link || vurgu, `${ad} nav'da ${hedef} olmalı`);
      }
    }
    const index = sayfalar.get("index.html");
    assert.ok(index.includes('type="search"'), "index.html aranabilir olmalı (search input)");
  });
});

describe("(b) kırık link yok", () => {
  // Sitedeki her göreli href ya site-içi dosyaya ya da sayfa-içi çapa çözülmeli.
  function idleriTopla(html) {
    const idler = new Set();
    for (const m of html.matchAll(/id="([^"]+)"/g)) idler.add(m[1]);
    return idler;
  }

  it("göreli dosya linkleri mevcut dosyaya, çapalar mevcut id'ye işaret eder", () => {
    const sorunlar = [];
    for (const [ad, html] of sayfalar) {
      const idler = idleriTopla(html);
      for (const m of html.matchAll(/href="([^"]+)"/g)) {
        const hedef = m[1];
        if (/^(https?:|mailto:|data:)/.test(hedef)) continue; // dış link: offline denetlenmez
        const [yol, capa] = hedef.split("#");
        if (yol === "" || yol === undefined) {
          if (capa && !idler.has(decodeURIComponent(capa))) sorunlar.push(`${ad}: #${capa} id yok`);
          continue;
        }
        if (yol.startsWith("/") || yol.includes("..") || /^[a-zA-Z]:/.test(yol)) {
          sorunlar.push(`${ad}: site dışına kaçan link ${hedef}`);
          continue;
        }
        const tam = resolve(siteDir, yol);
        if (!tam.startsWith(siteDir) || !existsSync(tam)) {
          sorunlar.push(`${ad}: kırık dosya linki ${hedef}`);
          continue;
        }
        if (capa) {
          const h = readFileSync(tam, "utf8");
          if (!idleriTopla(h).has(decodeURIComponent(capa))) sorunlar.push(`${ad}: ${hedef} çapası yok`);
        }
      }
    }
    assert.deepEqual(sorunlar, [], `kırık linkler:\n${sorunlar.join("\n")}`);
  });
});

describe("(c) sayılar TOOLS.md ile eşleşir", () => {
  it("içerik sayfaları gerçek yüzey özetini taşır", () => {
    const beklenen = [
      `${ozet.arac} araç`,
      `${ozet.sema} outputSchema`,
      `${ozet.ann} annotations`,
      `${ozet.res} resource`,
      `${ozet.prompt} prompt`,
    ];
    for (const ad of ["index.html", "tools.html", "examples.html", "readme.html"]) {
      const html = sayfalar.get(ad);
      for (const b of beklenen) assert.ok(html.includes(b), `${ad} "${b}" içermeli`);
    }
  });
});

describe("(d) PROMPTS.md 10 prompt içerir, her birinde örnek çağrı var", () => {
  it("10 numaralı prompt bölümü, her birinde amaç + örnek çağrı + beklenen çıktı", () => {
    const md = readFileSync(promptsMd, "utf8");
    const basliklar = md.match(/^## \d+\) .+$/gm) ?? [];
    assert.equal(basliklar.length, 10, `10 prompt başlığı olmalı, bulunan: ${basliklar.length}`);
    const bolumler = md.split(/^## \d+\) .+$/m).slice(1);
    assert.equal(bolumler.length, 10);
    bolumler.forEach((b, i) => {
      assert.ok(b.includes("Amaç"), `prompt ${i + 1}: Amaç yok`);
      assert.ok(b.includes("Örnek çağrı"), `prompt ${i + 1}: Örnek çağrı yok`);
      assert.ok(b.includes("Beklenen çıktı"), `prompt ${i + 1}: Beklenen çıktı yok`);
      assert.ok(/```(bash|json|text|console)/.test(b), `prompt ${i + 1}: örnek çağrı kod bloğu yok`);
    });
    for (const t of GEREKLI_TERIMLER) {
      assert.ok(md.includes(t), `PROMPTS.md gerçek adı içermeli: ${t}`);
    }
  });

  it("prompts.html kütüphaneyi yansıtır", () => {
    const html = sayfalar.get("prompts.html");
    for (const t of GEREKLI_TERIMLER) assert.ok(html.includes(t), `prompts.html ${t} içermeli`);
  });
});

describe("hijyen: kişisel yol/sır sızıntısı yok", () => {
  it("site + PROMPTS.md ev dizini ve mutlak repo yolu içermez", () => {
    const ev = homedir();
    const hedefler = [...sayfalar.values(), readFileSync(promptsMd, "utf8")];
    hedefler.forEach((h, i) => {
      assert.ok(!h.includes(":\\Users\\"), `hedef ${i}: kullanıcı yolu sızmamalı`);
      assert.ok(!h.includes(":/Users/"), `hedef ${i}: kullanıcı yolu (/) sızmamalı`);
      assert.ok(!h.includes("AppData"), `hedef ${i}: profil dizini sızmamalı`);
      assert.ok(!h.includes(ev), `hedef ${i}: ev dizini sızmamalı`);
    });
  });
});
