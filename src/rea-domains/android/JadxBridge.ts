// Jadx köprüsü: headless decompile (throw etmez; her başarısızlık ok:false döner).
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

// Katalog/facade ile uyumlu araç adları (rea_ prefix zorunlu).
export const JADX_TOOLS = ["rea_jadx_manifest", "rea_jadx_classes", "rea_jadx_decompile", "rea_jadx_full", "rea_jadx_methods", "rea_jadx_xrefs", "rea_jadx_read"] as const;

type Hata = { ok: false; code: "capability_unsupported"; neden: string };
const hata = (neden: string): Hata => ({ ok: false as const, code: "capability_unsupported", neden });

// ---------------------------------------------------------------- keşif ----

export interface JadxCommand {
  komut: string;
  onEkArgs: string[];
  kaynak: string;
}

// Java komutu: JAVA_HOME/bin/java (varsa) önce, yoksa PATH'teki java
// (PATH'te de yoksa spawn ENOENT verir ve koşucu bunu ok:false'a çevirir).
export function resolveJavaCommand(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  const javaHome = (env.JAVA_HOME ?? "").trim();
  if (javaHome) {
    const aday = join(javaHome, "bin", platform === "win32" ? "java.exe" : "java");
    if (existsSync(aday)) return aday;
  }
  return "java";
}

