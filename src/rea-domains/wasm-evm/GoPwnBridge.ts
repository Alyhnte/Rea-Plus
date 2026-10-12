// rea-domains/wasm-evm: Go + pwn iskeleti
// Go modül/version metin taraması; ELF layout için pwntools/python gerekir.
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
