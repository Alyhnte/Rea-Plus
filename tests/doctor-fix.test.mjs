// doctor-fix.test.mjs: doctor --fix TDD kapsami (Dalga F/2).
// Kos: node tests/doctor-fix.test.mjs (once `npm run build` gerekir).
// Kural: testler GERCEK kurulum/indir/calistirma yapmaz; yalniz oneri metni dogrulanir.
// Kapsar: (a) eksik arac->dogru yonetici+paket, (b) bilinmeyen aracta uydurma yok+link,
// (c) yanlis platformda yanlis yonetici yok, (d) onaysiz calistirma yok (onay kapisi),
// (e) doctor kesfiyle tutarlilik, (f) mevcut doctor davranisi bozulmadi.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixKomutu, fixUygula, platformYoneticisi } from "../dist/cli/doctor.js";

// Kok dizini test dosyasinin konumundan turet.
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
// CLI girisi: derlenmis index.js (tsc emit sonrasi var olmali).
const cli = join(kok, "dist", "cli", "index.js");
// Basit assert: kosul tutmazsa Turkce mesajla patlat.
function assert(kosul, mesaj) {
  if (!kosul) throw new Error(mesaj);
}
// CLI'yi calistir, stdout + exit kodunu birlikte dondur (--yes ASLA gecilmez).
function kos(args) {
  try {
    const out = execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    return { out, kod: 0 };
  } catch (h) {
    return { out: `${h.stdout ?? ""}${h.stderr ?? ""}`, kod: h.status ?? 1 };
  }
}

try {
  // (a) Eksik arac -> dogru yonetici + paket adi (platform basina).
  const adbWin = fixKomutu("adb", "win32");
  assert(adbWin.yonetici === "winget", "adb/win32 yonetici winget olmali");
  assert((adbWin.paket ?? "").includes("PlatformTools"), "adb/win32 paket PlatformTools olmali");
  assert((adbWin.komut ?? "").includes("winget"), "adb/win32 komut winget icermeli");
  const dotMac = fixKomutu("dot", "darwin");
  assert(dotMac.yonetici === "brew", "dot/darwin yonetici brew olmali");
  assert((dotMac.komut ?? "").includes("brew install"), "dot/darwin komut brew install icermeli");
  const dotLin = fixKomutu("dot", "linux");
  assert(dotLin.yonetici === "apt", "dot/linux yonetici apt olmali");
  assert((dotLin.komut ?? "").includes("apt install"), "dot/linux komut apt install icermeli");

  // (b) Bilinmeyen arac -> uydurma komut YOK + kaynak linki VAR.
  // (r2'nin win32'de yonetici eslemesi yoktur; katalogda gecerli url vardir.)
  const r2Win = fixKomutu("r2", "win32");
  assert(r2Win.komut === null, "r2/win32 uydurma komut vermemeli (null olmali)");
  assert(r2Win.bilinmiyor === true, "r2/win32 bilinmiyor bayragi true olmali");
  assert((r2Win.kaynak ?? "").includes("https://github.com/radareorg/radare2/releases"), "r2/win32 katalog kaynak linki vermeli");

  // (c) Yanlis platformda yanlis yonetici ONERILMEZ.
  assert(!(adbWin.komut ?? "").includes("brew"), "win32 oneride brew gecmemeli");
  assert(!(adbWin.komut ?? "").includes("apt "), "win32 oneride apt gecmemeli");
  assert(!(dotMac.komut ?? "").includes("winget"), "darwin oneride winget gecmemeli");
  assert(!(dotMac.komut ?? "").includes("apt "), "darwin oneride apt gecmemeli");
  assert(!(dotLin.komut ?? "").includes("winget"), "linux oneride winget gecmemeli");
  assert(!(dotLin.komut ?? "").includes("brew"), "linux oneride brew gecmemeli");
  assert(platformYoneticisi("win32") === "winget", "platform eslemesi win32->winget olmali");
  assert(platformYoneticisi("darwin") === "brew", "platform eslemesi darwin->brew olmali");
  assert(platformYoneticisi("linux") === "apt", "platform eslemesi linux->apt olmali");

  // (d) --fix onaysiz CALISTIRMAZ: kodda onay kapisi kilidi.
  let cagri = 0;
  const casus = () => { cagri++; };
  const oneriler = [fixKomutu("adb", "win32"), fixKomutu("dot", "win32")].filter((o) => o.komut);
  const onaysiz = fixUygula(oneriler, { kosucu: casus });
  assert(cagri === 0, "onaysiz fixUygula kosucuyu cagirmamali");
  assert(Array.isArray(onaysiz) && onaysiz.length === 0, "onaysiz fixUygula bos donmeli");
  const onayli = fixUygula(oneriler, { yes: true, kosucu: casus });
  assert(cagri === onayli.length && onayli.length === oneriler.length, "onayli fixUygula her komutu bir kez kosucuya vermeli");
  // CLI duzeyi: --fix (onaysiz) listeler, exit 0; calistirma izi yok.
  const f = kos(["doctor", "--fix", "--json"]);
  assert(f.kod === 0, "doctor --fix --json exit 0 olmali");
  const fj = JSON.parse(f.out);
  assert(fj.ok === true, "doctor --fix ok true olmali");
  assert(Array.isArray(fj.duzeltme?.oneriler), "doctor --fix duzeltme.oneriler listesi vermeli");
  assert(Array.isArray(fj.duzeltme?.calistirildi) && fj.duzeltme.calistirildi.length === 0, "onaysiz --fix calistirildi listesi bos olmali");

  // (e) doctor kesfiyle tutarlilik: fix'in eksik kumesi = doctor'un yok kumesi.
  const d = kos(["doctor", "--json"]);
  assert(d.kod === 0, "doctor --json exit 0 olmali");
  const rapor = JSON.parse(d.out);
  const yoklar = rapor.araclar.filter((a) => a.durum === "yok").map((a) => a.id).sort();
  const fixEksik = [...fj.duzeltme.oneriler.map((o) => o.id)].sort();
  assert(JSON.stringify(fixEksik) === JSON.stringify(yoklar), `fix eksik kumesi doctor yok kumesine esit olmali (doctor: ${yoklar} fix: ${fixEksik})`);

  // (f) Mevcut doctor davranisi bozulmadi: node var + katalog adresi dolu.
  const nodeSatir = rapor.araclar.find((a) => a.id === "node");
  assert(nodeSatir?.durum === "var", "doctor node satiri var olmali");
  const kataloglu = rapor.araclar.filter((a) => (a.indir ?? "") !== "");
  assert(kataloglu.length > 0, "doctor katalog adresi bos olmamali");

  console.log(`OK: doctor-fix a/b/c/d/e/f (oneriler=${fj.duzeltme.oneriler.length} yoklar=${yoklar.length})`); // kanit satiri
  process.exit(0);
} catch (hata) {
  // Hata Turkce mesajla stderr'e duser, surec 1 ile biter.
  console.error(`FAIL: ${hata instanceof Error ? hata.message : String(hata)}`);
  process.exit(1);
}
