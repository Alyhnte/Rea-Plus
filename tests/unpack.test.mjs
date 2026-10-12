// unpack.test.mjs: UPX + ILSpy gerçek exec (mocksuz, stub yok).
// Koş: npm run build sonrası `node --test tests/unpack.test.mjs`
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UNPACK_TOOLS, upxTamam, rea_upx_info, rea_upx_unpack, rea_ilspy_decompile, rea_unpack_try } from "../dist/rea-domains/unpack/Unpack.js";
// Gerçek hedefler: conduit ELF + dotnet CoreLib.
const ELF = "C:\\Users\\kngal\\AppData\\Local\\Temp\\opencode\\conduit\\examples\\target\\mini_branch.elf";
const SABIT_DLL = "C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App\\10.0.12\\System.Private.CoreLib.dll";
// CoreLib bul: sabit yoksa shared altında ilk dll (dotnet-cil ile aynı yöntem).
function bulDll() {
  if (existsSync(SABIT_DLL)) return SABIT_DLL;
  try { const yigin = ["C:\\Program Files\\dotnet\\shared"]; while (yigin.length) { const d = yigin.pop(); for (const ad of readdirSync(d)) { const yol = join(d, ad); const st = statSync(yol); if (st.isDirectory()) yigin.push(yol); else if (ad.endsWith(".dll")) return yol; } } } catch { /* yoksa null */ }
  return null;
}
const DLL = bulDll();
// UPX sürüm çıktısı: PATH + WinGet konumu denenir (gerçek 5.2.1).
function upxSurum() {
  const sabit = "C:\\Users\\kngal\\AppData\\Local\\Microsoft\\WinGet\\Packages\\UPX.UPX_Microsoft.Winget.Source_8wekyb3d8bbwe\\upx-5.2.1-win64\\upx.exe";
  for (const b of ["upx", sabit]) { try { return String(execFileSync(b, ["--version"], { encoding: "utf8", timeout: 15000 })); } catch { /* sıradaki */ } }
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
  // UPX caps: gerçek sürüm 5.2.1 + upxTamam true.
  it("upx caps gerçek sürüm 5.2.1", () => {
    assert.equal(upxTamam(), true);
    const cikti = upxSurum();
    assert.ok(cikti.includes("5.2.1"), `sürüm 5.2.1 içermeli: ${cikti.slice(0, 120)}`);
  });
  // upx -l mini_branch.elf: sıkışık değil bilgisi döner.
  it("upx -l mini_branch.elf sıkışık değil bilgisi", () => {
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
