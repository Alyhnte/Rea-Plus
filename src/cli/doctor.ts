// cli/doctor: prerequisites raporu (node/r2/dot/java/adb/wabt/playwright)
// mergedCatalog indirme adresleri için tek kaynaktır, indirme yapmaz.
import { spawnSync } from "node:child_process";
import { mergedCatalog } from "../facade/catalogMerge.js";

// Tek satır rapor tipi: CLI tablo ya da JSON basar.
export interface DoctorSatir {
  id: string;
  ad: string;
  durum: "var" | "yok";
  surum: string | null;
  indir: string;
}

// Komutu kısa timeout ile dene, çıktının ilk satırını döndür.
function surumDene(cmd: string, args: string[]): string | null {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 8000, windowsHide: true });
    const out = `${r.stdout ?? ""} ${r.stderr ?? ""}`.trim().split("\n")[0]?.trim() ?? "";
    return r.status === 0 && out ? out.slice(0, 120) : r.status === 0 ? "kurulu" : null;
  } catch {
    return null;
  }
}

// --- doctor --fix: eksik araç için onaylı kurulum komutu ÖNERİSİ ---
// Testler GERÇEK kurulum yapmaz; bu modül yalnız öneri metni üretir.
// Çalıştırma yolu fixUygula'daki ONAY (yes) kapısına bağlıdır.

export type FixYonetici = "winget" | "brew" | "apt" | "npm";

// Tek araç + tek platform için öneri. Eslemesi yoksa komut null döner:
// uydurma komut YOK, katalogdaki kaynak linki verilir.
export interface FixOneri {
  id: string;
  ad: string;
  yonetici: FixYonetici | null;
  paket: string | null;
  komut: string | null;
  kaynak: string;
  bilinmiyor: boolean;
}

// Platform -> önerilen yönetici. Tanınmayan platformda null (yanlış öneri yok).
export function platformYoneticisi(platform: string): "winget" | "brew" | "apt" | null {
  if (platform === "win32") return "winget";
  if (platform === "darwin") return "brew";
  if (platform === "linux") return "apt";
  return null;
}

interface FixEsleme {
  ad: string;
  win32?: { paket: string; komut: string };
  darwin?: { paket: string; komut: string };
  linux?: { paket: string; komut: string };
  // Platformdan bağımsız öneri (örn. npm): her platformda aynen verilir.
  genel?: { yonetici: FixYonetici; paket: string; komut: string };
}

// Araç başına doğru paket adı + yönetici. Kaynaklar:
// - adb/win32 Google.PlatformTools: katalog nereye alanıyla aynı (catalogMerge).
// - playwright: katalog nereye alanıyla aynı (npm + npx chromium).
// - wabt/r2 win32: resmi yönetici paketi yok -> esleme YOK (bilinmiyor + link).
const FIX_ESLEME: Record<string, FixEsleme> = {
  node: {
    ad: "Node",
    win32: { paket: "OpenJS.NodeJS.LTS", komut: "winget install -e --id OpenJS.NodeJS.LTS" },
    darwin: { paket: "node", komut: "brew install node" },
    linux: { paket: "nodejs", komut: "sudo apt install -y nodejs" },
  },
  r2: {
    ad: "radare2",
    darwin: { paket: "radare2", komut: "brew install radare2" },
    linux: { paket: "radare2", komut: "sudo apt install -y radare2" },
  },
  dot: {
    ad: "Graphviz",
    win32: { paket: "Graphviz.Graphviz", komut: "winget install -e --id Graphviz.Graphviz" },
    darwin: { paket: "graphviz", komut: "brew install graphviz" },
    linux: { paket: "graphviz", komut: "sudo apt install -y graphviz" },
  },
  java: {
    ad: "Java",
    win32: { paket: "Microsoft.OpenJDK.17", komut: "winget install -e --id Microsoft.OpenJDK.17" },
    darwin: { paket: "openjdk@17", komut: "brew install openjdk@17" },
    linux: { paket: "default-jre", komut: "sudo apt install -y default-jre" },
  },
  adb: {
    ad: "ADB",
    win32: { paket: "Google.PlatformTools", komut: "winget install -e --id Google.PlatformTools" },
    darwin: { paket: "android-platform-tools", komut: "brew install --cask android-platform-tools" },
    linux: { paket: "android-tools-adb", komut: "sudo apt install -y android-tools-adb" },
  },
  wabt: {
    ad: "WABT",
    darwin: { paket: "wabt", komut: "brew install wabt" },
    linux: { paket: "wabt", komut: "sudo apt install -y wabt" },
  },
  playwright: {
    ad: "Playwright",
    genel: { yonetici: "npm", paket: "playwright", komut: "npm i -D playwright && npx playwright install chromium" },
  },
};

// Araç id + platform -> öneri. Aynı platformda yalnız o platformun yöneticisi döner.
export function fixKomutu(id: string, platform: string = process.platform): FixOneri {
  const e = FIX_ESLEME[id];
  const kaynak = satirKatalogUrl(id);
  if (!e) return { id, ad: id, yonetici: null, paket: null, komut: null, kaynak, bilinmiyor: true };
  if (e.genel) return { id, ad: e.ad, yonetici: e.genel.yonetici, paket: e.genel.paket, komut: e.genel.komut, kaynak, bilinmiyor: false };
  const yonetici = platformYoneticisi(platform);
  const giris = platform === "win32" ? e.win32 : platform === "darwin" ? e.darwin : platform === "linux" ? e.linux : undefined;
  if (!yonetici || !giris) return { id, ad: e.ad, yonetici: null, paket: null, komut: null, kaynak, bilinmiyor: true };
  return { id, ad: e.ad, yonetici, paket: giris.paket, komut: giris.komut, kaynak, bilinmiyor: false };
}

