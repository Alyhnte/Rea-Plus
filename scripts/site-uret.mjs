// site-uret.mjs: Dalga K/2 — aranabilir tek statik site üretimi.
// Kaynaklar: README.md + docs/{TOOLS,EXAMPLES,ROADMAP}.md + CHANGELOG.md +
// docs/PROMPTS.md  ->  docs/site/*.html (index + 6 içerik sayfası).
// Sayılar TOOLS.md özetinden alınır (gerçek koşu; uydurma sayı YOK).
// Bağımlılık yok (yalnız node:fs/path/url), ağ/süreç/timer yok.
// Bilinmeyen göreli .md linkleri GitHub blob URL'ine yazılır (kırık link yok);
// sayfa-içi #çapalar github-slugger ile üretilen id'lere çözülür.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const kok = join(dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = join(kok, "docs", "site");
const BLOB = "https://github.com/Alyhnte/ReaPlus/blob/main/";

// Sayfa tanımı: çıktı + kaynak + başlık + açıklama (index nav'ı için).
const SAYFALAR = [
  { html: "readme.html", md: "README.md", baslik: "README", aciklama: "Kurulum, istemciler, özellikler, güvenlik" },
  { html: "tools.html", md: "docs/TOOLS.md", baslik: "Araç Referansı", aciklama: "Üretilmiş tam katalog (gerçek yüzey)" },
  { html: "examples.html", md: "docs/EXAMPLES.md", baslik: "Örnekler", aciklama: "Gerçek koşudan 5 senaryo" },
  { html: "roadmap.html", md: "docs/ROADMAP.md", baslik: "Yol Haritası", aciklama: "Öncelikli işler ve kapananlar" },
  { html: "changelog.html", md: "CHANGELOG.md", baslik: "Değişiklikler", aciklama: "Sürüm notları (Keep a Changelog)" },
  { html: "prompts.html", md: "docs/PROMPTS.md", baslik: "Prompt Kütüphanesi", aciklama: "10 hazır soru kalıbı" },
];

// Bilinen .md -> site sayfası eşleşmesi (kök ve docs/ önekleriyle).
const MD_ESLESME = new Map([
  ["README.md", "readme.html"],
  ["CHANGELOG.md", "changelog.html"],
  ["TOOLS.md", "tools.html"],
  ["EXAMPLES.md", "examples.html"],
  ["ROADMAP.md", "roadmap.html"],
  ["PROMPTS.md", "prompts.html"],
]);

function tabanAd(yol) {
  const s = yol.split("#")[0].split("?")[0];
  return s.split("/").pop();
}

// GitHub-vari başlık slug'ı ("## 🚀 Install" -> "-install").
// GitHub baş/son boşluğu kırpmaz: silinen emojinin yeri kesme işareti olur.
function slug(metin) {
  return metin
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/ /g, "-");
}