// Windows: `where jadx` çıktısındaki launcher'ın yanındaki lib/jadx-*-all.jar.
// Dağıtım düzeni bin/jadx.bat + lib/… olduğundan hem aynı dizin hem üst dizin taranır.
function windowsJarBul(): { jar: string | null; launcher: string | null } {
  try {
    const r = spawnSync("where", ["jadx"], { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    if (r.error || (r.status ?? 1) !== 0) return { jar: null, launcher: null };
    const satirlar = (r.stdout ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (const launcher of satirlar) {
      for (const kok of [dirname(launcher), join(dirname(launcher), "..")]) {
        const lib = join(kok, "lib");
        if (!existsSync(lib)) continue;
        const jar = readdirSync(lib).filter((f) => /^jadx-.*-all\.jar$/i.test(f)).sort()[0];
        if (jar) return { jar: join(lib, jar), launcher };
      }
    }
    return { jar: null, launcher: satirlar[0] ?? null };
  } catch {
    return { jar: null, launcher: null };
  }
}

// jadx keşfi (sıra): REA_JADX_JAR → REA_JADX_BIN → Windows where+jar → POSIX jadx.
// Env değişkeni tanımlıysa otoritatif sayılır: gösterdiği dosya yoksa sessizce
// başka keşfe düşülmez, null döner (bozuk yapılandırma açıkça görünsün).
export function resolveJadxCommand(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): JadxCommand | null {
  const jarEnv = (env.REA_JADX_JAR ?? "").trim();
  if (jarEnv) {
    if (!existsSync(jarEnv)) return null;
    return { komut: resolveJavaCommand(env, platform), onEkArgs: ["-jar", jarEnv], kaynak: "REA_JADX_JAR" };
  }
  const binEnv = (env.REA_JADX_BIN ?? "").trim();
  if (binEnv) {
    const yolIcerir = binEnv.includes("/") || binEnv.includes("\\");
    if (yolIcerir && !existsSync(binEnv)) return null;
    // Windows'ta .bat/.cmd doğrudan spawn edilemez; cmd.exe üstünden koşulur.
    if (platform === "win32" && /\.(bat|cmd)$/i.test(binEnv)) {
      return { komut: "cmd.exe", onEkArgs: ["/d", "/c", binEnv], kaynak: "REA_JADX_BIN" };
    }
    return { komut: binEnv, onEkArgs: [], kaynak: "REA_JADX_BIN" };
  }
  if (platform === "win32") {
    const { jar, launcher } = windowsJarBul();
    if (jar) return { komut: resolveJavaCommand(env, platform), onEkArgs: ["-jar", jar], kaynak: "where jadx + lib jar" };
    if (launcher) return { komut: "cmd.exe", onEkArgs: ["/d", "/c", launcher], kaynak: "where jadx" };
    return null;
  }
  // POSIX: launcher script PATH'te aranır (yoksa spawn ENOENT → capability_unsupported).
  return { komut: "jadx", onEkArgs: [], kaynak: "PATH" };
}

// ---------------------------------------------------------------- koşucu ---

interface JadxKosSonuc {
  ok: boolean;
  neden?: string;
  stdout: string;
  stderr: string;
}

// Ortak koşucu: asla throw etmez. spawnSync error/status/timeout ok:false
// nedenine çevrilir; neden, stderr kuyruğunu (son 500 karakter) taşır.
function jadxKos(args: string[], sureMs = 300_000): JadxKosSonuc {
  const cmd = resolveJadxCommand();
  if (!cmd) {
    return {
      ok: false,
      neden: "jadx bulunamadı (REA_JADX_JAR veya REA_JADX_BIN tanımlayın ya da jadx'i PATH'e kurun: https://github.com/skylot/jadx)",
      stdout: "",
      stderr: "",
    };
  }
  let r: SpawnSyncReturns<string>;
  try {
    r = spawnSync(cmd.komut, [...cmd.onEkArgs, ...args], {
      encoding: "utf8",
      timeout: sureMs,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (e) {
    return { ok: false, neden: `jadx başlatılamadı (${cmd.kaynak}): ${e instanceof Error ? e.message : String(e)}`, stdout: "", stderr: "" };
  }
  const stdout = typeof r.stdout === "string" ? r.stdout : "";
  const stderr = typeof r.stderr === "string" ? r.stderr : "";
  const kuyruk = (stderr.trim() || stdout.trim()).slice(-500);
  if (r.error) {
    const kod = (r.error as NodeJS.ErrnoException).code ?? "";
    if (kod === "ETIMEDOUT") return { ok: false, neden: `jadx zaman aşımı (${sureMs}ms)${kuyruk ? `: ${kuyruk}` : ""}`, stdout, stderr };
    if (kod === "ENOENT") return { ok: false, neden: `jadx/java çalıştırılamadı (ENOENT, kaynak: ${cmd.kaynak}, komut: ${cmd.komut}) — JDK ve jadx kurulumunu doğrulayın`, stdout, stderr };
    return { ok: false, neden: `jadx çalıştırma hatası: ${r.error.message}${kuyruk ? ` — ${kuyruk}` : ""}`, stdout, stderr };
  }
  if ((r.status ?? 1) !== 0) {
    return { ok: false, neden: `jadx başarısız (kod=${r.status ?? "?"})${kuyruk ? `: ${kuyruk}` : ""}`, stdout, stderr };
  }
  return { ok: true, stdout, stderr };
}

// ------------------------------------------------------------ saf yardımcılar

// Yardımcı: dizindeki tüm .java dosyalarını recursive topla (dizin yoksa boş).
function javaDosyalari(dizin: string): string[] {
  const bulunan: string[] = [];
  let girdiler;
  try {
    girdiler = readdirSync(dizin, { withFileTypes: true });
  } catch {
    return bulunan;
  }
  for (const girdi of girdiler) {
    const yol = join(dizin, girdi.name);
    if (girdi.isDirectory()) bulunan.push(...javaDosyalari(yol));
    else if (girdi.name.endsWith(".java")) bulunan.push(yol);
  }
  return bulunan;
}

// Göreli .java yolundan FQCN üret: "com/ornek/api/ApiClient.java" → "com.ornek.api.ApiClient".
export function fqcnFromRelativeJavaPath(goreliYol: string): string {
  return goreliYol.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\.java$/i, "").split("/").filter(Boolean).join(".");
}

// Çıktı dizininden FQCN listesi: "sources" alt dizini varsa kök odur
// (jadx düzeni: <out>/sources/<paket>/…), yoksa dizinin kendisi.
export function collectClassFqcns(ciktiDir: string): string[] {
  const sources = join(ciktiDir, "sources");
  const kok = existsSync(sources) ? sources : ciktiDir;
  return javaDosyalari(kok)
    .map((d) => fqcnFromRelativeJavaPath(relative(kok, d)))
    .filter(Boolean)
    .sort();
}

// AndroidManifest.xml saf ayrıştırıcısı (jadx gerektirmez, inline XML ile test edilir).
export function parseAndroidManifestXml(xml: string): { paket: string | null; izinler: string[]; aktiviteler: string[] } {
  const tekilles = (liste: string[]) => [...new Set(liste)];
  const paket = /<manifest\b[^>]*\bpackage\s*=\s*"([^"]+)"/.exec(xml)?.[1] ?? /<manifest\b[^>]*\bpackage\s*=\s*'([^']+)'/.exec(xml)?.[1] ?? null;
  const adlar = (desen: RegExp) => [...xml.matchAll(desen)].map((m) => m[1] ?? "").filter(Boolean);
  return {
    paket,
    izinler: tekilles([
      ...adlar(/<uses-permission(?:-sdk-23)?\b[^>]*\bandroid:name\s*=\s*"([^"]+)"/g),
      ...adlar(/<uses-permission(?:-sdk-23)?\b[^>]*\bandroid:name\s*=\s*'([^']+)'/g),
    ]),
    aktiviteler: tekilles([
      ...adlar(/<activity(?:-alias)?\b[^>]*\bandroid:name\s*=\s*"([^"]+)"/g),
      ...adlar(/<activity(?:-alias)?\b[^>]*\bandroid:name\s*=\s*'([^']+)'/g),
    ]),
  };
}

