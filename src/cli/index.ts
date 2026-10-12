#!/usr/bin/env node
// cli: rea-plus komut satırı (analyze-evm/wasm/js + flutter/apple/hap/pe/go/wasm2 + doctor)
// --json bayrağı her komutta JSON çıktı verir, bin eklemez.
import { existsSync, readFileSync } from "node:fs";
import { runDoctorCommand } from "./doctor.js";
import { runEvmCommand } from "./evm.js";
import { runJsCommand } from "./js.js";
import { runWasmCommand } from "./wasm.js";
import { rea_flutter_scan, rea_flutter_payload } from "../rea-domains/flutter/Flutter.js";
import { rea_apple_macho, rea_apple_plist, rea_apple_bundle } from "../rea-domains/apple/Apple.js";
import { rea_hap_liste, rea_hap_manifest } from "../rea-domains/harmony/Harmony.js";
import { rea_pe_info, rea_pe_imports, rea_pe_sections } from "../rea-domains/winpe/PeReader.js";
import { rea_go_pclntab, rea_go_vendor } from "../rea-domains/wasm-evm/GoPwnBridge.js";
import { rea_wasm_sections, rea_wasm_imports } from "../rea-domains/wasm-evm/WasmInfo.js";

// Desteklenen komutlar: analiz üçlüsü + yeni altılı + ortam raporu.
const KOMUTLAR = [
  "analyze-evm",
  "analyze-wasm",
  "analyze-js",
  "analyze-flutter",
  "analyze-apple",
  "analyze-hap",
  "analyze-pe",
  "analyze-go",
  "analyze-wasm2",
  "doctor",
] as const;
type Komut = (typeof KOMUTLAR)[number];

// Köprü hatasını tek mesaja indir: reason (yeni) ya da neden (eski) alanı.
function kopruHata(r: { reason?: string; neden?: string }): string {
  return r.reason ?? r.neden ?? "bilinmiyor";
}

// Kullanım metni: arg yoksa ya da bilinmeyen komutta basılır.
function kullanim(): void {
  console.log("kullanım: rea-plus <komut> [args] [--json]");
  console.log("  analyze-evm <\"sig\">        imza -> selector");
  console.log("  analyze-wasm <dosya>       export listesi + decode kapısı");
  console.log("  analyze-js <bundle> [map]  sourcemap/bundle özeti");
  console.log("  analyze-flutter <lib.so>   Dart snapshot + engine izleri");
  console.log("  analyze-apple <yol>        macho/plist/bundle sırayla dene");
  console.log("  analyze-hap <dosya.hap>    zip liste + config.json manifest");
  console.log("  analyze-pe <dosya.exe>     machine/import/section özeti");
  console.log("  analyze-go <dosya>         pclntab + vendor yol listesi");
  console.log("  analyze-wasm2 <dosya>      section/import tablosu (saf TS)");
  console.log("  doctor                     prerequisites raporu");
}

// Flutter komutu: ELF Dart taraması + yük izleri (offline, yürütme yok).
function runFlutterCommand(args: string[], json: boolean): void {
  // İlk arg dosya yoludur, boşsa kullanımı basıp çık.
  const yol = args[0] ?? "";
  if (!yol) {
    const msg = "kullanım: analyze-flutter <libapp.so|libflutter.so> [--json]";
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(msg);
    process.exitCode = 1;
    return;
  }
  // İki köprüyü de koş: scan kapıdan dönerse payload denenmez.
  const tara = rea_flutter_scan(yol);
  if (!tara.ok) {
    const msg = kopruHata(tara);
    if (json) console.log(JSON.stringify({ ok: false, code: tara.code, reason: msg, path: yol }));
    else console.error(`hata: ${msg}`);
    process.exitCode = 1;
    return;
  }
  // Payload opsiyoneldir: iz yoksa boş liste ver, komut yine ok döner.
  const yuk = rea_flutter_payload(yol);
  const izler = yuk.ok ? yuk.izler : [];
  if (json) {
    console.log(
      JSON.stringify({ ok: true, path: yol, tur: tara.tur, dartMi: tara.dartMi, buildId: tara.buildId, motor: tara.motor, izler, summary: tara.summary })
    );
  } else {
    console.log(`dosya: ${yol}`);
    console.log(`özet: ${tara.summary}`);
    console.log(`tur: ${tara.tur} build-id: ${tara.buildId ?? "-"} motor: ${tara.motor ?? "-"}`);
    console.log(`izler (${izler.length}): ${izler.join(", ") || "-"}`);
  }
}

