// REA_WORKSPACE_ROOT: rea_* yol parametrelerini handler oncesi kok icinde tutar.
// Tanimli degilse hicbir seye dokunulmaz; tanimliyken her yol mutlak + realpath kanitli dondurulur.
// KAPSAM: merkezi kayittaki rea_* argumanlari + conduit open_target/debug_open path'i
// (conduit handler'lari motor cagrisindan once ayni applyWorkspaceRoot'u kosar; bagimsiz
// conduit server da ayni registerTools'u kullandigindan o da kapsanir) + kullanici gorunur
// turev yazmalar (rea_unpack_try ".unpacked", rea_firmware_extract ".extracted",
// rea_net_capture HAR ciktisi).
// ACIK ISTISNA (bu dilimde kok icine zorlanmaz): operator temp/cache yuzeyleri — browser
// artifacts dizini (REA_ARTIFACTS env), Ghidra tmp proje/girdi dizinleri, hopper tmp istek
// dosyasi, apktool framework cache'i. Bunlar operatorun env/cache secimidir, tasinmaz.
import { existsSync, realpathSync } from "node:fs";
import { delimiter, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { getClientRoots, intersectRoots, isRootsOptIn } from "./roots.js";

export class WorkspaceRootError extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "WorkspaceRootError";
  }
}

export type WorkspacePathKind = "read" | "dir" | "write";

// Dizin bekleyen path parametreli araclar; digerlerinde path dosya okumadir.
export const DIRECTORY_PATH_TOOLS: ReadonlySet<string> = new Set([
  "rea_apple_bundle",
  "rea_fs_snapshot",
  "rea_js_require",
  "rea_scan_repo",
]);

// Bu araclar bilincli olarak kok sinirinin disinda birakilir.
export const WORKSPACE_SKIP_TOOLS: ReadonlySet<string> = new Set([
  "rea_managed_import",
  "rea_managed_verify",
  "rea_firmware_handoff",
  "rea_pwn_elf_layout",
]);

// Parametre -> sinif eslemesi; cmd/url/sinif gibi alanlar listede olmadigindan degismez.
// kayit ayrica ele alinir (JSON ise dokunulmaz, mevcut dosya ise okuma kurali).
function paramKind(tool: string, key: string): WorkspacePathKind | null {
  switch (key) {
    case "path":
      return DIRECTORY_PATH_TOOLS.has(tool) ? "dir" : "read";
    case "apk_path":
    case "eski":
    case "yeni":
      return "read";
    case "dir":
      return "dir";
    case "out":
      return "write";
    default:
      return null;
  }
}

