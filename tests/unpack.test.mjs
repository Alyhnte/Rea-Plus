// unpack.test.mjs: UPX + ILSpy gerçek exec (mocksuz, stub yok).
// Koş: npm run build sonrası `node --test tests/unpack.test.mjs`
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UNPACK_TOOLS, upxTamam, rea_upx_info, rea_upx_unpack, rea_ilspy_decompile, rea_unpack_try } from "../dist/rea-domains/unpack/Unpack.js";
// Gerçek hedefler: repoda izlenen korpus ELF'i + (varsa) dotnet CoreLib.
const ELF = join(dirname(fileURLToPath(import.meta.url)), "corpus", "mini_branch.elf");
const ADAY_DLL = process.env.REA_CORELIB_DLL ?? "";
// CoreLib bul: sabit yoksa shared altında ilk dll (dotnet-cil ile aynı yöntem).
function bulDll() {
  if (ADAY_DLL && existsSync(ADAY_DLL)) return ADAY_DLL;
  try { const yigin = process.platform === "win32" ? ["C:\\Program Files\\dotnet\\shared"] : ["/usr/share/dotnet/shared", "/usr/lib/dotnet/shared", join(homedir(), ".dotnet", "shared")]; let yedek = null; while (yigin.length) { const d = yigin.pop(); for (const ad of readdirSync(d)) { const yol = join(d, ad); const st = statSync(yol); if (st.isDirectory()) yigin.push(yol); else if (ad === "System.Private.CoreLib.dll") return yol; else if (!yedek && ad.endsWith(".dll")) yedek = yol; } } return yedek; } catch { /* yoksa null */ }
  return null;
}
const DLL = bulDll();
// ilspycmd var mı? Yoksa ilspy testi kapı beklentisine düşer (ürün de aynı kapıyı döner).
const ilspyVar = (() => { try { execFileSync("ilspycmd", ["--version"], { stdio: "ignore", timeout: 15000 }); return true; } catch { return false; } })();
// UPX sürüm çıktısı: REA_UPX_BIN + PATH denenir.
function upxSurum() {
  const adaylar = [process.env.REA_UPX_BIN, "upx"].filter(Boolean);
  for (const b of adaylar) { try { return String(execFileSync(b, ["--version"], { encoding: "utf8", timeout: 15000 })); } catch { /* sıradaki */ } }
  return "";
}
// Dizinde dosya adı ara (recursive, TypeExists için).
function dosyaBul(dizin, ad) { for (const g of readdirSync(dizin, { withFileTypes: true })) { const y = join(dizin, g.name); if (g.isDirectory()) { const b = dosyaBul(y, ad); if (b) return b; } else if (g.name === ad) return y; } return null; }
describe("unpack araçları (gerçek exec)", () => {
  // Katalog uyumu: 4 isim, rea_ prefixli.
  it("UNPACK_TOOLS 4 isimli, rea_ prefixli", () => {
    assert.equal(UNPACK_TOOLS.length, 4);
    for (const a of UNPACK_TOOLS) assert.ok(a.startsWith("rea_"), `${a} prefixli olmalı`);
  });
  // UPX caps: varsa gerçek sürüm çıktısı, yoksa kapı (sürüm numarası sabitlenmez).
  it("upx caps: varsa sürüm, yoksa kapı", () => {
    if (!upxTamam()) { const kapı = rea_upx_info(ELF); assert.equal(kapı.ok, false); assert.equal(kapı.code, "capability_unsupported"); return; }
    const cikti = upxSurum();
    assert.ok(cikti.trim().length > 0, `sürüm çıktısı boş olmamalı: ${cikti.slice(0, 120)}`);
  });
  // upx -l mini_branch.elf: sıkışık değil bilgisi döner.
  it("upx -l mini_branch.elf sıkışık değil bilgisi", () => {
    if (!upxTamam()) { assert.equal(rea_upx_info(ELF).code, "capability_unsupported"); return; }
    const r = rea_upx_info(ELF);
    assert.equal(r.ok, true);
    assert.equal(r.sikisik, false);
  });
  // Sıkışık olmayan unpack: sessiz kapı, unsupported.
  it("sıkışık olmayan unpack unsupported", () => {
    const d = mkdtempSync(join(tmpdir(), "upx-"));
    const r = rea_upx_unpack(ELF, join(d, "acik.elf"));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  // ILSpy CoreLib üstünde C# üretir: String.cs TypeExists.
  it("ilspy CoreLib üstünde C# üretir (TypeExists)", { timeout: 180000 }, () => {
    if (!DLL) { assert.equal(rea_ilspy_decompile("yok.dll", tmpdir()).ok, false); return; }
    if (!ilspyVar) { const k = rea_ilspy_decompile(DLL, tmpdir()); assert.equal(k.ok, false); assert.equal(k.code, "capability_unsupported"); return; }
    const d = mkdtempSync(join(tmpdir(), "ilspy-"));
    const r = rea_ilspy_decompile(DLL, d);
    assert.equal(r.ok, true);
    assert.ok(r.cs_sayisi > 0);
    const s = dosyaBul(d, "String.cs");
    assert.ok(s && existsSync(s), "System/String.cs üretilmeli");
    assert.ok(readFileSync(s, "utf8").includes("class String"), "String.cs class String içermeli");
  });
  // Boş yol kapıları: üçü de unsupported.
  it("boş yol upx_info unsupported", () => {
    const r = rea_upx_info("");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  it("boş yol unpack unsupported", () => {
    const r = rea_upx_unpack("", "");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  it("boş yol ilspy unsupported", () => {
    const r = rea_ilspy_decompile("", "");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  // unpack_try ELF: sıkışık değil + dotnet değil => dump-hunt.
  it("unpack_try ELF dump-hunt önerir", () => {
    const r = rea_unpack_try(ELF);
    assert.equal(r.yontem, "dump-hunt");
    assert.equal(r.sonuc.code, "capability_unsupported");
  });
  // unpack_try DLL: dotnet sezgisi => ilspy önerisi.
  it("unpack_try DLL ilspy önerir", function () {
    if (!DLL) return this.skip?.();
    const r = rea_unpack_try(DLL);
    assert.equal(r.yontem, "ilspy");
  });
  // unpack_try boş: none kapısı.
  it("unpack_try boş yol none döner", () => {
    const r = rea_unpack_try("");
    assert.equal(r.yontem, "none");
    assert.equal(r.sonuc.code, "capability_unsupported");
  });
});