// Onay kapısı: yes YOKSA koşucu ASLA çağrılmaz, boş liste döner.
// yes VARSA yalnız komutlu öneriler sırayla koşucuya verilir, gerçek koşum arayendedir.
export function fixUygula(oneriler: FixOneri[], opts?: { yes?: boolean; kosucu?: (komut: string) => void }): string[] {
  if (!opts?.yes || !opts?.kosucu) return [];
  const calistirildi: string[] = [];
  for (const o of oneriler) {
    if (!o.komut) continue;
    opts.kosucu(o.komut);
    calistirildi.push(o.komut);
  }
  return calistirildi;
}

// Doctor satır id -> katalog id eşlemesi (TEK KAYNAK: rapor indir alanı da
// fix kaynak linki de buradan beslenir).
const SATIR_KATALOG: Record<string, string> = {
  node: "frida",
  r2: "radare2",
  dot: "graphviz",
  java: "jadx",
  adb: "apktool",
  wabt: "wabt",
  playwright: "",
};

// mergedCatalog içinden indirme adresi bul, yoksa boş dön.
function katalogUrl(id: string): string {
  const e = mergedCatalog().find((c) => c.id === id);
  return e ? `${e.ad}: ${e.url} (${e.nereye})` : "";
}

// Satır id'sinden katalog adresi (eşleme tablosu üzerinden).
function satirKatalogUrl(satirId: string): string {
  const kid = SATIR_KATALOG[satirId] ?? satirId;
  return kid ? katalogUrl(kid) : "";
}

// Keşif mantığı TEK KAYNAKTIR: rapor da fix de bu satırları kullanır
// (iki ayrı doğruluk olmaz — doctor ne görüyorsa fix onu önerir).
export function doctorKesfet(): DoctorSatir[] {
  const satirlar: DoctorSatir[] = [
    { id: "node", ad: "Node", durum: "var", surum: process.version, indir: satirKatalogUrl("node") },
    { id: "r2", ad: "radare2", durum: "yok", surum: null, indir: satirKatalogUrl("r2") },
    { id: "dot", ad: "Graphviz", durum: "yok", surum: null, indir: satirKatalogUrl("dot") },
    { id: "java", ad: "Java", durum: "yok", surum: null, indir: satirKatalogUrl("java") },
    { id: "adb", ad: "ADB", durum: "yok", surum: null, indir: satirKatalogUrl("adb") },
    { id: "wabt", ad: "WABT", durum: "yok", surum: null, indir: satirKatalogUrl("wabt") },
    { id: "playwright", ad: "Playwright", durum: "yok", surum: null, indir: satirKatalogUrl("playwright") },
  ];
  const prob: Array<[string, string, string[]]> = [
    ["r2", "r2", ["-v"]],
    ["dot", "dot", ["-V"]],
    ["java", "java", ["-version"]],
    ["adb", "adb", ["version"]],
    ["wabt", "wasm2wat", ["--version"]],
    ["playwright", "npx", ["playwright", "--version"]],
  ];
  for (const [id, cmd, args] of prob) {
    const row = satirlar.find((s) => s.id === id);
    if (!row) continue;
    const v = surumDene(cmd, args);
    if (v) {
      row.durum = "var";
      row.surum = v;
    }
  }
  return satirlar;
}

// Yedi aracı yokla: node sürümü process'ten, gerisi PATH'ten.
// fix=true: eksik araçlara kurulum komutu ÖNERİR (çalıştırmaz; çalıştırma
// yalnız yes + koşucu ile fixUygula kapısından geçer).
export function runDoctorCommand(
  json: boolean,
  opts?: { fix?: boolean; yes?: boolean; platform?: string; kosucu?: (komut: string) => void },
): void {
  const satirlar = doctorKesfet();
  if (!opts?.fix) {
    if (json) console.log(JSON.stringify({ ok: true, araclar: satirlar }, null, 2));
    else for (const s of satirlar) console.log(`${s.durum === "var" ? "[+]" : "[-]"} ${s.ad}: ${s.surum ?? "yok"} ${s.durum === "yok" && s.indir ? `-> ${s.indir}` : ""}`);
    return;
  }
  const platform = opts.platform ?? process.platform;
  const oneriler = satirlar.filter((s) => s.durum === "yok").map((s) => fixKomutu(s.id, platform));
  const calistirildi = fixUygula(oneriler, opts);
  const not = opts.yes
    ? "onay verildi: önerilen komutlar koşucuya verildi"
    : "onay yok: komutlar ÇALIŞTIRILMADI, yalnız listelendi (--fix --yes ile onayla)";
  if (json) console.log(JSON.stringify({ ok: true, araclar: satirlar, duzeltme: { oneriler, calistirildi, not } }, null, 2));
  else {
    for (const s of satirlar) console.log(`${s.durum === "var" ? "[+]" : "[-]"} ${s.ad}: ${s.surum ?? "yok"} ${s.durum === "yok" && s.indir ? `-> ${s.indir}` : ""}`);
    for (const o of oneriler) console.log(o.komut ? `[*] ${o.ad}: ${o.komut}` : `[*] ${o.ad}: kurulum komutu bilinmiyor${o.kaynak ? ` -> ${o.kaynak}` : ""}`);
    console.log(`not: ${not}`);
  }
}
