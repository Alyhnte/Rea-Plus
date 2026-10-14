// unpack: UPX + ILSpy gerçek exec (stub yok, hedef çalıştırılmaz).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveDerivedWorkspacePath, WorkspaceRootError } from "../../server/workspaceRoot.js";
// Facade uyumu: rea_ prefix zorunlu, 4 araç.
export const UNPACK_TOOLS = ["rea_upx_info", "rea_upx_unpack", "rea_ilspy_decompile", "rea_unpack_try"] as const;
const ZAMAN = 120_000; // ilspy CoreLib ~20sn sürer, pay bırak.
const TAMPON = 16 * 1024 * 1024;
type Engel = { ok: false; code: "capability_unsupported"; neden: string };
function engel(neden: string): Engel { return { ok: false, code: "capability_unsupported", neden }; }
const UPX_YOK = "upx yok (PATH'e upx kurun veya REA_UPX_BIN tanımlayın)";
// UPX adayı: env (REA_UPX_BIN) öncelikli, sonra PATH. Makineye özel sabit yol yok.
function upxBin(): string | null {
  const aday = process.env.REA_UPX_BIN ? [process.env.REA_UPX_BIN, "upx"] : ["upx"];
  for (const b of aday) { try { execFileSync(b, ["--version"], { stdio: "ignore" }); return b; } catch { /* sıradaki */ } }
  return null;
}
// UPX kurulu mu? (`upx --version` çalışırsa tamam).
export function upxTamam(): boolean { return upxBin() !== null; }
// UPX liste: sıkışık mı? (`upx -l`, NotPacked => sıkışık değil bilgisi).
export function rea_upx_info(yol: string) {
  if (!yol) return engel("yol boş");
  const bin = upxBin(); if (!bin) return engel(UPX_YOK);
  if (!existsSync(yol)) return engel(`dosya yok: ${yol}`);
  try { const ham = String(execFileSync(bin, ["-l", yol], { encoding: "utf8", timeout: ZAMAN, maxBuffer: TAMPON })); return { ok: true as const, arac: "rea_upx_info", dosya: yol, sikisik: true, cikti: ham.slice(0, 2000) }; }
  catch (e) { const m = String((e as Error)?.message ?? e) + String((e as { stderr?: unknown }).stderr ?? ""); if (m.toLowerCase().includes("not packed")) return { ok: true as const, arac: "rea_upx_info", dosya: yol, sikisik: false, not: "UPX ile sıkışık değil" }; return engel(`upx -l hatası: ${m.slice(0, 500)}`); }
}
// UPX aç: sıkışık değilse sessiz kapı (`upx -d -o`, fussuz unsupported).
export function rea_upx_unpack(yol: string, cikti: string) {
  if (!yol || !cikti) return engel("yol/cikti boş");
  const bin = upxBin(); if (!bin) return engel(UPX_YOK);
  if (!existsSync(yol)) return engel(`dosya yok: ${yol}`);
  try { const ham = String(execFileSync(bin, ["-d", "-o", cikti, yol], { encoding: "utf8", timeout: ZAMAN, maxBuffer: TAMPON })); return { ok: true as const, arac: "rea_upx_unpack", dosya: yol, cikti, log: ham.slice(0, 1000) }; }
  catch (e) { return engel(`açılamadı (sıkışık değil olabilir): ${String((e as Error)?.message ?? e).slice(0, 500)}`); }
}
// Çıktıdaki .cs sayacı (recursive, ilspy -p projesi için).
function csSay(dizin: string): number { let n = 0; for (const g of readdirSync(dizin, { withFileTypes: true })) { const y = join(dizin, g.name); if (g.isDirectory()) n += csSay(y); else if (g.name.endsWith(".cs")) n++; } return n; }
// ILSpy decompile: managed dll -> C# projesi (`ilspycmd -o -p`, yürütme yok).
export function rea_ilspy_decompile(dllYolu: string, ciktiDir: string) {
  if (!dllYolu || !ciktiDir) return engel("dllYolu/ciktiDir boş");
  if (!existsSync(dllYolu)) return engel(`dosya yok: ${dllYolu}`);
  try { execFileSync("ilspycmd", ["--version"], { stdio: "ignore", timeout: 15000 }); }
  catch { return engel("ilspycmd yok (dotnet tool: dotnet tool install -g ilspycmd)"); }
  try { mkdirSync(ciktiDir, { recursive: true }); execFileSync("ilspycmd", ["-o", ciktiDir, "-p", dllYolu], { encoding: "utf8", timeout: ZAMAN, maxBuffer: TAMPON }); const n = csSay(ciktiDir); return { ok: true as const, arac: "rea_ilspy_decompile", dosya: dllYolu, ciktiDir, cs_sayisi: n, not: "C# salt-okunur, yürütme yok" }; }
  catch (e) { return engel(`ilspy hatası: ${String((e as Error)?.message ?? e).slice(0, 500)}`); }
}
// Hızlı dotnet-dll sezi: MZ + .dll/.exe uzantısı (çalıştırma yok).
function dotnetDllMi(yol: string): boolean {
  if (!yol.endsWith(".dll") && !yol.endsWith(".exe")) return false;
  try { const b = readFileSync(yol); return b.length > 2 && b[0] === 0x4d && b[1] === 0x5a; } catch { return false; }
}
// Sıralı deneme: upx-info->upx-dene, dotnet ise ilspy öner, yoksa dump-hunt öner.
export function rea_unpack_try(yol: string) {
  if (!yol) return { yontem: "none" as const, sonuc: engel("yol boş") };
  if (!existsSync(yol)) return { yontem: "none" as const, sonuc: engel(`dosya yok: ${yol}`) };
  const bilgi = rea_upx_info(yol);
  if (bilgi.ok && bilgi.sikisik) {
    // Turev yazma ("${yol}.unpacked") kok tanimliysa yazmadan once ayni merkezi kuralla dogrulanir.
    let cikti: string;
    try { cikti = resolveDerivedWorkspacePath(yol, ".unpacked"); }
    catch (e) { if (e instanceof WorkspaceRootError) return { yontem: "upx" as const, sonuc: engel(e.message) }; throw e; }
    return { yontem: "upx" as const, sonuc: rea_upx_unpack(yol, cikti) };
  }
  if (dotnetDllMi(yol)) return { yontem: "ilspy" as const, sonuc: { ok: false as const, code: "capability_unsupported" as const, oneri: `dotnet DLL, ilspycmd -o <dir> -p ${yol} ile decompile önerilir` } };
  return { yontem: "dump-hunt" as const, sonuc: { ok: false as const, code: "capability_unsupported" as const, oneri: "UPX sıkışık değil + dotnet değil, dump-hunt (bellek dökümü) önerilir" } };
}
