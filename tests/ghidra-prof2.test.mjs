// tests/ghidra-prof2.test.mjs: Ghidra profesor seviye-2 (disasm/vt/trace) gercek headless testleri.
// Kos: npm run build sonrasi `node tests/ghidra-prof2.test.mjs` (her test 300sn timeout).
// Fixture: conduit/examples/target/mini_branch.elf (entry 0x400200, fonksiyon "entry", ilk op LEA).
// Not: REA_GHIDRA_DIR zorunludur (makineye ozel varsayilan yol yoktur).
// Not: .py betikler PyGhidra kipinde kosar; JDK 21 (Microsoft) JAVA_HOME'a alinir.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
// Kopru once (GHIDRA_TOOLS calisma aninda genisler), saglayici sonra.
import {
  rea_ghidra_disasm,
  rea_ghidra_vt,
  rea_ghidra_trace,
} from "../dist/rea-domains/ghidra/GhidraBridge.js";
import {
  GHIDRA_TOOLS,
  ghidraDurumu,
  java17Tamam,
} from "../dist/rea-domains/ghidra/GhidraProvider.js";

// Gercek hedef (yoksa testler acik hata verir, fail-safe stub yok).
const ELF = join(dirname(fileURLToPath(import.meta.url)), "corpus", "mini_branch.elf");
// Varsayilan kurulum dizini (env yoksa yedek).
const VARSAYILAN_DIR = ""; // varsayilan kurulum yolu yok: REA_GHIDRA_DIR tanimlayin
// JDK adayi (Ghidra 12 headless + PyGhidra icin JDK 21 sart; JRE yetmez).
const JDK_ADAYLARI = [
  "C:\\Program Files\\Microsoft\\jdk-21.0.12.101-hotspot",
  "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.12.101-hotspot",
];
// Her test 300sn (ilk analiz + PyGhidra JVM acilisi yavas olabilir).
const T300 = { timeout: 300_000 };

// Env yoksa varsayilani kur (sonraki kapilar ayni dizini gorur).
function ghidraDirCoz() {
  const envDir = (process.env.REA_GHIDRA_DIR ?? "").trim();
  if (envDir) return envDir;
  if (existsSync(VARSAYILAN_DIR)) {
    process.env.REA_GHIDRA_DIR = VARSAYILAN_DIR;
    return VARSAYILAN_DIR;
  }
  return "";
}

// JDK bul (javac.exe olan ilk dizin); headless env'e isle.
function jdkCoz() {
  for (const aday of JDK_ADAYLARI) {
    if (existsSync(join(aday, "bin", "javac.exe"))) return aday;
  }
  const cur = (process.env.JAVA_HOME ?? "").trim().replace(/[/\\]+$/, "");
  if (cur && existsSync(join(cur, "bin", "javac.exe"))) return cur;
  return "";
}

function headlessEnvHazirla() {
  ghidraDirCoz();
  const jdk = jdkCoz();
  if (jdk) {
    process.env.JAVA_HOME = jdk;
    process.env.PATH = `${join(jdk, "bin")};${process.env.PATH ?? ""}`;
  }
}

