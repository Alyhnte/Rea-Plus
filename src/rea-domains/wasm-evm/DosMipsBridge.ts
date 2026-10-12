// rea-domains/wasm-evm: 16-bit DOS + MIPS/PSP köprü iskeleti (offline)
// DOS MZ başlığı ve MIPS/PSP profili saf TS ile taranır, harici disassembler yok.
export type ReaDosMipsResult =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string };
// Ortam kapısı: DOS profili için ham bayt erişimi gerekir.
function needBytes(buf: Uint8Array): ReaDosMipsResult | null {
  // Boş ya da çok kısa girdi disassembly için yetersizdir.
  if (!buf || buf.length < 64) {
    return { ok: false, code: "capability_unsupported", reason: "ham bayt yok/çok kısa" };
  }
  return null;
}

// MZ başlığı kontrolü: "MZ" + e_lfanew okuması (iskelet).
export function rea_dos_mz(buf: Uint8Array): ReaDosMipsResult {
  const gate = needBytes(buf);
  if (gate) return gate;
  // İlk iki bayt 0x4D 0x5A değilse DOS binary değildir.
  if (buf[0] !== 0x4d || buf[1] !== 0x5a) {
    return { ok: false, code: "capability_unsupported", reason: "MZ imzası yok" };
  }
  // e_lfanew LE u32 (0x3C); iskelet sadece aralık kontrolü yapar.
  const eLfanew = buf[0x3c] | (buf[0x3d] << 8) | (buf[0x3e] << 16) | (buf[0x3f] << 24);
  if (eLfanew < 0 || eLfanew >= buf.length) return { ok: false, code: "capability_unsupported", reason: "e_lfanew aralık dışı" };
  return { ok: true, tool: "rea_dos_mz", summary: `MZ ok, e_lfanew=${eLfanew}`, details: { eLfanew } };
}

// INT 21h taraması: 0xCD 0x21 dizilimini sayar (DOS syscall sinyali).
export function rea_dos_int21(buf: Uint8Array): ReaDosMipsResult {
  const gate = needBytes(buf);
  if (gate) return gate;
  // 16-bit DOS'ta CD 21 en yaygın servis çağrısıdır.
  let hits = 0;
  for (let i = 0; i + 1 < buf.length; i++) if (buf[i] === 0xcd && buf[i + 1] === 0x21) hits++;
  if (!hits) return { ok: false, code: "capability_unsupported", reason: "INT 21h bulunamadı" };
  return { ok: true, tool: "rea_dos_int21", summary: `${hits} INT 21h`, details: { hits } };
}

// MIPS fonksiyon ön-taraması: JAL (0x0Cxxxxxx) sayımı iskeleti.
export function rea_mips_funcs(buf: Uint8Array): ReaDosMipsResult {
  const gate = needBytes(buf);
  if (gate) return gate;
  // Big-endian JAL opcode üst 6 biti 000011 (0x0C) kontrolü.
  let jal = 0;
  for (let i = 0; i + 3 < buf.length; i += 4) if ((buf[i] >> 2) === 0x03) jal++;
  if (!jal) return { ok: false, code: "capability_unsupported", reason: "MIPS JAL yok" };
  return { ok: true, tool: "rea_mips_funcs", summary: `${jal} JAL adayı`, details: { jal } };
}

// PSP profil özeti: DOS + MIPS bulgularını tek kayda indirger.
export function rea_mips_psp_profile(buf: Uint8Array): ReaDosMipsResult {  const dos = rea_dos_int21(buf);
  const mips = rea_mips_funcs(buf);
  // İkisi de kapıdan geçemezse profil çıkarılamaz.
  if (!dos.ok && !mips.ok) {
    return { ok: false, code: "capability_unsupported", reason: "DOS+MIPS sinyali yok" };
  }
  return { ok: true, tool: "rea_mips_psp_profile", summary: "DOS/MIPS profil iskeleti", details: { dos, mips } };
}
