// syscall-matrix.test.mjs: ntdll numara matrisi + CreateFileW/RegSet profilleri (Dalga C/1).
// Koş: node --test tests/syscall-matrix.test.mjs
// Saf testler: canlı süreç yok, exec yok, yalnız saf çözümleyiciler.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  syscall_coz,
  api_syscall_ad,
  tracer_syscall_eslestir,
} from "../dist/rea-domains/behavior/SyscallTable.js";
import {
  rea_createfilew_profili,
  rea_regset_profili,
} from "../dist/rea-domains/behavior/FileRegProfiles.js";

describe("syscall matrisi (a): bilinen numaralar", () => {
  // 8 zorunlu ntdll adı numarasıyla eşleşir.
  it("zorunlu 8 adı çözer", () => {
    assert.equal(syscall_coz(0x55), "NtCreateFile");
    assert.equal(syscall_coz(0x08), "NtWriteFile");
    assert.equal(syscall_coz(0x06), "NtReadFile");
    assert.equal(syscall_coz(0x26), "NtOpenProcess");
    assert.equal(syscall_coz(0x18), "NtAllocateVirtualMemory");
    assert.equal(syscall_coz(0xc1), "NtCreateThreadEx");
    assert.equal(syscall_coz(0x3a), "NtSetValueKey");
    assert.equal(syscall_coz(0x4e), "NtCreateKey");
  });

  // Tracer API adları syscall adlarına eşleşir.
  it("api adını syscall adına eşler", () => {
    assert.equal(api_syscall_ad("CreateFileW"), "NtCreateFile");
    assert.equal(api_syscall_ad("WriteFile"), "NtWriteFile");
    assert.equal(api_syscall_ad("ReadFile"), "NtReadFile");
    assert.equal(api_syscall_ad("RegSetValueExW"), "NtSetValueKey");
    assert.equal(api_syscall_ad("RegCreateKeyExW"), "NtCreateKey");
  });

  // Tracer çıktısı numarayla eşleşir (no alanı + ad eşleşmesi).
  it("tracer çağrısını numarayla eşler", () => {
    const a = tracer_syscall_eslestir({ api: "CreateFileW", args: ["C:\\a.txt"] });
    assert.equal(a.ad, "NtCreateFile");
    assert.equal(a.no, 0x55);
    const b = tracer_syscall_eslestir({ api: "iz", no: 0x08 });
    assert.equal(b.ad, "NtWriteFile");
    assert.equal(b.no, 0x08);
  });
});

describe("syscall matrisi (b): bilinmeyen numara", () => {
  // Bilinmeyen numarada sahte ad üretilmez.
  it("bilinmeyen no bilinmiyor olur", () => {
    assert.equal(syscall_coz(0x999), "bilinmiyor");
    assert.equal(syscall_coz(-1), "bilinmiyor");
  });

  // Bilinmeyen API/sahte etiket yok.
  it("sahte eşleşme üretmez", () => {
    assert.equal(api_syscall_ad("YokBoyleApi"), "bilinmiyor");
    const r = tracer_syscall_eslestir({ api: "YokBoyleApi" });
    assert.equal(r.ad, "bilinmiyor");
    assert.equal(r.no, null);
    assert.ok(!r.ad.includes("syscall_0x"), "sahte etiket var");
    const n = tracer_syscall_eslestir({ api: "iz", no: 0x999 });
    assert.equal(n.ad, "bilinmiyor");
    assert.ok(!n.ad.includes("syscall_0x"), "sahte etiket var");
  });
});

describe("CreateFileW profili (c): yazma/salt ayrımı", () => {
  // GENERIC_WRITE erişimi yazmadır.
  it("yazma erişimini yazma sayar", () => {
    const r = rea_createfilew_profili([{ api: "CreateFileW", yol: "C:\\w.txt", erisim: 0x40000000 }]);
    assert.equal(r.ok, true);
    assert.equal(r.details.profiller.length, 1);
    assert.equal(r.details.profiller[0].yol, "C:\\w.txt");
    assert.equal(r.details.profiller[0].yazma, true);
    assert.equal(r.details.profiller[0].salt, false);
  });

  // GENERIC_READ erişimi salttır (salt-okunur).
  it("salt erişimi salt sayar", () => {
    const r = rea_createfilew_profili([{ api: "CreateFileW", yol: "C:\\r.txt", erisim: 0x80000000 }]);
    assert.equal(r.ok, true);
    assert.equal(r.details.profiller[0].yazma, false);
    assert.equal(r.details.profiller[0].salt, true);
  });

  // Tracer args dizilimi: args[0]=yol, args[1]=erişim (hex metin).
  it("args diziliminden yol+erişim çıkarır", () => {
    const r = rea_createfilew_profili([{ api: "CreateFileW", args: ["C:\\a.txt", "0x40000000"] }]);
    assert.equal(r.ok, true);
    assert.equal(r.details.profiller[0].yol, "C:\\a.txt");
    assert.equal(r.details.profiller[0].erisim, 0x40000000);
    assert.equal(r.details.profiller[0].yazma, true);
  });

  // Boş liste kapısı.
  it("boş kapı", () => {
    const r = rea_createfilew_profili([]);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("RegSet profili (d): anahtar+değer adı", () => {
  // Adlandırılmış alanlardan anahtar + değer adı.
  it("anahtar ve değer adını çıkarır", () => {
    const r = rea_regset_profili([{ api: "RegSetValueExW", anahtar: "HKLM\\Software\\X", degerAdi: "Kurulum" }]);
    assert.equal(r.ok, true);
    assert.equal(r.details.profiller.length, 1);
    assert.equal(r.details.profiller[0].anahtar, "HKLM\\Software\\X");
    assert.equal(r.details.profiller[0].degerAdi, "Kurulum");
  });

  // Tracer args dizilimi: args[0]=anahtar, args[1]=değer adı.
  it("args diziliminden anahtar+değer adı çıkarır", () => {
    const r = rea_regset_profili([{ api: "RegSetValueExW", args: ["HKLM\\Software\\X", "Kurulum"] }]);
    assert.equal(r.ok, true);
    assert.equal(r.details.profiller[0].anahtar, "HKLM\\Software\\X");
    assert.equal(r.details.profiller[0].degerAdi, "Kurulum");
  });

  // Ham işaretçi (hex) metinden sahte ad üretilmez.
  it("işaretçiden sahte ad üretmez", () => {
    const r = rea_regset_profili([{ api: "RegSetValueExW", args: ["0x1234", "0x5678"] }]);
    assert.equal(r.ok, true);
    assert.equal(r.details.profiller[0].anahtar, "");
    assert.equal(r.details.profiller[0].degerAdi, "");
  });

  // Boş liste kapısı.
  it("boş kapı", () => {
    const r = rea_regset_profili([]);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});