// Apple komutu: macho -> plist -> bundle sırayla dene, ilk ok'u raporla.
function runAppleCommand(args: string[], json: boolean): void {
  // Tek yol argümanı: dosya (macho/plist) ya da .app dizini olabilir.
  const yol = args[0] ?? "";
  if (!yol) {
    const msg = "kullanım: analyze-apple <dosya|dizin> [--json]";
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(msg);
    process.exitCode = 1;
    return;
  }
  // Sıralı deneme: her köprü kendi kapısını bilir, ilk ok kazanır.
  const adaylar = [rea_apple_macho(yol), rea_apple_plist(yol), rea_apple_bundle(yol)];
  const secilen = adaylar.find((a) => a.ok);
  if (!secilen || !secilen.ok) {
    const son = adaylar[adaylar.length - 1];
    const msg = son && !son.ok ? kopruHata(son) : "apple izi yok";
    if (json) console.log(JSON.stringify({ ok: false, code: "capability_unsupported", reason: msg, path: yol }));
    else console.error(`hata: ${msg}`);
    process.exitCode = 1;
    return;
  }
  if (json) console.log(JSON.stringify({ ok: true, path: yol, tool: secilen.tool, summary: secilen.summary, details: secilen.details }));
  else {
    console.log(`yol: ${yol}`);
    console.log(`araç: ${secilen.tool}`);
    console.log(`özet: ${secilen.summary}`);
  }
}

// HAP komutu: zip liste zorunlu, manifest opsiyonel (config.json/module.json).
function runHapCommand(args: string[], json: boolean): void {
  // HAP dosyası zip imzalı olmalı, kapı köprüde tutulur.
  const yol = args[0] ?? "";
  if (!yol) {
    const msg = "kullanım: analyze-hap <dosya.hap> [--json]";
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(msg);
    process.exitCode = 1;
    return;
  }
  const liste = rea_hap_liste(yol);
  if (!liste.ok) {
    const msg = kopruHata(liste);
    if (json) console.log(JSON.stringify({ ok: false, code: liste.code, reason: msg, path: yol }));
    else console.error(`hata: ${msg}`);
    process.exitCode = 1;
    return;
  }
  // Manifest yoksa null basılır, liste başarısı bozulmaz.
  const man = rea_hap_manifest(yol);
  const manifest = man.ok ? { kaynak: man.kaynak, bundleName: man.bundleName, version: man.version } : null;
  if (json) console.log(JSON.stringify({ ok: true, path: yol, sayi: liste.sayi, dosyalar: liste.dosyalar, manifest }));
  else {
    console.log(`dosya: ${yol}`);
    console.log(`girdi (${liste.sayi}): ${liste.dosyalar.slice(0, 20).join(", ") || "-"}`);
    console.log(manifest ? `manifest: ${manifest.bundleName} ${manifest.version} (${manifest.kaynak})` : "manifest: yok");
  }
}

// PE komutu: info zorunlu, imports/sections tablosu eklenir (salt-okunur).
function runPeCommand(args: string[], json: boolean): void {
  // PE yolu MZ imzalı olmalı, yoksa köprü unsupported döner.
  const yol = args[0] ?? "";
  if (!yol) {
    const msg = "kullanım: analyze-pe <dosya.exe> [--json]";
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(msg);
    process.exitCode = 1;
    return;
  }
  const bilgi = rea_pe_info(yol);
  if (!bilgi.ok) {
    const msg = kopruHata(bilgi);
    if (json) console.log(JSON.stringify({ ok: false, code: bilgi.code, reason: msg, path: yol }));
    else console.error(`hata: ${msg}`);
    process.exitCode = 1;
    return;
  }
  // Import/section köprüleri de kapı dönebilir, boş listeye indirgenir.
  const imp = rea_pe_imports(yol);
  const sec = rea_pe_sections(yol);
  const dlls = imp.ok ? imp.dlls : [];
  const fonksiyonlar = imp.ok ? imp.fonksiyonlar : [];
  const bolumler = sec.ok ? sec.bolumler : [];
  if (json) {
    console.log(
      JSON.stringify({
        ok: true,
        path: yol,
        machine: bilgi.machine,
        machine_hex: bilgi.machine_hex,
        bit: bilgi.bit,
        section_sayisi: bilgi.section_sayisi,
        entry: bilgi.entry,
        entry_hex: bilgi.entry_hex,
        dlls,
        fonksiyonlar,
        bolumler,
      })
    );
  } else {
    console.log(`dosya: ${yol}`);
    console.log(`machine: ${bilgi.machine_hex} bit: ${bilgi.bit} sections: ${bilgi.section_sayisi} entry: ${bilgi.entry_hex}`);
    console.log(`dll (${dlls.length}): ${dlls.join(", ") || "-"}`);
    console.log(`fonksiyon (${fonksiyonlar.length}): ${fonksiyonlar.slice(0, 10).join(", ") || "-"}`);
  }
}