function kacis(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Göreli linki site-içi hedefe çevir; çevrilemeyen göreli -> GitHub blob.
function linkCevir(href) {
  if (/^(https?:|mailto:|data:)/.test(href) || href.startsWith("#")) return href;
  const [yol, ...capaParca] = href.split("#");
  const capa = capaParca.length ? `#${capaParca.join("#")}` : "";
  const ad = tabanAd(yol);
  if (ad.toLowerCase().endsWith(".md") && MD_ESLESME.has(ad)) return MD_ESLESME.get(ad) + capa;
  const temiz = yol.replace(/^\.\//, "").replace(/^\//, "");
  return `${BLOB}${temiz}${capa}`;
}

function satirIci(s) {
  // Kod aralıklılarını yer tutucuyla koru, sonra link/resim, sonra geri koy.
  const kodlar = [];
  let c = s.replace(/`([^`]+)`/g, (_, k) => {
    kodlar.push(k);
    return `\u0000${kodlar.length - 1}\u0000`;
  });
  c = kacis(c);
  c = c.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${kacis(linkCevir(src))}" alt="${alt}">`);
  c = c.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, metin, href) => `<a href="${kacis(linkCevir(href))}">${metin}</a>`);
  c = c.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  c = c.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${kacis(kodlar[Number(i)])}</code>`);
  return c;
}

function tabloSatiriMi(s) {
  return /^\s*\|.*\|\s*$/.test(s);
}

function ayiriciMi(s) {
  return /^\s*\|?[\s:|-]+\|?[\s:|-]*\s*$/.test(s) && s.includes("-");
}

// Minimal markdown -> HTML (başlık, kod bloğu, tablo, alıntı, liste, paragraf).
// Tüm başlık id'lerini `idKaydi`'na yazar (çapa doğrulaması için).
function mdCevir(md, idKaydi) {
  const satirlar = md.replace(/\r\n?/g, "\n").split("\n");
  const dis = [];
  let i = 0;
  const gorulen = new Map();
  const tekilId = (ham) => {
    let id = slug(ham) || "bolum";
    const n = gorulen.get(id) ?? 0;
    gorulen.set(id, n + 1);
    if (n > 0) id = `${id}-${n}`;
    idKaydi.push(id);
    return id;
  };
  while (i < satirlar.length) {
    const s = satirlar[i];
    // Kod bloğu.
    if (s.startsWith("```")) {
      const dil = s.slice(3).trim().replace(/[^a-z0-9+-]/gi, "");
      const ic = [];
      i++;
      while (i < satirlar.length && !satirlar[i].startsWith("```")) { ic.push(satirlar[i]); i++; }
      i++;
      dis.push(`<pre><code${dil ? ` class="language-${kacis(dil)}"` : ""}>${kacis(ic.join("\n"))}</code></pre>`);
      continue;
    }
    // Başlık.
    const b = s.match(/^(#{1,6})\s+(.*)$/);
    if (b) {
      const duz = b[2].replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*/g, "");
      dis.push(`<h${b[1].length} id="${tekilId(duz)}">${satirIci(b[2])}</h${b[1].length}>`);
      i++;
      continue;
    }
    // Tablo.
    if (tabloSatiriMi(s) && i + 1 < satirlar.length && ayiriciMi(satirlar[i + 1])) {
      const hucre = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((h) => h.trim());
      const bas = hucre(s);
      i += 2;
      const govde = [];
      while (i < satirlar.length && tabloSatiriMi(satirlar[i])) { govde.push(hucre(satirlar[i])); i++; }
      dis.push(`<table><thead><tr>${bas.map((h) => `<th>${satirIci(h)}</th>`).join("")}</tr></thead><tbody>${
        govde.map((r) => `<tr>${r.map((h) => `<td>${satirIci(h)}</td>`).join("")}</tr>`).join("")
      }</tbody></table>`);
      continue;
    }
    // Alıntı.
    if (/^\s*>/.test(s)) {
      const ic = [];
      while (i < satirlar.length && /^\s*>/.test(satirlar[i])) { ic.push(satirlar[i].replace(/^\s*>\s?/, "")); i++; }
      dis.push(`<blockquote>${satirIci(ic.join("\n"))}</blockquote>`);
      continue;
    }
    // Yatay çizgi.
    if (/^\s*(---+\s*|___+\s*|\*\*\*+\s*)$/.test(s)) { dis.push("<hr>"); i++; continue; }
    // Liste.
    const listeMi = (r) => /^\s*([-*+]\s+|\d+[.)]\s+)/.test(r);
    if (listeMi(s)) {
      const sirali = /^\s*\d+[.)]\s+/.test(s);
      const ogeler = [];
      while (i < satirlar.length && (listeMi(satirlar[i]) || /^\s+[^-\s\d]/.test(satirlar[i]))) {
        ogeler.push(satirlar[i].replace(/^\s*([-*+]\s+|\d+[.)]\s+)/, ""));
        i++;
      }
      const et = sirali ? "ol" : "ul";
      dis.push(`<${et}>${ogeler.map((o) => `<li>${satirIci(o)}</li>`).join("")}</${et}>`);
      continue;
    }
    // Boş satır.
    if (/^\s*$/.test(s)) { i++; continue; }
    // Paragraf (bitişik satırlar birleşir).
    const par = [s];
    i++;
    while (i < satirlar.length && !/^\s*$/.test(satirlar[i]) && !satirlar[i].startsWith("```") &&
      !/^(#{1,6})\s+/.test(satirlar[i]) && !tabloSatiriMi(satirlar[i]) && !/^\s*>/.test(satirlar[i]) && !listeMi(satirlar[i])) {
      par.push(satirlar[i]);
      i++;
    }
    dis.push(`<p>${satirIci(par.join("\n"))}</p>`);
  }
  return dis.join("\n");
}

function navEtkin(aktif) {
  const tum = [{ html: "index.html", baslik: "Ana Sayfa" }, ...SAYFALAR.map((s) => ({ html: s.html, baslik: s.baslik }))];
  return `<nav>${tum.map((s) => (s.html === aktif ? `<strong>${kacis(s.baslik)}</strong>` : `<a href="${s.html}">${kacis(s.baslik)}</a>`)).join(" · ")}</nav>`;
}