// Gercek Java ana surumu (java -version stderr yazar).
function javaAnaSurum() {
  const r = spawnSync("java", ["-version"], { encoding: "utf8", timeout: 30_000 });
  const cikti = `${r.stderr ?? ""} ${r.stdout ?? ""}`;
  const m = cikti.match(/(?:version|openjdk version) "(\d+)/);
  return m?.[1] ? parseInt(m[1], 10) : 0;
}

// Varyant ELF: .text ortasina 1 NOP sokulur (islev boyu 30->31; vt degisen yakalar).
// JZ/JMP gorecimli; ikisi de esit kaydiktan sonra ayni kalir, LEA etkilenmez.
// Sokumdan sonraki tum dosya kayar: e_shoff + sh_offset alanlari duzeltilir.
function varyantElfKur() {
  const kok = mkdtempSync(join(tmpdir(), "rea-ghidra-vt-"));
  const ham = readFileSync(ELF);
  const METIN_OFF = 0x200;
  const SOKUM = METIN_OFF + 0x0b; // CMP oncesi (MOV sonrasi)
  const parca = Buffer.concat([ham.subarray(0, SOKUM), Buffer.from([0x90]), ham.subarray(SOKUM)]);
  // .text buyudu: PT_LOAD filesz/memsz (0x60/0x68) + .text sh_size +1.
  parca.writeBigUInt64LE(parca.readBigUInt64LE(0x60) + 1n, 0x60);
  parca.writeBigUInt64LE(parca.readBigUInt64LE(0x68) + 1n, 0x68);
  // e_shoff kaydi (0x28); shdr tablosu sokumdan sonra, +1 kayar.
  const shoff = Number(parca.readBigUInt64LE(0x28)) + 1;
  parca.writeBigUInt64LE(BigInt(shoff), 0x28);
  // 4 shdr girdisi (64 bayt): sokum sonrasi sh_offset +1; .text (1. girdi) sh_size +1.
  for (let i = 0; i < 4; i++) {
    const taban = shoff + i * 64;
    if (parca.readBigUInt64LE(taban + 24) > BigInt(SOKUM)) {
      parca.writeBigUInt64LE(parca.readBigUInt64LE(taban + 24) + 1n, taban + 24);
    }
  }
  parca.writeBigUInt64LE(parca.readBigUInt64LE(shoff + 64 + 32) + 1n, shoff + 64 + 32);
  const yol = join(kok, "mini_branch_v1.elf");
  writeFileSync(yol, parca);
  return yol;
}

describe("prof2 kapilar (gercek ortam, mock yok)", () => {
  it("REA_GHIDRA_DIR + GHIDRA_TOOLS vt/trace uyeligi", T300, () => {
    headlessEnvHazirla();
    const dir = ghidraDirCoz();
    assert.ok(dir.length > 0, "REA_GHIDRA_DIR tanimli olmali (veya varsayilan kurulmali)");
    assert.ok(existsSync(dir), `dizin mevcut olmali: ${dir}`);
    const durum = ghidraDurumu();
    assert.equal(durum.tamam, true, `ghidra durumu acik olmali: ${durum.tamam ? "ok" : durum.neden}`);
    for (const ad of ["rea_ghidra_disasm", "rea_ghidra_vt", "rea_ghidra_trace"]) {
      assert.ok(
        (GHIDRA_TOOLS).includes(ad),
        `${ad} GHIDRA_TOOLS icinde olmali: ${GHIDRA_TOOLS.join(",")}`,
      );
    }
    for (const ad of GHIDRA_TOOLS) assert.ok(ad.startsWith("rea_ghidra_"), `${ad} prefixli olmali`);
  });
  it("Java 17+ gercek (JDK 21 beklenir)", T300, () => {
    headlessEnvHazirla();
    const major = javaAnaSurum();
    assert.ok(major >= 17, `Java ana surum >=17 olmali (bulunan=${major})`);
    assert.equal(java17Tamam(), true);
  });
});

describe("prof2 disasm (gercek headless, DumpDisasm.py)", () => {
  it("disasm entry hex: ilk op LEA, dal izleri", T300, () => {
    headlessEnvHazirla();
    assert.ok(existsSync(ELF), `fixture mevcut olmali: ${ELF}`);
    const r = rea_ghidra_disasm(ELF, "0x400200", 20);
    assert.equal(r.ok, true, `disasm ok olmali: ${JSON.stringify(r).slice(0, 400)}`);
    assert.ok(r.talimatlar.length >= 8, `op sayisi >=8 olmali (${r.talimatlar.length})`);
    assert.equal(r.talimatlar[0].mnemonic.toUpperCase(), "LEA");
    const birlesik = r.talimatlar.map((t) => t.mnemonic).join(" ").toUpperCase();
    for (const iz of ["LEA", "CMP", "JZ", "RET"]) {
      assert.ok(birlesik.includes(iz), `${iz} izi yok: ${birlesik.slice(0, 200)}`);
    }
    for (const t of r.talimatlar) {
      assert.ok(/^[0-9a-fA-F]*$/.test(t.bytes), `bytes hex olmali: ${t.bytes}`);
    }
  });
  it("disasm sembol cozumu: entry0 -> LEA", T300, () => {
    headlessEnvHazirla();
    // rizin tarzi "entry0" adi Ghidra "entry" fonksiyonuna cozulur.
    const r = rea_ghidra_disasm(ELF, "entry0", 10);
    assert.equal(r.ok, true, `sembol disasm ok olmali: ${JSON.stringify(r).slice(0, 400)}`);
    assert.equal(r.talimatlar[0].mnemonic.toUpperCase(), "LEA");
  });
});

describe("prof2 vt (gercek headless funcs diff)", () => {
  it("vt ayni dosya: diff bos", T300, () => {
    headlessEnvHazirla();
    const r = rea_ghidra_vt(ELF, ELF);
    assert.equal(r.ok, true, `vt ok olmali: ${JSON.stringify(r).slice(0, 400)}`);
    assert.deepEqual(r.eklenen, []);
    assert.deepEqual(r.silinen, []);
    assert.deepEqual(r.degisen, []);
    assert.deepEqual(r.ozet, { eklenen: 0, silinen: 0, degisen: 0 });
  });
  it("vt varyant: entry boy degisimi yakalanir", T300, () => {
    headlessEnvHazirla();
    const varyant = varyantElfKur();
    const r = rea_ghidra_vt(ELF, varyant);
    assert.equal(r.ok, true, `vt ok olmali: ${JSON.stringify(r).slice(0, 500)}`);
    assert.equal(r.ozet.degisen, 1, `1 degisen beklenir: ${JSON.stringify(r.degisen)}`);
    assert.equal(r.degisen[0].name, "entry");
    assert.ok(r.degisen[0].eskiBoyut !== r.degisen[0].yeniBoyut, "boyut farkli olmali");
    assert.deepEqual(r.eklenen, []);
    assert.deepEqual(r.silinen, []);
  });
});

describe("prof2 trace (gercek headless, ImportTrace.py)", () => {
  it("trace snapshot yaz-ok: tamam dogrulamali", T300, () => {
    headlessEnvHazirla();
    const d = rea_ghidra_disasm(ELF, "0x400200", 4);
    assert.equal(d.ok, true, "snapshot icin disasm ok olmali");
    const snap = {};
    for (const t of d.talimatlar) snap[`0x${t.addr}`] = t.bytes;
    assert.ok(Object.keys(snap).length >= 4);
    const r = rea_ghidra_trace(ELF, JSON.stringify(snap));
    assert.equal(r.ok, true, `trace ok olmali: ${JSON.stringify(r).slice(0, 500)}`);
    assert.equal(r.sonuc.tamam, true);
    assert.ok(r.sonuc.yazilan > 0);
    assert.equal(r.sonuc.adresSayisi, Object.keys(snap).length);
    for (const a of Object.keys(snap)) assert.equal(r.sonuc.dogrulama[a], true, `${a} dogrulanmali`);
  });
  it("trace dosya yolu + gecersiz snapshot kapisi", T300, () => {
    headlessEnvHazirla();
    const kok = mkdtempSync(join(tmpdir(), "rea-ghidra-tr-"));
    const yol = join(kok, "snap.json");
    writeFileSync(yol, JSON.stringify({ "0x400200": "488d05f9000000" }), "utf8");
    const r = rea_ghidra_trace(ELF, yol);
    assert.equal(r.ok, true, `dosya yolu trace ok olmali: ${JSON.stringify(r).slice(0, 400)}`);
    assert.equal(r.sonuc.tamam, true);
    const kotu = rea_ghidra_trace(ELF, JSON.stringify({ "0x400200": "ZZ" }));
    assert.equal(kotu.ok, false);
    assert.equal(kotu.code, "capability_unsupported");
  });
});

describe("prof2 kapi hatalari (headless kosmaz)", () => {
  it("olmayan hedef capability_unsupported", T300, () => {
    headlessEnvHazirla();
    const yok = "C:\\yok\\boyle-bir-dosya.elf";
    assert.equal(rea_ghidra_disasm(yok, "0x400200").ok, false);
    assert.equal(rea_ghidra_vt(yok, ELF).ok, false);
    assert.equal(rea_ghidra_trace(yok, JSON.stringify({ "0x400200": "90" })).ok, false);
  });
});
