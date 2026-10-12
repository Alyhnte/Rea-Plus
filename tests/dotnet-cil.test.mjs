// dotnet-cil.test.mjs: gerçek dnfile CIL okuma + kapı testleri (yürütme yok).
// Koş: node --test tests/dotnet-cil.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { rea_dotnet_cil } from "../dist/rea-domains/dotnet/ManagedInspector.js";

// Gerçek dll bul: önce REA_CORELIB_DLL, yoksa platforma göre dotnet shared altında ilk dll.
function bulDll() {
  const aday = process.env.REA_CORELIB_DLL ?? "";
  if (aday && existsSync(aday)) return aday;
  const kokler = process.platform === "win32" ? ["C:\\Program Files\\dotnet\\shared"] : ["/usr/share/dotnet/shared", "/usr/lib/dotnet/shared", join(homedir(), ".dotnet", "shared")];
  try {
    const yigin = [...kokler]; let yedek = null;
    while (yigin.length) {
      const d = yigin.pop();
      for (const ad of readdirSync(d)) {
        const yol = join(d, ad);
        const st = statSync(yol);
        if (st.isDirectory()) yigin.push(yol);
        else if (ad === "System.Private.CoreLib.dll") return yol;
        else if (!yedek && ad.endsWith(".dll")) yedek = yol;
      }
    }
  } catch { /* shared yoksa kapı testi yapılır */ }
  return yedek;
}
const DLL = bulDll();
// dnfile var mı? Yoksa CIL okuma testleri kapı beklentisine düşer (ürün de aynı kapıyı döner).
const dnfileVar = ["python", "python3", "py"].some((b) => { try { execFileSync(b, ["-c", "import dnfile"], { stdio: "ignore", timeout: 10000 }); return true; } catch { return false; } });

describe("rea_dotnet_cil (gerçek dnfile)", () => {
  // Gerçek dll üstünde assembly + metod listesi dolu dönmeli.
  it("gerçek dll assembly ve metod listesi döner", function () {
    if (!DLL) { assert.equal(rea_dotnet_cil("yok.dll").ok, false); return; }
    if (!dnfileVar) return this.skip?.(); // yoklama kararsızsa sahte kırmızı yerine dürüst skip
    const r = rea_dotnet_cil(DLL);
    assert.equal(r.ok, true);
    assert.ok(r.assembly && r.assembly.length > 0);
    assert.ok(r.method_sayisi > 0);
    assert.ok(Array.isArray(r.methods) && r.methods.length > 0);
  });
  // CoreLib bulunduysa assembly adı birebir eşleşmeli.
  it("CoreLib assembly adı eşleşir", function () {
    if (!DLL || !dnfileVar || !DLL.includes("System.Private.CoreLib")) return this.skip?.();
    const r = rea_dotnet_cil(DLL);
    assert.equal(r.ok, true);
    assert.equal(r.assembly, "System.Private.CoreLib");
  });
  // Filtre substring eşleşmesi yapar, dışı sızmaz.
  it("tip filtresi eşleşenleri süzer", function () {
    if (!DLL || !dnfileVar) return this.skip?.();
    const r = rea_dotnet_cil(DLL, "Get");
    assert.equal(r.ok, true);
    assert.ok(r.methods.length > 0);
    for (const m of r.methods) assert.ok(m.includes("Get"));
  });
  // Olmayan dosya kapıdan döner.
  it("olmayan dosya capability_unsupported verir", () => {
    const r = rea_dotnet_cil("yok/boyle.dll");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  // PE olmayan dosya CIL okunamaz: kapı kodu sabittir.
  it("PE olmayan dosya capability_unsupported verir", () => {
    const d = mkdtempSync(join(tmpdir(), "cil-"));
    const yol = join(d, "duz.txt");
    writeFileSync(yol, "duz metin, PE degil");
    const r = rea_dotnet_cil(yol);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});
