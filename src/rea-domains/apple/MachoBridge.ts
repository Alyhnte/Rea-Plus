// rea-domains/apple Mach-O köprüsü: saf TS başlık + load komut okuma, otool varsa ek.
// Otool/class-dump yoksa sahte sonuç üretilmez; capability_unsupported + kurulum ipucu döner.
// Kayıt dosyalarına dokunulmaz; bu modül yalnız export eder (entegrasyon ayrı dalgada).
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Facade uyumu: rea_ prefix zorunlu.
export const MACHO_TOOLS = ["rea_macho_info", "rea_macho_loads", "rea_macho_otool"] as const;

type Engel = { ok: false; code: "capability_unsupported"; reason: string; neden: string };
const engel = (neden: string): Engel => ({ ok: false, code: "capability_unsupported", reason: neden, neden });

// Ortam kapısı: dosya yoksa ya da okunamazsa analiz yapılamaz.
function hamOku(yol: string): Buffer | null {
  try { if (!yol || !existsSync(yol)) return null; return readFileSync(yol); }
  catch { return null; }
}

// İlk 4 baytı ham hex verir (Apple.ts ile aynı düzen: CF FA ED FE -> "cffaedfe").
function sihirHex(buf: Buffer): string { return buf.subarray(0, 4).toString("hex"); }

// Cpu adı: ARM64/x86_64 ayrımı burada yapılır.
function archAdi(cputype: number): string {
  if (cputype === 0x01000007) return "x86_64";
  if (cputype === 0x0100000c) return "arm64";
  if (cputype === 7) return "x86";
  if (cputype === 12) return "arm";
  if (cputype === 18) return "powerpc";
  if (cputype === 0x01000012) return "powerpc64";
  return "bilinmeyen";
}

// Filetype adı (loader.h MH_* karşılığı).
function filetypeAdi(ft: number): string {
  const m: Record<number, string> = {
    1: "object", 2: "execute", 3: "fvmlib", 4: "core", 5: "preload",
    6: "dylib", 7: "dylinker", 8: "bundle", 9: "dylib_stub", 10: "dsym", 11: "kext_bundle",
  };
  return m[ft] ?? "bilinmeyen";
}

// Load komut türü (segment/dylib/id ayrımı).
function komutTuru(cmd: number): string {
  if (cmd === 0x1) return "segment";
  if (cmd === 0x19) return "segment_64";
  if (cmd === 0x0c) return "load_dylib";
  if (cmd === 0x0d) return "id_dylib";
  if (cmd === 0x80000018) return "load_weak_dylib";
  if (cmd === 0x8000001f) return "reexport_dylib";
  if (cmd === 0x80000020) return "lazy_load_dylib";
  if (cmd === 0x80000023) return "load_upward_dylib";
  if (cmd === 0x0e) return "load_dylinker";
  if (cmd === 0x0f) return "id_dylinker";
  if (cmd === 0x1b) return "uuid";
  if (cmd === 0x1c) return "rpath";
  if (cmd === 0x80000028) return "main";
  if (cmd === 0x02) return "symtab";
  if (cmd === 0x0b) return "dysymtab";
  if (cmd === 0x22) return "dyld_info";
  if (cmd === 0x80000022) return "dyld_info_only";
  if (cmd === 0x1d) return "code_signature";
  return "other";
}

// NUL-sonlu dize: komut sınırını aşmaz.
function cstr(buf: Buffer, bas: number, son: number): string {
  let bit = bas;
  while (bit < son && bit < buf.length && buf[bit] !== 0) bit++;
  return buf.subarray(bas, Math.min(bit, son)).toString("utf8");
}

// Segment adı: 16 baytlık alan, NUL'da kesilir.
function segAdi(buf: Buffer, off: number): string {
  return buf.subarray(off, off + 16).toString("ascii").replace(/\0.*$/, "");
}

