// rea-domains/wasm-evm: Go + pwn iskeleti
// Go modül/version metin taraması; ELF layout için pwntools/python gerekir.
import { existsSync, readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
export type ReaGpResult =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string };

function needPython(): ReaGpResult | null {
  // Env kontrolü: pwntools python'u yoksa ELF detayı çıkmaz.
  if (typeof process !== "undefined" && !process.env.REA_PYTHON_BIN) {
    return { ok: false, code: "capability_unsupported", reason: "python yok (REA_PYTHON_BIN)" };
  }
  return null;
}

// Go.mod özeti: module + go directive satırlarını çeker.
export function rea_go_module(gomod: string): ReaGpResult {
  const mod = gomod.match(/^module\s+(\S+)/m)?.[1];
  const ver = gomod.match(/^go\s+(\S+)/m)?.[1];
  if (!mod) return { ok: false, code: "capability_unsupported", reason: "go.mod parse edilemedi" };
  return { ok: true, tool: "rea_go_module", summary: `${mod} (go ${ver ?? "?"})`, details: { mod, ver } };
}

// Go build version dizesi: "go1.22..." kalıbını arar.
export function rea_go_version(binHead: string): ReaGpResult {
  const m = binHead.match(/go1\.\d+(\.\d+)?/);
  if (!m) return { ok: false, code: "capability_unsupported", reason: "go version izi yok" };
  return { ok: true, tool: "rea_go_version", summary: m[0], details: { version: m[0] } };
}

// ELF layout: gerçek pwntools çağrısı henüz uygulanmadı; sahte "kuyrukta" ok'su yerine dürüst kapı.
export function rea_pwn_elf_layout(elfPath: string): ReaGpResult {
  const gate = needPython();
  if (gate) return gate;
  if (!elfPath) return { ok: false, code: "capability_unsupported", reason: "elf yolu boş" };
  return { ok: false, code: "capability_unsupported", reason: "pwntools ELF layout henüz uygulanmadı (iskelet); sahte özet dönülmez" };
}

// ROP adayı iskeleti: metin içinde "gadget:" satırlarını sayar.
export function rea_pwn_gadgets(hintText: string): ReaGpResult {
  const n = hintText.split("\n").filter((l) => l.includes("gadget:")).length;
  if (!n) return { ok: false, code: "capability_unsupported", reason: "gadget ipucu yok" };
  return { ok: true, tool: "rea_pwn_gadgets", summary: `${n} gadget ipucu`, details: { n } };
}

// Go pclntab izi: buildid + pclnametab + fonksiyon tahmini (tamamen offline).
export function rea_go_pclntab(yol: string): ReaGpResult {
  // Yoksa erken kapı: dosya erişimi şart.
  if (!yol || !existsSync(yol)) return { ok: false, code: "capability_unsupported", reason: "dosya yok" };
  // Ham baytı latin1 metne çevir: Go izleri ASCII'dir.
  const metin = readFileSync(yol).toString("latin1");
  // Buildid kalıbı: go1.21 / go1.22.1 gibi.
  const buildid = metin.match(/go1\.\d+(\.\d+)?/)?.[0];
  // pclntab/funcnametab bayrakları: Go runtime tablo adları.
  const pclntab = metin.includes("gopclntab") || metin.includes("pclntab");
  const pclnametab = metin.includes("pclnametab") || metin.includes("funcnametab");
  // Üçü de yoksa Go izi yoktur.
  if (!buildid && !pclntab && !pclnametab) return { ok: false, code: "capability_unsupported", reason: "go pclntab izi yok" };
  // Fonksiyon tahmini: .func sembolleri + .go: satırları + func sayımı.
  const funcs = metin.match(/[A-Za-z0-9_/.@-]+\.func[A-Za-z0-9_.]*/g) ?? [];
  const gosat = metin.match(/\.go:\d+/g) ?? [];
  const tahmin = Math.max(funcs.length, gosat.length, metin.split("func").length - 1);
  return { ok: true, tool: "rea_go_pclntab", summary: `${buildid ?? "?"} pclntab=${pclntab ? "var" : "yok"} ~${tahmin} func`, details: { buildid, pclntab, pclnametab, tahminiFonksiyon: tahmin } };
}

// Go vendor/modül yolları: ilk 100 benzersiz yol (tamamen offline).
export function rea_go_vendor(yol: string): ReaGpResult {
  // Yoksa erken kapı.
  if (!yol || !existsSync(yol)) return { ok: false, code: "capability_unsupported", reason: "dosya yok" };
  // latin1 metin: vendor öneki ve bilinen domain kalıpları aranır.
  const metin = readFileSync(yol).toString("latin1");
  const ham = [...metin.matchAll(/(?:vendor\/|github\.com\/|golang\.org\/|gopkg\.in\/)[A-Za-z0-9_\-/.]+/g)].map((m) => m[0]);
  // Tekille + ilk 100 ile kırp.
  const yollar = [...new Set(ham)].slice(0, 100);
  if (!yollar.length) return { ok: false, code: "capability_unsupported", reason: "vendor/modül yolu yok" };
  return { ok: true, tool: "rea_go_vendor", summary: `${yollar.length} yol`, details: { yollar, sayi: yollar.length } };
}

