// DosCom: COM tespiti + PSP struct parse (tamamen offline).
import { existsSync, readFileSync } from "node:fs";
export type DosComSonuc =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string };
// COM üst sınırı: 64K - PSP(256) = 65280 bayt.
const COM_AZAMI = 65280;
// COM tespiti: MZ yok + boyut sınır içinde.
export function rea_dos_com(yol: string): DosComSonuc {
  // Yoksa erken kapı.
  if (!yol || !existsSync(yol)) return { ok: false, code: "capability_unsupported", reason: "dosya yok" };
  const buf = readFileSync(yol);
  // MZ başlıklı dosya COM değildir (EXE).
  if (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) return { ok: false, code: "capability_unsupported", reason: "MZ var (COM değil)" };
  // COM 64K-PSP sınırını aşamaz; boş da olamaz.
  if (!buf.length || buf.length > COM_AZAMI) return { ok: false, code: "capability_unsupported", reason: "COM boyutu dışında" };
  return { ok: true, tool: "rea_dos_com", summary: `COM adayı ${buf.length} bayt`, details: { boyut: buf.length, com: true } };
}
// PSP parse: ilk baytlardan INT20/memTop/dispatcher/FCB/cmdline.
export function rea_dos_psp(b64: string): DosComSonuc {
  // Boş girdi erken elenir.
  if (!b64) return { ok: false, code: "capability_unsupported", reason: "boş girdi" };
  let buf: Buffer;
  try { buf = Buffer.from(b64, "base64"); } catch { return { ok: false, code: "capability_unsupported", reason: "base64 çözülemedi" }; }
  // PSP en az komut satırı uzunluk baytını (0x81) içermeli.
  if (buf.length < 0x81) return { ok: false, code: "capability_unsupported", reason: "PSP çok kısa" };
  // INT20 (CD 20) + üst bellek + dağıtıcı + FCB alanları ham hex tutulur.
  const int20 = buf.subarray(0, 2).toString("hex");
  const memTop = buf.readUInt16LE(2);
  const dagitici = buf.length >= 10 ? buf.subarray(5, 10).toString("hex") : "";
  const fcb1 = buf.length >= 0x6c ? buf.subarray(0x5c, 0x5c + 16).toString("hex") : "";
  const fcb2 = buf.length >= 0x7c ? buf.subarray(0x6c, 0x6c + 16).toString("hex") : "";
  // Komut satırı: 0x80 uzunluk + 0x81Ascii gövde (tampon sınırında kırpılır).
  const cmdLen = Math.min(buf[0x80] as number, 127, Math.max(0, buf.length - 0x81));
  const cmdline = buf.subarray(0x81, 0x81 + cmdLen).toString("latin1");
  return { ok: true, tool: "rea_dos_psp", summary: `PSP cmdline="${cmdline}"`, details: { int20, memTop, dagitici, fcb1, fcb2, cmdLen, cmdline } };
}