// UUID biçimi: 16 bayt -> 8-4-4-4-12.
function uuidBicim(buf: Buffer, off: number): string {
  const h = buf.subarray(off, off + 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`.toUpperCase();
}

// ---------------------------------------------------------------- otool keşfi ----

export interface OtoolCommand { komut: string; onEkArgs: string[]; kaynak: string }

// Otool keşfi (sıra): REA_OTOOL_BIN → Windows where → POSIX PATH.
// Env tanımlıysa otoritatiftir: yol içeren değerde dosya yoksa null döner.
export function resolveOtoolCommand(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): OtoolCommand | null {
  const binEnv = (env.REA_OTOOL_BIN ?? "").trim();
  if (binEnv) {
    const yolIcerir = binEnv.includes("/") || binEnv.includes("\\");
    if (yolIcerir && !existsSync(binEnv)) return null;
    return { komut: binEnv, onEkArgs: [], kaynak: "REA_OTOOL_BIN" };
  }
  if (platform === "win32") {
    try {
      const r = spawnSync("where", ["otool"], { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
      if (r.error || (r.status ?? 1) !== 0) return null;
      const ilk = String(r.stdout ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      if (!ilk) return null;
      return { komut: ilk, onEkArgs: [], kaynak: "where otool" };
    } catch { return null; }
  }
  return { komut: "otool", onEkArgs: [], kaynak: "PATH" };
}

function otoolDurumu(): { yok: boolean; sinirli: boolean } {
  const yok = resolveOtoolCommand() === null;
  return { yok, sinirli: yok };
}

// ---------------------------------------------------------------- ince başlık ----

type InceBaslik = {
  le: boolean; is64: boolean; cputype: number; cpusubtype: number;
  filetype: number; ncmds: number; sizeofcmds: number; baslikBoy: number;
};

// İnce başlığı ham tampondan okur (base: fat dilim ofseti, genelde 0).
function inceBaslikOku(buf: Buffer, dv: DataView, base: number, le: boolean, is64: boolean): InceBaslik | null {
  const baslikBoy = is64 ? 32 : 28;
  if (base + baslikBoy > buf.length) return null;
  const u32 = (off: number) => dv.getUint32(base + off, le);
  const cputype = u32(4);
  const cpusubtype = u32(8);
  const filetype = u32(12);
  const ncmds = u32(16);
  const sizeofcmds = u32(20);
  // Gerçekçi sınır: bozuk ncmds şişirmesini ele.
  if (ncmds > 256) return null;
  return { le, is64, cputype, cpusubtype, filetype, ncmds, sizeofcmds, baslikBoy };
}

export type MachoKomut = {
  cmd: number; cmd_hex: string; cmdsize: number; tur: string;
  segname?: string; yol?: string; uuid?: string; arch?: string;
};

// Load komutlarını listeler; kesik tabloda null döner (çağıran unsupported yapar).
function yukleriOku(buf: Buffer, dv: DataView, base: number, h: InceBaslik): MachoKomut[] | null {
  const out: MachoKomut[] = [];
  let off = base + h.baslikBoy;
  for (let i = 0; i < h.ncmds; i++) {
    if (off + 8 > buf.length) return null;
    const cmd = dv.getUint32(off, h.le);
    const cmdsize = dv.getUint32(off + 4, h.le);
    if (cmdsize < 8 || off + cmdsize > buf.length) return null;
    const tur = komutTuru(cmd);
    const kayit: MachoKomut = { cmd, cmd_hex: `0x${cmd.toString(16)}`, cmdsize, tur };
    if (tur === "segment" || tur === "segment_64") {
      if (off + 24 <= buf.length) kayit.segname = segAdi(buf, off + 8);
    } else if (tur === "load_dylib" || tur === "id_dylib" || tur === "load_weak_dylib" || tur === "reexport_dylib" || tur === "lazy_load_dylib" || tur === "load_upward_dylib") {
      const adOff = dv.getUint32(off + 8, h.le);
      if (adOff < cmdsize) kayit.yol = cstr(buf, off + adOff, off + cmdsize);
    } else if (tur === "load_dylinker" || tur === "id_dylinker" || tur === "rpath") {
      const adOff = dv.getUint32(off + 8, h.le);
      if (adOff < cmdsize) kayit.yol = cstr(buf, off + adOff, off + cmdsize);
    } else if (tur === "uuid") {
      if (off + 24 <= buf.length) kayit.uuid = uuidBicim(buf, off + 8);
    }
    out.push(kayit);
    off += cmdsize;
  }
  return out;
}

// ---------------------------------------------------------------- yağlı başlık ----

export type FatMimari = { cputype: number; cpusubtype: number; arch: string; offset: number; size: number };

// Fat başlığını okur; kesik tabloda null döner.
function fatOku(buf: Buffer, dv: DataView, sihir: string): { nfat: number; mimariler: FatMimari[]; fat64: boolean } | null {
  const fat64 = sihir === "cafebabf" || sihir === "bfbafeca";
  const be = sihir === "cafebabe" || sihir === "cafebabf";
  const le = !be;
  if (buf.length < 8) return null;
  const nfat = dv.getUint32(4, le);
  if (nfat === 0 || nfat > 32) return null;
  const adim = fat64 ? 32 : 20;
  if (8 + nfat * adim > buf.length) return null;
  const mimariler: FatMimari[] = [];
  for (let i = 0; i < nfat; i++) {
    const o = 8 + i * adim;
    const cputype = dv.getUint32(o, le);
    const cpusubtype = dv.getUint32(o + 4, le);
    let offset: number; let size: number;
    if (fat64) {
      offset = Number(dv.getBigUint64(o + 8, le));
      size = Number(dv.getBigUint64(o + 16, le));
    } else {
      offset = dv.getUint32(o + 8, le);
      size = dv.getUint32(o + 12, le);
    }
    mimariler.push({ cputype, cpusubtype, arch: archAdi(cputype), offset, size });
  }
  return { nfat, mimariler, fat64 };
}

// ---------------------------------------------------------------- araçlar ----

// Başlık bilgisi: ince için magic/cputype/filetype, yağlı için mimari listesi.
// Otool yoksa saf okuma yine döner ama sinirli=true işaretlenir.
export function rea_macho_info(yol: string) {
  const buf = hamOku(yol);
  if (!buf) return engel(`dosya yok/okunamadı: ${yol}`);
  if (buf.length < 4) return engel("dosya çok kısa");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const sihir = sihirHex(buf);
  const { yok, sinirli } = otoolDurumu();
  const otool = yok ? "yok" : "var";
  const inceMi =
    sihir === "cffaedfe" ? { le: true, is64: true }
    : sihir === "feedfacf" ? { le: false, is64: true }
    : sihir === "cefaedfe" ? { le: true, is64: false }
    : sihir === "feedface" ? { le: false, is64: false }
    : null;
  if (inceMi) {
    const h = inceBaslikOku(buf, dv, 0, inceMi.le, inceMi.is64);
    if (!h) return engel("Mach-O başlığı kesik/bozuk (ncmds gerçekçi değil ya da dosya kısa)");
    return {
      ok: true as const, tool: "rea_macho_info",
      summary: `arch=${archAdi(h.cputype)} filetype=${h.filetype} ncmds=${h.ncmds}${sinirli ? " sinirli" : ""}`,
      details: {
        sihir, cputype: h.cputype, cpusubtype: h.cpusubtype, arch: archAdi(h.cputype),
        is64: h.is64, filetype: h.filetype, filetype_ad: filetypeAdi(h.filetype),
        ncmds: h.ncmds, sizeofcmds: h.sizeofcmds, fat: false, sinirli, otool,
      },
    };
  }
  if (sihir === "cafebabe" || sihir === "bebafeca" || sihir === "cafebabf" || sihir === "bfbafeca") {
    const f = fatOku(buf, dv, sihir);
    if (!f) return engel("fat başlığı kesik/bozuk");
    return {
      ok: true as const, tool: "rea_macho_info",
      summary: `fat mimari=${f.mimariler.map((m) => m.arch).join(",")}${sinirli ? " sinirli" : ""}`,
      details: { sihir, fat: true, nfat: f.nfat, mimariler: f.mimariler, sinirli, otool },
    };
  }
  return engel(`Mach-O/fat sihri yok: ${sihir}`);
}

// Load komut listesi: segment adları + dylib/id yolları. Yağlıda her dilim arch etiketiyle döner.
export function rea_macho_loads(yol: string, limit = 100) {
  const buf = hamOku(yol);
  if (!buf) return engel(`dosya yok/okunamadı: ${yol}`);
  if (buf.length < 4) return engel("dosya çok kısa");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const sihir = sihirHex(buf);
  const { sinirli } = otoolDurumu();
  const inceMi =
    sihir === "cffaedfe" ? { le: true, is64: true }
    : sihir === "feedfacf" ? { le: false, is64: true }
    : sihir === "cefaedfe" ? { le: true, is64: false }
    : sihir === "feedface" ? { le: false, is64: false }
    : null;
  if (inceMi) {
    const h = inceBaslikOku(buf, dv, 0, inceMi.le, inceMi.is64);
    if (!h) return engel("Mach-O başlığı kesik/bozuk (ncmds gerçekçi değil ya da dosya kısa)");
    const komutlar = yukleriOku(buf, dv, 0, h);
    if (!komutlar) return engel("load komutları kesik/bozuk (cmdsize taşması)");
    const kes = komutlar.slice(0, Math.max(0, limit));
    return {
      ok: true as const, tool: "rea_macho_loads",
      summary: `komut=${kes.length}${sinirli ? " sinirli" : ""}`,
      details: { sihir, fat: false, arch: archAdi(h.cputype), sayi: kes.length, komutlar: kes, sinirli },
    };
  }
  if (sihir === "cafebabe" || sihir === "bebafeca" || sihir === "cafebabf" || sihir === "bfbafeca") {
    const f = fatOku(buf, dv, sihir);
    if (!f) return engel("fat başlığı kesik/bozuk");
    const hepsi: MachoKomut[] = [];
    for (const m of f.mimariler) {
      if (m.offset + 4 > buf.length || m.offset + m.size > buf.length || m.size < 4) continue;
      const ds = buf.subarray(m.offset, m.offset + Math.min(m.size, buf.length - m.offset));
      const dsihir = ds.subarray(0, 4).toString("hex");
      const dim =
        dsihir === "cffaedfe" ? { le: true, is64: true }
        : dsihir === "feedfacf" ? { le: false, is64: true }
        : dsihir === "cefaedfe" ? { le: true, is64: false }
        : dsihir === "feedface" ? { le: false, is64: false }
        : null;
      if (!dim) continue;
      const ddv = new DataView(ds.buffer, ds.byteOffset, ds.byteLength);
      const h = inceBaslikOku(ds, ddv, 0, dim.le, dim.is64);
      if (!h) continue;
      const ks = yukleriOku(ds, ddv, 0, h);
      if (!ks) continue;
      for (const k of ks) hepsi.push({ ...k, arch: m.arch });
    }
    const kes = hepsi.slice(0, Math.max(0, limit));
    return {
      ok: true as const, tool: "rea_macho_loads",
      summary: `fat komut=${kes.length} mimari=${f.mimariler.length}${sinirli ? " sinirli" : ""}`,
      details: { sihir, fat: true, mimariler: f.mimariler, sayi: kes.length, komutlar: kes, sinirli },
    };
  }
  return engel(`Mach-O/fat sihri yok: ${sihir}`);
}

// Otool köprüsü: yoksa dürüst unsupported; varsa `otool -L` çıktısını döndürür (koşmazsa unsupported).
export function rea_macho_otool(yol: string, ekstraArgs: string[] = []) {
  if (!yol || !existsSync(yol)) return engel(`dosya yok: ${yol}`);
  const cmd = resolveOtoolCommand();
  if (!cmd) {
    return engel(
      "otool bulunamadı (Xcode Command Line Tools kurun: xcode-select --install; ya da REA_OTOOL_BIN ile otool yolunu verin; " +
      "macOS dışında saf okuma (rea_macho_info/loads) kullanın — sınırlı kip)",
    );
  }
  const args = [...cmd.onEkArgs, ...ekstraArgs, "-L", yol];
  let r;
  try {
    r = spawnSync(cmd.komut, args, { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  } catch (e) {
    return engel(`otool başlatılamadı: ${e instanceof Error ? e.message : String(e)}`);
  }
  const stdout = typeof r.stdout === "string" ? r.stdout : "";
  const stderr = typeof r.stderr === "string" ? r.stderr : "";
  const kuyruk = (stderr.trim() || stdout.trim()).slice(-500);
  const err = r.error as NodeJS.ErrnoException | undefined;
  if (err) {
    if (err.code === "ETIMEDOUT") return engel(`otool zaman aşımı (30000ms)${kuyruk ? `: ${kuyruk}` : ""}`);
    if (err.code === "ENOENT") {
      return engel(
        `otool bulunamadı (ENOENT, kaynak: ${cmd.kaynak}) — Xcode Command Line Tools kurun: xcode-select --install; ` +
        "macOS dışında saf okuma (rea_macho_info/loads) kullanın — sınırlı kip",
      );
    }
    return engel(`otool çalıştırma hatası: ${err.message}${kuyruk ? ` — ${kuyruk}` : ""}`);
  }
  if ((r.status ?? 1) !== 0) return engel(`otool başarısız (kod=${r.status ?? "?"})${kuyruk ? `: ${kuyruk}` : ""}`);
  return { ok: true as const, tool: "rea_macho_otool", summary: `otool satir=${stdout.split("\n").length}`, details: { cikti: stdout.slice(0, 4000), satir: stdout.split("\n").length } };
}