// Kok listesi: delimiter ile ayrilir, cwd'ye cozulur, varsa realpath ile kanoniklesir.
// Bos/tanimsiz deger siniri kapatir (eski davranis aynen korunur).
// Roots pilotu (REA_ROOTS=1): depodaki istemci kokleri env kokleriyle kesistirilir;
// env sert sinirdir — genisletme kirpilir, ayrik istemci koku siniri kaldirmaz
// (kesisim bosken env kokleri aynen kalir). Opt-in kapaliyken depo hic okunmaz.
export function getWorkspaceRoots(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string[] {
  const ham = env.REA_WORKSPACE_ROOT;
  const envKokler: string[] = [];
  if (ham) {
    for (const parca of ham.split(delimiter)) {
      const p = parca.trim();
      if (!p) continue;
      const mutlak = resolve(cwd, p);
      envKokler.push(deneyselGercek(mutlak) ?? mutlak);
    }
  }
  if (!isRootsOptIn(env)) return envKokler;
  const istemciKokler = getClientRoots();
  if (istemciKokler.length === 0) return envKokler;
  const { effective } = intersectRoots(envKokler, istemciKokler);
  if (envKokler.length > 0 && effective.length === 0) return envKokler;
  return effective;
}

function deneyselGercek(p: string): string | null {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
}

// Ham girdinin bicimi (resolve duzlestirmeden once): cihaz ve UNC reddi buna bakar.
function hamBicim(p: string): "cihaz" | "unc" | "surucu" | "surucu-goreli" | "goreli" {
  const s = p.replace(/\//g, "\\");
  if (/^\\\\[?.]\\/.test(s)) return "cihaz";
  if (s.startsWith("\\\\")) return "unc";
  if (/^[A-Za-z]:(?![\\/])/.test(s)) return "surucu-goreli";
  if (/^[A-Za-z]:/.test(s)) return "surucu";
  return "goreli";
}

const WINDOWS_AYRILMIS_ADLAR = new Set(["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"]);

// Windows'ta ADS (segment icinde ':') ve ayrilmis cihaz adlari kok icinde gorunse bile
// gercek dosya kimligini degistirebilir; kok tanimliyken kabul edilmez.
function windowsGecersizSegment(p: string): boolean {
  if (process.platform !== "win32") return false;
  let kalan = p.replace(/\//g, "\\");
  kalan = kalan.replace(/^\\\\[^\\]+\\[^\\]+\\?/, "").replace(/^[A-Za-z]:\\?/, "");
  for (const segment of kalan.split("\\")) {
    if (!segment || segment === "." || segment === "..") continue;
    if (segment.includes(":")) return true;
    const taban = (segment.replace(/[. ]+$/, "").split(".")[0] ?? "").toUpperCase();
    if (WINDOWS_AYRILMIS_ADLAR.has(taban)) return true;
  }
  return false;
}

function yerelSurucuMu(kok: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(kok) || kok.startsWith(sep);
}

// Adayin en yakin mevcut ebeveyni (kendisi dahil) realpath'le cozulur, kalan parca eklenir.
// Boylece junction/symlink kacisi sanal prefix'le degil gercek hedefle yakalanir.
function gercekKanitli(mutlak: string): string {
  let su = mutlak;
  const kalan: string[] = [];
  for (;;) {
    const gercek = deneyselGercek(su);
    if (gercek !== null) return kalan.length ? resolve(gercek, ...kalan) : gercek;
    const ust = parse(su).dir;
    if (!ust || ust === su) return mutlak;
    kalan.unshift(su.slice(ust.length).replace(/^[\\/]+/, ""));
    su = ust;
  }
}

// Prefix kardesini kabul etmeyen icerme: relative ".." ile basliyorsa veya mutlaksa distadir.
function kokIcindeMi(kok: string, aday: string): boolean {
  const fark = relative(kok, aday);
  return fark === "" || (fark !== ".." && !fark.startsWith(".." + sep) && !isAbsolute(fark));
}

// Tek yolu koklerden birinin icinde oldugunu kanitlayip mutlak gercek yola cevirir.
// Yazma hedefi henuz yoksa en yakin mevcut ebeveyni (ve yukarisi) uzerinden dogrulanir.
export function resolveWorkspacePath(
  girdi: string,
  _sinif: WorkspacePathKind,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  const kokler = getWorkspaceRoots(env, cwd);
  if (kokler.length === 0) return girdi;
  if (typeof girdi !== "string" || girdi.length === 0 || girdi.includes("\0")) {
    throw new WorkspaceRootError("workspace_root: gecersiz yol");
  }
  const bicim = hamBicim(girdi);
  if (bicim === "surucu-goreli") {
    throw new WorkspaceRootError(`workspace_root: surucu-goreli yol reddedildi: ${girdi}`);
  }
  if (windowsGecersizSegment(girdi)) {
    throw new WorkspaceRootError(`workspace_root: ADS/ayrilmis ad iceren yol reddedildi: ${girdi}`);
  }
  const hepsiYerel = kokler.every(yerelSurucuMu);
  if (hepsiYerel && bicim === "cihaz") {
    throw new WorkspaceRootError(`workspace_root: cihaz yolu yerel kokte reddedildi: ${girdi}`);
  }
  if (hepsiYerel && bicim === "unc") {
    throw new WorkspaceRootError(`workspace_root: UNC yolu yerel kokte reddedildi: ${girdi}`);
  }
  if (bicim === "surucu" && hepsiYerel) {
    const surucu = girdi.slice(0, 1).toLowerCase();
    if (!kokler.some((k) => k.slice(0, 1).toLowerCase() === surucu)) {
      throw new WorkspaceRootError(`workspace_root: farkli surucu reddedildi: ${girdi}`);
    }
  }
  const aday = gercekKanitli(resolve(cwd, girdi));
  if (kokler.some((k) => kokIcindeMi(k, aday))) return aday;
  throw new WorkspaceRootError(`workspace_root: yol calisma koku disinda: ${girdi}`);
}

// kayit: JSON metniyse dokunma; mevcut dosyaysa okuma kuralini uygula; digerinde handler'in
// mevcut davranisi (JSON parse hatasi vb.) korunsun diye aynen birakilir.
function kayitYoluMu(deger: string, cwd: string): boolean {
  const t = deger.trim();
  if (t.startsWith("{") || t.startsWith("[")) return false;
  try {
    JSON.parse(t);
    return false;
  } catch {
    return existsSync(resolve(cwd, t));
  }
}

// Kayitli arac argumanlarina kok sinirini uygular; kok yoksa/atlanan aracta girdi aynen doner.
// Ihlalde WorkspaceRootError firlar; register katmani bunu mevcut hata zarfina cevirir.
export function applyWorkspaceRoot<T>(tool: string, args: T, env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): T {
  if (WORKSPACE_SKIP_TOOLS.has(tool)) return args;
  if (getWorkspaceRoots(env, cwd).length === 0) return args;
  if (!args || typeof args !== "object") return args;
  const kopya: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  for (const [anahtar, deger] of Object.entries(kopya)) {
    if (typeof deger !== "string") continue;
    if (anahtar === "kayit") {
      if (kayitYoluMu(deger, cwd)) kopya[anahtar] = resolveWorkspacePath(deger, "read", env, cwd);
      continue;
    }
    const sinif = paramKind(tool, anahtar);
    if (sinif) kopya[anahtar] = resolveWorkspacePath(deger, sinif, env, cwd);
  }
  return kopya as T;
}

// Turev yazma yolu: kaynak yola ek yapistirilir ("${path}.unpacked" bicimi).
// Kok tanimsizsa eski dizgi birlestirme aynen doner; tanimliysa yazma kurali uygulanir —
// boylece turev zaten junction/symlink olarak kok disini gosteriyorsa yazmadan once reddedilir.
export function resolveDerivedWorkspacePath(
  kaynak: string,
  ek: string,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  const turev = `${kaynak}${ek}`;
  if (getWorkspaceRoots(env, cwd).length === 0) return turev;
  return resolveWorkspacePath(turev, "write", env, cwd);
}

// Cikti yolu secimi (orn. rea_net_capture HAR): kok tanimsizsa girdi aynen doner (cwd davranisi).
// Kok tanimliysa goreli cikti ilk koke capalanir ve kok icinde uretilir; mutlak cikti
// oldugu gibi dogrulanir (kok disiyse WorkspaceRootError).
export function resolveWorkspaceOutputPath(
  cikti: string,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  const kokler = getWorkspaceRoots(env, cwd);
  if (kokler.length === 0) return cikti;
  const aday = !isAbsolute(cikti) && hamBicim(cikti) === "goreli" ? resolve(kokler[0] as string, cikti) : cikti;
  return resolveWorkspacePath(aday, "write", env, cwd);
}