// Go komutu: pclntab + vendor birlikte raporlanır (tamamen offline).
function runGoCommand(args: string[], json: boolean): void {
  // Dosya metin/binary olabilir, Go izleri latin1 taramasıyla bulunur.
  const yol = args[0] ?? "";
  if (!yol) {
    const msg = "kullanım: analyze-go <dosya> [--json]";
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(msg);
    process.exitCode = 1;
    return;
  }
  const tablo = rea_go_pclntab(yol);
  const vendor = rea_go_vendor(yol);
  // İkisi de kapıysa Go izi yoktur, ilk hatayı raporla.
  if (!tablo.ok && !vendor.ok) {
    const msg = kopruHata(tablo);
    if (json) console.log(JSON.stringify({ ok: false, code: tablo.code, reason: msg, path: yol }));
    else console.error(`hata: ${msg}`);
    process.exitCode = 1;
    return;
  }
  if (json) {
    console.log(
      JSON.stringify({
        ok: true,
        path: yol,
        pclntab: tablo.ok ? { summary: tablo.summary, details: tablo.details } : null,
        vendor: vendor.ok ? { summary: vendor.summary, details: vendor.details } : null,
        summary: tablo.ok ? tablo.summary : vendor.ok ? vendor.summary : "?",
      })
    );
  } else {
    console.log(`dosya: ${yol}`);
    console.log(`pclntab: ${tablo.ok ? tablo.summary : `yok (${kopruHata(tablo)})`}`);
    console.log(`vendor: ${vendor.ok ? vendor.summary : `yok (${kopruHata(vendor)})`}`);
  }
}

// WASM2 komutu: saf TS section parser (wabt gerekmez, base64 ya da dosya).
function runWasm2Command(args: string[], json: boolean): void {
  // Arg ya dosya yolu ya da ham base64 modüldür.
  const girdi = args[0] ?? "";
  if (!girdi) {
    const msg = "kullanım: analyze-wasm2 <dosya.wasm|base64> [--json]";
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(msg);
    process.exitCode = 1;
    return;
  }
  // Dosya varsa baytları base64'e çevir, yoksa girdiyi base64 say.
  let b64 = girdi;
  try {
    if (existsSync(girdi)) b64 = readFileSync(girdi).toString("base64");
  } catch {
    b64 = girdi;
  }
  const secs = rea_wasm_sections(b64);
  if (!secs.ok) {
    if (json) console.log(JSON.stringify({ ok: false, code: secs.code, reason: secs.reason, path: girdi }));
    else console.error(`hata: ${secs.reason}`);
    process.exitCode = 1;
    return;
  }
  // Import tablosu opsiyoneldir: yoksa null basılır.
  const imps = rea_wasm_imports(b64);
  const secDet = secs.details as { sections?: unknown; exports?: unknown };
  if (json) {
    console.log(
      JSON.stringify({
        ok: true,
        path: girdi,
        summary: secs.summary,
        sections: secDet.sections ?? [],
        exports: secDet.exports ?? [],
        imports: imps.ok ? (imps.details as { imports?: unknown }).imports ?? [] : [],
      })
    );
  } else {
    console.log(`girdi: ${girdi}`);
    console.log(`özet: ${secs.summary}`);
  }
}

// Bayrakları ayıkla: --json global, kalanı komut + args.
function main(): void {
  const ham = process.argv.slice(2);
  const json = ham.includes("--json");
  const temiz = ham.filter((a) => a !== "--json");
  const komut = temiz[0] as Komut | undefined;
  const args = temiz.slice(1);
  if (!komut || !KOMUTLAR.includes(komut)) {
    kullanim();
    process.exitCode = 1;
    return;
  }
  if (komut === "analyze-evm") runEvmCommand(args, json);
  else if (komut === "analyze-wasm") runWasmCommand(args, json);
  else if (komut === "analyze-js") runJsCommand(args, json);
  else if (komut === "analyze-flutter") runFlutterCommand(args, json);
  else if (komut === "analyze-apple") runAppleCommand(args, json);
  else if (komut === "analyze-hap") runHapCommand(args, json);
  else if (komut === "analyze-pe") runPeCommand(args, json);
  else if (komut === "analyze-go") runGoCommand(args, json);
  else if (komut === "analyze-wasm2") runWasm2Command(args, json);
  else runDoctorCommand(json);
}

// Doğrudan çalışınca başlat (import edilirse sessiz kalır).
main();
