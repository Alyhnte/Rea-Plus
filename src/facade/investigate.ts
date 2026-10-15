// rea-plus soruşturma orkestrasyonu: 5 çağrıyı 1'e indirir.
// sniff -> confidence -> fallback -> plan -> evidence ipucu. SAF + fs (exec yok).
import { existsSync } from "node:fs";
import { baslikOku, sniffBytes } from "./sniff.js";
import { scoreTarget, bestMotor } from "./confidence.js";
import { resolveChain } from "./fallback.js";

export const INVESTIGATE_TOOLS = ["rea_investigate"] as const;

// Tip -> aday motorlar (skor tablosuyla uyumlu).
const ADAYLAR: Readonly<Record<string, readonly string[]>> = {
  elf: ["radare2", "ghidra", "cutter"],
  apk: ["jadx", "apktool"],
  dex: ["jadx"],
  pe: ["cutter", "ghidra", "x64dbg"],
  macho: ["hopper", "ghidra", "cutter"],
  wasm: ["wabt"],
  evm: ["keccak"],
  firmware: ["binwalk", "unblob"],
  dotnet: ["dotnet"],
  js: ["js"],
};

export interface SorusturmaPlani {
  ok: true;
  arac: string;
  tip: string;
  motor: string;
  skor: number;
  yedekler: string[];
  plan: Array<{ adim: number; tool: string; neden: string }>;
}

export function rea_investigate(yol: string, soru = ""): SorusturmaPlani | { ok: false; code: "capability_unsupported"; neden: string } {
  if (!yol || !existsSync(yol)) {
    return { ok: false, code: "capability_unsupported", neden: `hedef yok: ${yol}` };
  }
  // KRİTİK: dosyanın tamamı belleğe alınmaz; yalnız ilk 4KB penceresi okunur.
  let buf: Uint8Array;
  try {
    const bas = baslikOku(yol, 4096);
    if (!bas) return { ok: false, code: "capability_unsupported", neden: `okunamadı: ${yol}` };
    buf = new Uint8Array(bas.buffer, bas.byteOffset, bas.byteLength);
  } catch {
    return { ok: false, code: "capability_unsupported", neden: `okunamadı: ${yol}` };
  }
  const b = sniffBytes(buf);
  const tip = b.tip;
  const adaylar = [...(ADAYLAR[tip] ?? [])];
  if (adaylar.length === 0) {
    return { ok: false, code: "capability_unsupported", neden: `tip desteklenmiyor: ${tip}` };
  }
  const motor = bestMotor(tip, adaylar);
  const skor = scoreTarget(tip, motor);
  const yedekler = resolveChain(motor, new Set(adaylar.filter((a) => a !== motor)));
  const plan = [
    { adim: 1, tool: motor, neden: `birincil motor (skor ${skor})` },
    ...yedekler.map((y, i) => ({ adim: i + 2, tool: y, neden: "yedek zincir" })),
    { adim: yedekler.length + 2, tool: "rea_evidence_bundle", neden: "kanıt paketi" },
    { adim: yedekler.length + 3, tool: "rea_readiness", neden: "hazırlık skoru" },
  ];
  void soru;
  return { ok: true, arac: "rea_investigate", tip, motor, skor, yedekler, plan };
}
