// rea-domains/firmware-browser: firmware çıkarma (yalnız Linux)
// binwalk/unblob yoksa capability_unsupported + native handoff.
import { execFileSync } from "child_process";
import { mkdirSync } from "fs";
import { resolveDerivedWorkspacePath, WorkspaceRootError } from "../../server/workspaceRoot.js";
export type ReaFwResult =
  | { ok: true; tool: string; summary: string; handoff?: string }
  | { ok: false; code: "capability_unsupported"; reason: string; handoff?: string };
function linuxOnly(tool: string): ReaFwResult | null {
  // Windows/macOS'ta native koşmaz, handoff gerekir.
  if (process.platform !== "linux") {
    return { ok: false, code: "capability_unsupported", reason: `${tool} yalnız Linux (platform=${process.platform})`, handoff: "native:binwalk/unblob" };
  }
  return null;
}
function resolveBin(tool: string): string {
  // Önce env'deki yol, yoksa PATH'teki isim.
  return process.env[`REA_${tool.toUpperCase()}_BIN`] || tool;
}
// Firmware çıkarma: gerçek binwalk/unblob çağrısı (30sn timeout, çıktı dir).
export function rea_firmware_extract(imagePath: string, tool: "binwalk" | "unblob" = "unblob"): ReaFwResult {
  const gate = linuxOnly(tool);
  if (gate) return gate;
  if (!imagePath) return { ok: false, code: "capability_unsupported", reason: "image yolu boş", handoff: "native:binwalk/unblob" };
  const bin = resolveBin(tool);
  // Turev cikti dizini ("${imagePath}.extracted") kok tanimliysa mkdir/exec oncesi dogrulanir.
  let outDir: string;
  try { outDir = resolveDerivedWorkspacePath(imagePath, ".extracted"); }
  catch (e) { if (e instanceof WorkspaceRootError) return { ok: false, code: "capability_unsupported", reason: e.message, handoff: "native:binwalk/unblob" }; throw e; }
  try {
    mkdirSync(outDir, { recursive: true }); // Çıktı dizinini hazırla.
    const args = tool === "binwalk" ? ["-e", "-C", outDir, imagePath] : ["-e", "--output-dir", outDir, imagePath];
    execFileSync(bin, args, { timeout: 30000, stdio: "pipe", encoding: "utf8" }); // Gerçek çıkarma.
    return { ok: true, tool: `rea_firmware_${tool}`, summary: `${imagePath} -> ${outDir}` };
  } catch (e) {
    // İkili yoksa/zaman aşımında handoff'a düş.
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    return { ok: false, code: "capability_unsupported", reason: `${bin} çalışmadı: ${msg}`, handoff: "native:binwalk/unblob" };
  }
}
// Native handoff: Linux ajanına devir kararı üretir.
export function rea_firmware_handoff(imagePath: string, reason: string): ReaFwResult {
  if (!imagePath) return { ok: false, code: "capability_unsupported", reason: "image yolu boş" };
  return { ok: true, tool: "rea_firmware_handoff", summary: `handoff: ${reason}`, handoff: imagePath };
}
// Destek matrisi sorgusu.
export function rea_firmware_caps(): ReaFwResult {
  const isLinux = process.platform === "linux";
  if (!isLinux) return { ok: false, code: "capability_unsupported", reason: "bu hostta çıkarma yok, handoff gerekli", handoff: "native:binwalk/unblob" };
  return { ok: true, tool: "rea_firmware_caps", summary: "binwalk/unblob aday" };
}
