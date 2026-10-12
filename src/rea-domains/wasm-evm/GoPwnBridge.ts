// rea-domains/wasm-evm: Go + pwn iskeleti
// Go modül/version metin taraması; ELF layout için pwntools/python gerekir.
import { existsSync, readFileSync } from "node:fs";
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

// ELF layout girişi (iskelet, gerçek pwntools çağrısı WP4d'de).
export function rea_pwn_elf_layout(elfPath: string): ReaGpResult {
  const gate = needPython();
  if (gate) return gate;
  if (!elfPath) return { ok: false, code: "capability_unsupported", reason: "elf yolu boş" };
  return { ok: true, tool: "rea_pwn_elf_layout", summary: `${elfPath} pwntools kuyruğunda` };
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
