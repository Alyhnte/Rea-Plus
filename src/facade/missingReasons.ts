// rea-plus facade: eksik araç nedeni (saf tablo + saf fonksiyon).
// url + nereye bilgileri catalogMerge.ts ve conduit catalog'dan alındı.
interface KurulumBilgisi {
  win32: string; // winget komutu
  linux: string; // apt komutu
  darwin: string; // brew komutu
  neden: string; // nereye + url içerir
  alternatif?: string; // FALLBACKS ile tutarlı yedek ad
}
export const INSTALL_CMDS: Readonly<Record<string, KurulumBilgisi>> = {
  // adb: Android hedefler için PATH'te olmalı.
  adb: { win32: "winget install Google.PlatformTools", linux: "sudo apt install android-tools-adb", darwin: "brew install android-platform-tools", neden: "Android hedef için adb PATH'te olmalı — https://developer.android.com/tools/releases/platform-tools" },
  // jadx: headless jadx + full JDK ister.
  jadx: { win32: "winget install Skylot.jadx", linux: "sudo apt install jadx", darwin: "brew install jadx", neden: "headless jadx + full JDK, PATH — https://github.com/skylot/jadx", alternatif: "apktool" },
  // wabt: paket yöneticisinde yok, releases URL'sinden kurulur.
  wabt: { win32: "https://github.com/WebAssembly/wabt/releases adresinden wabt 1.0.42 indir", linux: "https://github.com/WebAssembly/wabt/releases adresinden wabt 1.0.42 indir", darwin: "brew install wabt", neden: "wabt 1.0.42, PATH — https://github.com/WebAssembly/wabt" },
  // java: Ghidra için Java 17+ gerekir.
  java: { win32: "winget install EclipseAdoptium.Temurin.17.JRE", linux: "sudo apt install temurin-17-jre", darwin: "brew install --cask temurin@17", neden: "REA_GHIDRA_DIR için Java 17+ gerekir — https://adoptium.net/temurin/releases" },
  // r2: conduit zorunlu aracı, release paketi PATH'e konur.
  r2: { win32: "winget install radare2", linux: "sudo apt install radare2", darwin: "brew install radare2", neden: "Hazır derlenmiş sürümü PATH'e koy — https://github.com/radareorg/radare2/releases" },
  // dot: graphviz CFG resmi için gerekir.
  dot: { win32: "winget install Graphviz.Graphviz", linux: "sudo apt install graphviz", darwin: "brew install graphviz", neden: "dot PATH'te olmalı (dot.exe) — https://graphviz.org/download/" },
};
export interface EksikNedeni { eksik: string; kur: string; neden: string; alternatif?: string }
// Eksik araç için platforma uygun kur komutu ve Türkçe neden döner.
// Bilinmeyen platform linux sayılır, bilinmeyen araç boş kur ile döner.
export function missingReason(eksik: string, platform: string): EksikNedeni {
  // Tablo dışı ad için güvenli varsayılan (stub değil, açık yok hükmü).
  const bilgi = INSTALL_CMDS[eksik];
  if (bilgi === undefined) return { eksik, kur: "", neden: `bilinmeyen araç: ${eksik}`, alternatif: undefined };
  // win32/darwin dışındaki her şey linux koluna düşer (linux, freebsd vb.).
  const kur = platform === "win32" ? bilgi.win32 : platform === "darwin" ? bilgi.darwin : bilgi.linux;
  return { eksik, kur, neden: bilgi.neden, alternatif: bilgi.alternatif };
}