// Dizinde ada göre ilk dosyayı recursive bul (manifest konumu düzene göre değişir).
function dosyaBul(dizin: string, ad: string): string | null {
  let girdiler;
  try {
    girdiler = readdirSync(dizin, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const girdi of girdiler) {
    const yol = join(dizin, girdi.name);
    if (girdi.isFile() && girdi.name === ad) return yol;
    if (girdi.isDirectory()) {
      const bulunan = dosyaBul(yol, ad);
      if (bulunan) return bulunan;
    }
  }
  return null;
}

function geciciTemizle(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Temizlik hatası sonucu değiştirmez.
  }
}

// ----------------------------------------------------------------- araçlar --

// AndroidManifest.xml özeti: jadx geçici çıktıya kaynakları açar (kodsuz),
// manifest paket/izin/aktiviteleri oradan parse edilir; artıkdan sonuç üretilmez.
export function rea_jadx_manifest(apkYolu: string) {
  if (!existsSync(apkYolu)) return hata(`APK yok: ${apkYolu}`);
  let gecici: string;
  try {
    gecici = mkdtempSync(join(tmpdir(), "rea-jadx-manifest-"));
  } catch (e) {
    return hata(`Geçici dizin oluşturulamadı: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    const kos = jadxKos(["-d", gecici, "--no-src", apkYolu]);
    if (!kos.ok) return hata(kos.neden ?? "jadx çalışmadı");
    const manifestYolu = dosyaBul(gecici, "AndroidManifest.xml");
    if (!manifestYolu) return hata(`jadx çıktısında AndroidManifest.xml bulunamadı (stderr: ${kos.stderr.trim().slice(-500) || "yok"})`);
    const parsed = parseAndroidManifestXml(readFileSync(manifestYolu, "utf8"));
    if (!parsed.paket) return hata("AndroidManifest.xml içinde package özniteliği bulunamadı");
    return { ok: true as const, arac: "rea_jadx_manifest", apk: apkYolu, paket: parsed.paket, izinler: parsed.izinler, aktiviteler: parsed.aktiviteler };
  } catch (e) {
    return hata(`Manifest okunamadı: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    geciciTemizle(gecici);
  }
}

// Sınıf listesi: jadx geçici çıktıya sources üretir (kaynaksız/resource'suz koşu),
// FQCN'ler .java yollarından türetilir; sıfır sınıf başarı sayılmaz.
export function rea_jadx_classes(apkYolu: string, limit = 200) {
  if (!existsSync(apkYolu)) return hata(`APK yok: ${apkYolu}`);
  let gecici: string;
  try {
    gecici = mkdtempSync(join(tmpdir(), "rea-jadx-classes-"));
  } catch (e) {
    return hata(`Geçici dizin oluşturulamadı: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    const kos = jadxKos(["-d", gecici, "--no-res", apkYolu]);
    if (!kos.ok) return hata(kos.neden ?? "jadx çalışmadı");
    const siniflar = collectClassFqcns(gecici);
    if (siniflar.length === 0) return hata(`jadx çıktısında hiç .java üretilmedi (stderr: ${kos.stderr.trim().slice(-500) || "yok"})`);
    return { ok: true as const, arac: "rea_jadx_classes", toplam_sinif: siniflar.length, siniflar: siniflar.slice(0, limit) };
  } finally {
    geciciTemizle(gecici);
  }
}

// Tek sınıf decompile: --single-class/--single-class-output ile tek dosyaya yazar;
// dosya yoksa ya da boşsa başarı sayılmaz.
export function rea_jadx_decompile(apkYolu: string, sinif: string, ciktiDir: string) {
  if (!sinif) return hata("Sınıf adı boş");
  if (!existsSync(apkYolu)) return hata(`APK yok: ${apkYolu}`);
  const kisaAd = sinif.split(/[.$]/).filter(Boolean).pop() ?? sinif;
  const hedefDosya = join(ciktiDir, `${kisaAd}.java`);
  try {
    mkdirSync(ciktiDir, { recursive: true });
  } catch (e) {
    return hata(`Çıktı dizini oluşturulamadı: ${e instanceof Error ? e.message : String(e)}`);
  }
  let oncekiMtime = -1;
  try {
    oncekiMtime = existsSync(hedefDosya) ? statSync(hedefDosya).mtimeMs : -1;
  } catch {
    oncekiMtime = -1;
  }
  const kos = jadxKos(["--single-class", sinif, "--single-class-output", hedefDosya, apkYolu]);
  if (!kos.ok) return hata(kos.neden ?? "jadx çalışmadı");
  let boyut = 0;
  let mtime = -1;
  try {
    if (existsSync(hedefDosya)) {
      const bilgi = statSync(hedefDosya);
      boyut = bilgi.size;
      mtime = bilgi.mtimeMs;
    }
  } catch {
    boyut = 0;
    mtime = -1;
  }
  if (boyut <= 0 || (oncekiMtime >= 0 && mtime <= oncekiMtime)) return hata(`jadx ${sinif} için yeni çıktı üretmedi (dosya yok/boş/eski: ${hedefDosya}; stderr: ${kos.stderr.trim().slice(-500) || "yok"})`);
  return { ok: true as const, arac: "rea_jadx_decompile", sinif, ciktiDir, dosya: hedefDosya, bayt: boyut };
}

// Method imza deseni: erişim belirteçli bildirim satırları.
const METHOD_DESENI = /(public|private|protected) .*\(.*\)/;

// Tüm APK decompile: koşu öncesi mevcut .java kümesi snapshot'lanır; yalnız bu
// koşuda YENİ üretilen dosyalar sayılır, yeni dosya yoksa başarı sayılmaz.
export function rea_jadx_full(apkYolu: string, ciktiDir: string) {
  if (!existsSync(apkYolu)) return hata(`APK yok: ${apkYolu}`);
  const onceki = new Set(existsSync(ciktiDir) ? javaDosyalari(ciktiDir) : []);
  const kos = jadxKos(["-d", ciktiDir, apkYolu], 600_000);
  if (!kos.ok) return hata(kos.neden ?? "jadx çalışmadı");
  const yeni = javaDosyalari(ciktiDir).filter((d) => !onceki.has(d));
  if (yeni.length === 0) return hata(`jadx yeni .java üretmedi (önceden mevcut ${onceki.size} dosya sayılmadı; stderr: ${kos.stderr.trim().slice(-500) || "yok"})`);
  return { ok: true as const, arac: "rea_jadx_full", ciktiDir, java_dosya_sayisi: yeni.length };
}

// Çıktı dizinindeki method imzaları (jadx gerektirmez, salt dosya tarama).
export function rea_jadx_methods(ciktiDir: string, sinifFiltre?: string, limit = 200) {
  if (!existsSync(ciktiDir)) return hata(`Çıktı dizini yok: ${ciktiDir}`);
  const methodlar: { sinif: string; method: string }[] = [];
  for (const dosya of javaDosyalari(ciktiDir)) {
    const sinif = dosya.split(/[\\/]/).pop()?.replace(/\.java$/, "") ?? dosya;
    if (sinifFiltre && !sinif.includes(sinifFiltre) && !dosya.includes(sinifFiltre)) continue;
    for (const satir of readFileSync(dosya, "utf8").split("\n")) {
      if (METHOD_DESENI.test(satir)) {
        methodlar.push({ sinif, method: satir.trim() });
        if (methodlar.length >= limit) return { ok: true as const, arac: "rea_jadx_methods", methodlar };
      }
    }
  }
  return { ok: true as const, arac: "rea_jadx_methods", methodlar };
}

// Terim geçen satırlar: ajanın xref takibi için (dosya:satır:metin).
export function rea_jadx_xrefs(ciktiDir: string, terim: string, limit = 100) {
  if (!terim) return hata("Arama terimi boş");
  if (!existsSync(ciktiDir)) return hata(`Çıktı dizini yok: ${ciktiDir}`);
  const kayitlar: { dosya: string; satir: number; metin: string }[] = [];
  for (const dosya of javaDosyalari(ciktiDir)) {
    const satirlar = readFileSync(dosya, "utf8").split("\n");
    for (let i = 0; i < satirlar.length; i++) {
      const metin = (satirlar[i] ?? "").trim();
      if (metin.includes(terim)) {
        kayitlar.push({ dosya, satir: i + 1, metin });
        if (kayitlar.length >= limit) return { ok: true as const, arac: "rea_jadx_xrefs", kayitlar };
      }
    }
  }
  return { ok: true as const, arac: "rea_jadx_xrefs", kayitlar };
}

// Sınıfın .java dosyasını bul, ilk 400 satırını döndür (ajan okusun diye).
export function rea_jadx_read(ciktiDir: string, sinif: string) {
  if (!existsSync(ciktiDir)) return hata(`Çıktı dizini yok: ${ciktiDir}`);
  const hedef = javaDosyalari(ciktiDir).find((d) => d.endsWith(`${sinif}.java`) || d.includes(sinif));
  if (!hedef) return hata(`Sınıf bulunamadı: ${sinif}`);
  const satirlar = readFileSync(hedef, "utf8").split("\n");
  return { ok: true as const, arac: "rea_jadx_read", dosya: hedef, toplam_satir: satirlar.length, satirlar: satirlar.slice(0, 400) };
}
