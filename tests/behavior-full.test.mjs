// behavior-full.test.mjs: syscall+dosya/registry+full rapor (saf).
// Koş: node --test tests/behavior-full.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SYSCALL_ADLARI, syscall_ad, syscall_biliniyor } from "../dist/rea-domains/behavior/SyscallTable.js";
import { rea_dosya_izi, rea_registry_izi } from "../dist/rea-domains/behavior/FileRegProfiles.js";
import { rea_behavior_full } from "../dist/rea-domains/behavior/BehaviorFull.js";

// Sahte api olayı kurucu.
const api = (ad, ekstra = {}) => ({ api: ad, ...ekstra });

describe("syscall tablosu", () => {
  // 8 zorunlu ad çözülür.
  it("zorunlu 8 adı çözer", () => {
    assert.equal(syscall_ad(0x55), "NtCreateFile");
    assert.equal(syscall_ad(0x08), "NtWriteFile");
    assert.equal(syscall_ad(0x06), "NtReadFile");
    assert.equal(syscall_ad(0x18), "NtAllocateVirtualMemory");
    assert.equal(syscall_ad(0x50), "NtProtectVirtualMemory");
    assert.equal(syscall_ad(0xC1), "NtCreateThreadEx");
    assert.equal(syscall_ad(0x26), "NtOpenProcess");
    assert.equal(syscall_ad(0x07), "NtDeviceIoControlFile");
  });
  // En az 20 kayıt (8 zorunlu + 12 ek).
  it("en az 20 kayıt içerir", () => {
    assert.ok(Object.keys(SYSCALL_ADLARI).length >= 20);
  });
  // Bilinmeyen numarada kararlı etiket.
  it("bilinmeyende syscall_0x etiketi", () => {
    assert.equal(syscall_ad(0x999), "syscall_0x999");
    assert.equal(syscall_ad(-1), "syscall_bilinmiyor");
  });
  // Ad kapısı büyük/küçük duyarsız.
  it("ad kapısı duyarsız", () => {
    assert.equal(syscall_biliniyor("ntcreatefile"), true);
    assert.equal(syscall_biliniyor("YokBoyle"), false);
  });
});

describe("rea_dosya_izi", () => {
  // CreateFileW/WriteFile yazma sayılır.
  it("yazılanları toplar", () => {
    const r = rea_dosya_izi([api("CreateFileW", { yol: "C:\\a.txt" }), api("WriteFile", { args: ["C:\\a.txt"] })]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.yazilanDosyalar, ["C:\\a.txt"]);
  });
  // ReadFile okuma sayılır, yazmadan ayrı.
  it("okuma/yazma ayrımı", () => {
    const r = rea_dosya_izi([api("WriteFile", { yol: "C:\\w.txt" }), api("ReadFile", { yol: "C:\\r.txt" })]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.yazilanDosyalar, ["C:\\w.txt"]);
    assert.deepEqual(r.details.okunanDosyalar, ["C:\\r.txt"]);
  });
  // Boş liste kapısı.
  it("boş kapı", () => {
    const r = rea_dosya_izi([]);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_registry_izi", () => {
  // RegSetValue ailesi anahtar toplar.
  it("yazılan anahtarları toplar", () => {
    const r = rea_registry_izi([api("RegSetValueExW", { anahtar: "HKLM\\Software\\X" }), api("NtSetValueKey", { args: ["HKCU\\Y"] })]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.yazilanAnahtarlar, ["HKCU\\Y", "HKLM\\Software\\X"]);
  });
  // Boş liste kapısı.
  it("boş kapı", () => {
    const r = rea_registry_izi([]);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_behavior_full", () => {
  // Sahte girdilerle tek rapor: çizelge+özet+bulgular.
  it("sahte girdilerle rapor üretir", () => {
    const r = rea_behavior_full([api("CreateFileW", { yol: "C:\\a.txt" }), api("ReadFile", { yol: "C:\\b.txt" })], [{ kaynak: "net", zaman: 5, detay: "n1" }]);
    assert.equal(r.ok, true);
    assert.equal(r.tool, "rea_behavior_full");
    assert.ok(Array.isArray(r.cizelge) && r.cizelge.length === 3);
    assert.ok(typeof r.ozet === "string" && r.ozet.length > 0);
    assert.ok(r.bulgular.some((b) => b.includes("dosya_yazma=1")));
  });
  // no alanı syscall adını çözer.
  it("syscall no çözer", () => {
    const r = rea_behavior_full([api("iz", { no: 0x55 })]);
    assert.equal(r.ok, true);
    assert.ok(r.bulgular.includes("syscall:NtCreateFile"));
    assert.ok(r.cizelge.some((o) => o.kaynak === "syscall" && o.detay === "NtCreateFile"));
  });
  // Sayısal metin "85" de çözülür.
  it("sayısal metni çözer", () => {
    const r = rea_behavior_full([{ api: "85" }]);
    assert.equal(r.ok, true);
    assert.ok(r.bulgular.includes("syscall:NtCreateFile"));
  });
  // dosyaProfili=false dosya özetini atlar.
  it("dosyaProfili=false atlar", () => {
    const r = rea_behavior_full([api("CreateFileW", { yol: "C:\\a.txt" })], [], false);
    assert.equal(r.ok, true);
    assert.equal(r.bulgular.some((b) => b.startsWith("dosya_")), false);
  });
  // Boş api kapısı.
  it("boş api kapısı", () => {
    const r = rea_behavior_full([]);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});