function sayfaSar(baslik, govde, aktif, ozetSatir) {
  return `<!DOCTYPE html>\n<html lang="tr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${kacis(baslik)} — ReaPlus Docs</title>\n<style>body{max-width:60rem;margin:2rem auto;padding:0 1rem;font-family:system-ui,sans-serif;line-height:1.6}nav{margin-bottom:1rem}pre{background:#f4f4f4;padding:1rem;overflow:auto}code{background:#f4f4f4}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:.4rem;text-align:left}.ozet{background:#eef;border:1px solid #ccd;padding:.6rem 1rem}</style>\n</head>\n<body>\n${navEtkin(aktif)}\n<p class="ozet">Yüzey özeti (gerçek koşu, TOOLS.md): ${ozetSatir}</p>\n<h1>${kacis(baslik)}</h1>\n${govde}\n</body>\n</html>\n`;
}

// TOOLS.md özetinden gerçek sayılar (docs-examples testiyle aynı regexler).
function ozetOku(toolsMd) {
  const al = (re, ad) => {
    const m = toolsMd.match(re);
    if (!m) throw new Error(`TOOLS.md özetinde ${ad} bulunamadı`);
    return Number(m[1]);
  };
  return {
    arac: al(/^- Toplam araç: (\d+)$/m, "araç"),
    sema: al(/^- outputSchema taşıyan araç: (\d+)$/m, "outputSchema"),
    ann: al(/^- annotations taşıyan araç: (\d+)$/m, "annotations"),
    res: al(/^- Toplam resource: (\d+)$/m, "resource"),
    prompt: al(/^- Toplam prompt: (\d+)$/m, "prompt"),
  };
}

function oku(yol) {
  try {
    return readFileSync(join(kok, yol), "utf8");
  } catch {
    throw new Error(`kaynak yok: ${yol}`);
  }
}

const toolsMd = oku("docs/TOOLS.md");
const ozet = ozetOku(toolsMd);
const ozetSatir = `${ozet.arac} araç · ${ozet.sema} outputSchema · ${ozet.ann} annotations · ${ozet.res} resource · ${ozet.prompt} prompt`;

mkdirSync(siteDir, { recursive: true });

// PROMPTS başlıklarını arama dizini için topla.
const promptsMd = oku("docs/PROMPTS.md");
const promptBasliklari = [...promptsMd.matchAll(/^## \d+\) (.+)$/gm)].map((m) => m[1]);

for (const s of SAYFALAR) {
  const md = s.md === "docs/TOOLS.md" ? toolsMd : oku(s.md);
  const idler = [];
  const govde = mdCevir(md, idler);
  writeFileSync(join(siteDir, s.html), sayfaSar(s.baslik, govde, s.html, ozetSatir));
}

// index.html: nav + özet + istemci-içi arama (sunucusuz, timersız).
const dizin = [
  ...SAYFALAR.map((s) => ({ sayfa: s.html, baslik: s.baslik, aciklama: s.aciklama })),
  ...promptBasliklari.map((b) => ({ sayfa: "prompts.html", baslik: b, aciklama: "hazır prompt" })),
];
const indexGovde = `<p>README + Araç Referansı + Örnekler + Yol Haritası + Değişiklikler + Prompt Kütüphanesi — tek statik site. Üretim: <code>node scripts/site-uret.mjs</code>.</p>
<label>Site içinde ara: <input type="search" id="arama" placeholder="örn. pcap, reçete, fuzz"></label>
<ul id="sonuclar">${dizin.map((d) => `<li data-baslik="${kacis(d.baslik.toLowerCase())} ${kacis(d.aciklama.toLowerCase())}"><a href="${d.sayfa}">${kacis(d.baslik)}</a> — ${kacis(d.aciklama)}</li>`).join("")}</ul>
<script>
const kutu = document.getElementById("arama");
const ogeler = [...document.querySelectorAll("#sonuclar li")];
kutu.addEventListener("input", () => {
  const q = kutu.value.toLocaleLowerCase("tr");
  for (const li of ogeler) li.hidden = q !== "" && !li.dataset.baslik.includes(q);
});
</script>`;
writeFileSync(join(siteDir, "index.html"), sayfaSar("Ana Sayfa", indexGovde, "index.html", ozetSatir));

console.log(`site üretildi: docs/site/ (${SAYFALAR.length + 1} sayfa) — ${ozetSatir}`);