// --- Go derinliği: pclntab fonksiyon + dosya:satır eşlemesi (saf TS, yürütme yok) ---
// Go sinyali: go1.x dizesi ya da pclntab/funcnametab tablo adları.
function goSinyalVarMi(metin: string): boolean {
  return /go1\.\d+/.test(metin) || metin.includes("gopclntab") || metin.includes("pclntab") || metin.includes("funcnametab");
}
// Dış araç kapısı: önce env yolu, yoksa PATH (where/which). Çalıştırma yok, yalnız konum.
function goAracBul(envAd: string, adaylar: string[]): string | null {
  const ozel = process.env[envAd];
  if (ozel) return existsSync(ozel) ? ozel : null;
  const prob = process.platform === "win32" ? "where" : "which";
  for (const bin of adaylar) {
    try {
      const r = spawnSync(prob, [bin], { stdio: "ignore", timeout: 5000 });
      if (r.status === 0) return bin;
    } catch { /* sonraki aday */ }
  }
  return null;
}
export interface GoEsleme { fonksiyon: string | null; dosya: string; satir: number }
// Fonksiyon + dosya:satır: ofsetli tarama, her satır en yakın önceki func ile eşlenir
// (4KB yakınlık heuristic; sembol tablosu çözümü değil, notta belirtilir).
export function rea_go_funclines(yol: string): ReaGpResult {
  if (!yol || !existsSync(yol)) return { ok: false, code: "capability_unsupported", reason: "dosya yok" };
  const metin = readFileSync(yol).toString("latin1");
  if (!goSinyalVarMi(metin)) return { ok: false, code: "capability_unsupported", reason: "go sinyali yok (go1.x/pclntab bulunamadı)" };
  const funclar: { ad: string; at: number }[] = [];
  for (const m of metin.matchAll(/[A-Za-z0-9_/.@-]+\.func[A-Za-z0-9_.]*/g)) funclar.push({ ad: m[0], at: m.index ?? 0 });
  const satirlar: { dosya: string; satir: number; at: number }[] = [];
  for (const m of metin.matchAll(/([A-Za-z0-9_/.@-]+\.go):(\d+)/g))
    satirlar.push({ dosya: m[1] as string, satir: Number(m[2]), at: m.index ?? 0 });
  if (!funclar.length && !satirlar.length) return { ok: false, code: "capability_unsupported", reason: "go satır izi yok" };
  const fonksiyonlar = [...new Set(funclar.map((f) => f.ad))].slice(0, 200);
  const dosyaSatir = [...new Set(satirlar.map((s) => `${s.dosya}:${s.satir}`))].slice(0, 200);
  const esleme: GoEsleme[] = satirlar.slice(0, 200).map((s) => {
    let once: { ad: string; at: number } | null = null;
    for (const f of funclar) if (f.at <= s.at && s.at - f.at <= 4096 && (!once || f.at > once.at)) once = f;
    return { fonksiyon: once?.ad ?? null, dosya: s.dosya, satir: s.satir };
  });
  return {
    ok: true, tool: "rea_go_funclines", summary: `${fonksiyonlar.length} func ${esleme.length} eşleme`,
    details: { fonksiyonlar, dosyaSatir, esleme, eslemeNotu: "yakınlık heuristic (4KB pencere), sembol tablosu çözümü değil" },
  };
}
// GoReSym: araç yoksa dürüst kapı + kurulum ipucu; varsa timeout'lu gerçek çağrı.
export function rea_go_goresym(yol: string): ReaGpResult {
  if (!yol || !existsSync(yol)) return { ok: false, code: "capability_unsupported", reason: "dosya yok" };
  const metin = readFileSync(yol).toString("latin1");
  if (!goSinyalVarMi(metin)) return { ok: false, code: "capability_unsupported", reason: "go sinyali yok (go1.x/pclntab bulunamadı)" };
  const arac = goAracBul("REA_GORESYM_BIN", ["GoReSym", "goresym"]);
  if (!arac) return { ok: false, code: "capability_unsupported", reason: "GoReSym yok (kurulum: https://github.com/mandiant/GoReSym ; bulunan exe yolunu REA_GORESYM_BIN ile ver)" };
  try {
    const cikti = execFileSync(arac, ["-f", yol], { encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    return { ok: true, tool: "rea_go_goresym", summary: "goresym çıktısı", details: { cikti: String(cikti).slice(0, 4000) } };
  } catch (e) {
    return { ok: false, code: "capability_unsupported", reason: `GoReSym çalışmadı: ${(e as Error)?.message ?? e}` };
  }
}
