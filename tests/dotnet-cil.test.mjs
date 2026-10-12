// dotnet-cil.test.mjs: gerçek dnfile CIL okuma + kapı testleri (yürütme yok).
// Koş: node --test tests/dotnet-cil.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_dotnet_cil } from "../dist/rea-domains/dotnet/ManagedInspector.js";

// Gerçek dll bul: önce CoreLib, yoksa shared altında ilk dll.
function bulDll() {
  const aday = "C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App\\10.0.12\\System.Private.CoreLib.dll";
  if (existsSync(aday)) return aday;
  const kok = "C:\\Program Files\\dotnet\\shared";
  try {
    const yigin = [kok];
    while (yigin.length) {
      const d = yigin.pop();
      for (const ad of readdirSync(d)) {
        const yol = join(d, ad);
        const st = statSync(yol);
        if (st.isDirectory()) yigin.push(yol);
        else if (ad.endsWith(".dll")) return yol;
      }
    }
  } catch { /* shared yoksa kapı testi yapılır */ }
  return null;
}
const DLL = bulDll();

describe("rea_dotnet_cil (gerçek dnfile)", () => {
  // Gerçek dll üstünde assembly + metod listesi dolu dönmeli.
  it("gerçek dll assembly ve metod listesi döner", function () {
    if (!DLL) { assert.equal(rea_dotnet_cil("yok.dll").ok, false); return; }
    const r = rea_dotnet_cil(DLL);
    assert.equal(r.ok, true);
    assert.ok(r.assembly && r.assembly.length > 0);
    assert.ok(r.method_sayisi > 0);
    assert.ok(Array.isArray(r.methods) && r.methods.length > 0);
  });
  // CoreLib bulunduysa assembly adı birebir eşleşmeli.
  it("CoreLib assembly adı eşleşir", function () {
    if (!DLL || !DLL.includes("System.Private.CoreLib")) return this.skip?.();
    const r = rea_dotnet_cil(DLL);
    assert.equal(r.ok, true);
    assert.equal(r.assembly, "System.Private.CoreLib");
  });
  // Filtre substring eşleşmesi yapar, dışı sızmaz.
  it("tip filtresi eşleşenleri süzer", function () {
    if (!DLL) return this.skip?.();
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
