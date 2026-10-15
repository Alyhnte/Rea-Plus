// cli/setup: `rea-plus-cli setup` sihirbazı (Dalga F/1, offline, yürütme yok).
// İstemciyi config dosyası/kayıt defteri izinden algılar, MCP bloğunu DOĞRU yere
// kullanıcı onayıyla yazar (--yes onaysız yazar; yalnız test kancası
// REA_PLUS_SETUP_HOME ile geçici HOME kullanılır, gerçek config'e dokunulmaz).
// Kurallar: birleştime yıkımsızdır (--force olmadan başka blok silinmez),
// --dry-run yazmaz, bozuk JSON .bak'e alınıp tazelenir (yedek alınamazsa DURUR).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

// Desteklenen istemci kimlikleri (sabit sıra: listelerde bu dizilir).
export const ISTEMCI_IDLER = ["cursor", "claude", "vscode", "codex", "windsurf"] as const;
export type IstemciId = (typeof ISTEMCI_IDLER)[number];

// JSON istemcilerde üst anahtar (vscode mcp.json şeması "servers" kullanır).
export type ConfigTur = "json" | "toml";

// İstemci tanımı: görünen ad + config türü + yol/izi çözümleyiciler.
export interface IstemciTanim {
  id: IstemciId;
  ad: string;
  tur: ConfigTur;
  ustAnahtar: string;
  yol: (home: string) => string;
  izler: (home: string) => string[];
}

// Kanonik MCP bloğu: bütün JSON istemcilerde aynı ad+komut (README ile aynı).
export function reaPlusJsonBlok(): { command: string; args: string[] } {
  return { command: "npx", args: ["-y", "rea-plus"] };
}

// Kanonik Codex TOML bölümü (configs/codex/config.toml ile aynı).
export function reaPlusTomlBlok(): string {
  return '[mcp_servers.rea-plus]\ncommand = "npx"\nargs = ["-y", "rea-plus"]\n';
}

// Claude Desktop config yolu platforma göre değişir, hep HOME-görelidir.
function claudeYolu(home: string): string {
  if (process.platform === "win32") return join(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json");
  if (process.platform === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  return join(home, ".config", "Claude", "claude_desktop_config.json");
}

// İstemci kayıt defteri: yol ve algı izleri (dosya ya da dizin varlığı).
export const ISTEMCILER: IstemciTanim[] = [
  {
    id: "cursor",
    ad: "Cursor",
    tur: "json",
    ustAnahtar: "mcpServers",
    yol: (home) => join(home, ".cursor", "mcp.json"),
    izler: (home) => [join(home, ".cursor", "mcp.json"), join(home, ".cursor")],
  },
  {
    id: "claude",
    ad: "Claude Desktop",
    tur: "json",
    ustAnahtar: "mcpServers",
    yol: (home) => claudeYolu(home),
    izler: (home) => [claudeYolu(home), dirname(claudeYolu(home))],
  },
  {
    id: "vscode",
    ad: "VS Code",
    tur: "json",
    ustAnahtar: "servers",
    yol: (home) => join(home, ".vscode", "mcp.json"),
    izler: (home) => [join(home, ".vscode", "mcp.json"), join(home, ".vscode")],
  },
  {
    id: "codex",
    ad: "Codex CLI",
    tur: "toml",
    ustAnahtar: "mcp_servers",
    yol: (home) => join(home, ".codex", "config.toml"),
    izler: (home) => [join(home, ".codex", "config.toml"), join(home, ".codex")],
  },
  {
    id: "windsurf",
    ad: "Windsurf",
    tur: "json",
    ustAnahtar: "mcpServers",
    yol: (home) => join(home, ".codeium", "windsurf", "mcp_config.json"),
    izler: (home) => [
      join(home, ".codeium", "windsurf", "mcp_config.json"),
      join(home, ".codeium", "windsurf"),
      join(home, ".windsurf", "mcp_config.json"),
    ],
  },
];

// Kimliği tanıma çevir, bilinmeyende undefined döner (çağıran raporlar).
export function istemciBul(id: string): IstemciTanim | undefined {
  return ISTEMCILER.find((t) => t.id === id);
}

// HOME çözümü: açık arg > test kancası REA_PLUS_SETUP_HOME > gerçek HOME.
// Testler yalnız geçici HOME verir; gerçek kullanıcı config'i korunur.
export function evDizini(acik?: string): string {
  if (acik) return acik;
  const kanca = process.env["REA_PLUS_SETUP_HOME"];
  if (kanca) return kanca;
  return homedir();
}

// Kayıt defteri taraması kapalı mı (testler kapatır, deterministik kalır).
function kayitKapali(): boolean {
  return process.env["REA_PLUS_SETUP_NO_REGISTRY"] === "1";
}

// Windows kayıt defteri izi: HKCU\Software altında anahtar adı ara (en iyi efor).
// reg yoksa/kapalıysa/timeout'ta false döner, asla patlatmaz.
function kayitIzindeAra(terimler: string[]): boolean {
  if (kayitKapali() || process.platform !== "win32") return false;
  try {
    for (const terim of terimler) {
      const r = spawnSync("reg", ["query", "HKCU\\Software", "/f", terim, "/k"], {
        encoding: "utf8",
        timeout: 3000,
        windowsHide: true,
      });
      if (r.status === 0 && (r.stdout ?? "").trim()) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Kayıt defteri arama terimleri (dosya izi yoksa ikinci şans).
function kayitTerimleri(id: IstemciId): string[] {
  if (id === "cursor") return ["Cursor"];
  if (id === "claude") return ["Claude"];
  if (id === "vscode") return ["Visual Studio Code"];
  if (id === "codex") return ["Codex"];
  return ["Windsurf"];
}

// Kurulu istemcileri algıla: dosya/dizin izi YA DA kayıt defteri izi.
export function algilaIstemciler(home: string): IstemciTanim[] {
  return ISTEMCILER.filter((t) => t.izler(home).some((y) => existsSync(y)) || kayitIzindeAra(kayitTerimleri(t.id)));
}

// Açık setup hatası: CLI bunu Türkçe mesaj + exit 1'e çevirir (sahte başarı yok).
export class SetupHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "SetupHatasi";
  }
}

// Manuel config örneği: istemci yoksa/bilinmeyende basılır (sahte kurulum yok).
export function manuelOrnek(home: string): string {
  const satirlar = [
    "manuel kurulum (otomatik yazılmadı):",
    ...ISTEMCILER.map((t) => `  - ${t.ad} (${t.id}): ${t.yol(home)}`),
    "JSON istemciler (cursor/claude/vscode/windsurf) için blok:",
    '  { "mcpServers": { "rea-plus": { "command": "npx", "args": ["-y", "rea-plus"] } } }',
    "  (VS Code mcp.json üst anahtarı mcpServers yerine servers kullanır.)",
    "Codex (~/.codex/config.toml) için bölüm:",
    '  [mcp_servers.rea-plus]',
    '  command = "npx"',
    '  args = ["-y", "rea-plus"]',
  ];
  return satirlar.join("\n");
}

// Destek listesi: her istemcinin kurulu/kurulu-değil durumu + hedef yolu.
export function destekListesi(home: string, kurulu: IstemciTanim[]): string {
  const kuruluKume = new Set(kurulu.map((t) => t.id));
  return ISTEMCILER.map((t) => `  [${kuruluKume.has(t.id) ? "*" : " "}] ${t.id} (${t.ad}): ${kuruluKume.has(t.id) ? "kurulu" : "kurulu değil"} -> ${t.yol(home)}`).join("\n");
}

// JSON planı: mevcut metinden sonuç içeriğini üret, bozukluğu raporla.
// --force yalnızken tam sıfırlama yapar (yıkıcı yazma yalnız bayrakla).
function jsonPlanla(ham: string | null, ust: string, force: boolean): { icerik: string; bozuk: boolean } {
  let taban: Record<string, unknown> = {};
  let bozuk = false;
  if (ham !== null) {
    try {
      const cozulen: unknown = JSON.parse(ham);
      if (cozulen === null || typeof cozulen !== "object" || Array.isArray(cozulen)) bozuk = true;
      else taban = cozulen as Record<string, unknown>;
    } catch {
      bozuk = true;
    }
  }
  if (bozuk) taban = {};
  let son: Record<string, unknown>;
  if (force) {
    son = { [ust]: { "rea-plus": reaPlusJsonBlok() } };
  } else {
    const ustHam = taban[ust];
    if (ustHam !== undefined && (ustHam === null || typeof ustHam !== "object" || Array.isArray(ustHam))) {
      throw new SetupHatasi(`üst anahtar "${ust}" beklenen tipte değil; --force ile sıfırlayabilirsiniz`);
    }
    const birlesik: Record<string, unknown> = { ...((ustHam ?? {}) as Record<string, unknown>) };
    birlesik["rea-plus"] = reaPlusJsonBlok();
    son = { ...taban, [ust]: birlesik };
  }
  return { icerik: `${JSON.stringify(son, null, 2)}\n`, bozuk };
}

// Mevcut JSON'da rea-plus zaten kanonik mi (gereksiz yazmayı önler).
function zatenKuruluMu(ham: string | null, ust: string): boolean {
  if (ham === null) return false;
  try {
    const cozulen = JSON.parse(ham) as { [k: string]: unknown };
    const ustObje = cozulen[ust] as { [k: string]: unknown } | undefined;
    const blok = ustObje?.["rea-plus"] as { command?: unknown; args?: unknown } | undefined;
    return blok?.command === "npx" && Array.isArray(blok?.args) && blok.args.join(",") === "-y,rea-plus";
  } catch {
    return false;
  }
}

// TOML planı: rea-plus bölümünü yerinde değiştir ya da sona ekle (geri kalan korunur).
function tomlPlanla(ham: string | null, force: boolean): { icerik: string; bozuk: false } {
  const blok = reaPlusTomlBlok();
  if (ham === null || force || ham.trim() === "") return { icerik: force || ham === null || ham.trim() === "" ? blok : ham, bozuk: false };
  const satirlar = ham.split(/\r?\n/);
  const bas = satirlar.findIndex((s) => /^\s*\[mcp_servers\.rea-plus\]\s*$/.test(s));
  if (bas === -1) {
    const govde = ham.endsWith("\n") ? ham : `${ham}\n`;
    return { icerik: `${govde}\n${blok}`, bozuk: false };
  }
  let son = satirlar.length;
  for (let i = bas + 1; i < satirlar.length; i++) {
    if (/^\s*\[[^\]]+\]\s*$/.test(satirlar[i] ?? "")) {
      son = i;
      break;
    }
  }
  const yeni = [...satirlar.slice(0, bas), ...blok.trimEnd().split("\n"), ...satirlar.slice(son)];
  return { icerik: `${yeni.join("\n").replace(/\n*$/, "")}\n`, bozuk: false };
}

// Yazma planı: dosyayı okur (okunamazsa açık hata), sonuç içeriğini döndürür.
// Yazma yapmaz; dry-run ve gerçek yazma aynı plandan beslenir.
export interface YazmaPlani {
  yol: string;
  icerik: string;
  mevcutVar: boolean;
  bozuk: boolean;
  yedekAlinacak: boolean;
  zatenKurulu: boolean;
}
export function planla(tanim: IstemciTanim, home: string, force: boolean): YazmaPlani {
  const yol = tanim.yol(home);
  const mevcutVar = existsSync(yol);
  let ham: string | null = null;
  if (mevcutVar) {
    try {
      ham = readFileSync(yol, "utf8");
    } catch (hata) {
      const neden = hata instanceof Error ? hata.message : String(hata);
      throw new SetupHatasi(`config okunamadı: ${yol} (${neden}); yazma yapılmadı`);
    }
  }
  if (tanim.tur === "toml") {
    const plan = tomlPlanla(ham, force);
    const zaten = ham !== null && ham.includes("[mcp_servers.rea-plus]") && ham.includes('"npx"') && !force;
    return { yol, icerik: plan.icerik, mevcutVar, bozuk: false, yedekAlinacak: false, zatenKurulu: zaten };
  }
  const plan = jsonPlanla(ham, tanim.ustAnahtar, force);
  return {
    yol,
    icerik: plan.icerik,
    mevcutVar,
    bozuk: plan.bozuk,
    yedekAlinacak: plan.bozuk && mevcutVar,
    zatenKurulu: !force && !plan.bozuk && zatenKuruluMu(ham, tanim.ustAnahtar),
  };
}

// Planı uygula: gerekirse .bak al (başarısızsa DUR, yazma yok), sonra yaz.
// Yazılamayan dizin/dosya açık hatayla raporlanır.
export function uygula(plan: YazmaPlani): { yedek: string | null } {
  let yedek: string | null = null;
  if (plan.yedekAlinacak) {
    try {
      copyFileSync(plan.yol, `${plan.yol}.bak`);
      yedek = `${plan.yol}.bak`;
    } catch (hata) {
      const neden = hata instanceof Error ? hata.message : String(hata);
      throw new SetupHatasi(`yedek alınamadı: ${plan.yol}.bak (${neden}); yazma DURDURULDU`);
    }
  }
  try {
    mkdirSync(dirname(plan.yol), { recursive: true });
    writeFileSync(plan.yol, plan.icerik, "utf8");
  } catch (hata) {
    const neden = hata instanceof Error ? hata.message : String(hata);
    throw new SetupHatasi(`config yazılamadı: ${plan.yol} (${neden})`);
  }
  return { yedek };
}

// Etkileşimli onay: TTY'de tek satır sorar (e/h), yanıt yoksa false.
function soruSor(soru: string): boolean {
  process.stdout.write(soru);
  const tampon = Buffer.alloc(1024);
  try {
    const n = readSync(0, tampon, 0, tampon.length, null);
    const yanit = tampon.subarray(0, n).toString("utf8").trim().toLowerCase();
    return yanit === "e" || yanit === "evet" || yanit === "y" || yanit === "yes";
  } catch {
    return false;
  }
}

// Bayraklar: --client <id|--client=id> --list --dry-run --yes --force --home <dir>.
export interface SetupSecenek {
  client?: string;
  liste: boolean;
  kuru: boolean;
  onay: boolean;
  force: boolean;
  home?: string;
}
export function bayraklariOku(args: string[]): SetupSecenek {
  const sec: SetupSecenek = { liste: false, kuru: false, onay: false, force: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (a === "--list") sec.liste = true;
    else if (a === "--dry-run") sec.kuru = true;
    else if (a === "--yes") sec.onay = true;
    else if (a === "--force") sec.force = true;
    else if (a === "--client" || a === "-c") {
      sec.client = args[i + 1] ?? "";
      i++;
    } else if (a.startsWith("--client=")) sec.client = a.slice("--client=".length);
    else if (a === "--home") {
      sec.home = args[i + 1] ?? "";
      i++;
    } else if (a.startsWith("--home=")) sec.home = a.slice("--home=".length);
    else throw new SetupHatasi(`bilinmeyen bayrak: ${a} (kullanım: setup [--client <id>] [--yes] [--dry-run] [--force] [--list])`);
  }
  return sec;
}

// CLI komutu: setup [--client <id>] [--yes] [--dry-run] [--force] [--list] [--json]
export function runSetupCommand(args: string[], json: boolean): void {
  let sec: SetupSecenek;
  try {
    sec = bayraklariOku(args);
  } catch (hata) {
    const msg = hata instanceof Error ? hata.message : String(hata);
    if (json) console.log(JSON.stringify({ ok: false, code: "kullanim_hatasi", reason: msg }));
    else console.error(`hata: ${msg}`);
    process.exitCode = 1;
    return;
  }
  const home = evDizini(sec.home);
  const kurulu = algilaIstemciler(home);
  // --list: tablo basar, yazmaz.
  if (sec.liste) {
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            home,
            istemciler: ISTEMCILER.map((t) => ({ id: t.id, ad: t.ad, kurulu: kurulu.some((k) => k.id === t.id), yol: t.yol(home) })),
          },
          null,
          2
        )
      );
    } else {
      console.log("desteklenen istemciler:");
      console.log(destekListesi(home, kurulu));
    }
    return;
  }
  // İstemci seçimi: açık bayrak > tek algı; yokluk/çokluk açık hatadır.
  let tanim: IstemciTanim | undefined;
  if (sec.client) {
    tanim = istemciBul(sec.client);
    if (!tanim) {
      const msg = `bilinmeyen istemci: ${sec.client}`;
      if (json) console.log(JSON.stringify({ ok: false, code: "bilinmeyen_istemci", reason: msg }));
      else {
        console.error(`hata: ${msg}`);
        console.log(destekListesi(home, kurulu));
        console.log(manuelOrnek(home));
      }
      process.exitCode = 1;
      return;
    }
  } else if (kurulu.length === 1 && kurulu[0]) {
    tanim = kurulu[0];
  } else if (kurulu.length === 0) {
    const msg = "kurulu istemci bulunamadı";
    if (json) console.log(JSON.stringify({ ok: false, code: "istemci_yok", reason: msg }));
    else {
      console.error(`hata: ${msg} (sahte kurulum yapılmadı)`);
      console.log(destekListesi(home, kurulu));
      console.log(manuelOrnek(home));
    }
    process.exitCode = 1;
    return;
  } else {
    const msg = `birden fazla istemci bulundu (${kurulu.map((t) => t.id).join(", ")}); --client ile seçin`;
    if (json) console.log(JSON.stringify({ ok: false, code: "istemci_secimi_gerekli", reason: msg }));
    else {
      console.error(`hata: ${msg}`);
      console.log(destekListesi(home, kurulu));
    }
    process.exitCode = 1;
    return;
  }
  // Planı kur (okuma hatası burada açık hataya döner, yazma yok).
  let plan: YazmaPlani;
  try {
    plan = planla(tanim, home, sec.force);
  } catch (hata) {
    const msg = hata instanceof Error ? hata.message : String(hata);
    if (json) console.log(JSON.stringify({ ok: false, code: "okuma_hatasi", reason: msg, istemci: tanim.id }));
    else console.error(`hata: ${msg}`);
    process.exitCode = 1;
    return;
  }
  // Zaten kanonikse yazmadan bildir (gereksiz churn yok).
  if (plan.zatenKurulu) {
    if (json) console.log(JSON.stringify({ ok: true, istemci: tanim.id, yol: plan.yol, durum: "zaten kurulu", yedek: null }));
    else console.log(`zaten kurulu: ${tanim.ad} -> ${plan.yol}`);
    return;
  }
  // Kuru-çalıştırma: gösterir, yazmaz.
  if (sec.kuru) {
    if (json) {
      console.log(JSON.stringify({ ok: true, istemci: tanim.id, yol: plan.yol, durum: "kuru-çalıştırma (yazılmadı)", icerik: plan.icerik, yedek: null }, null, 2));
    } else {
      console.log(`kuru-çalıştırma (yazılmadı): ${tanim.ad} -> ${plan.yol}`);
      if (plan.yedekAlinacak) console.log(`yedek alınacaktı: ${plan.yol}.bak`);
      console.log("--- yazılacak içerik ---");
      console.log(plan.icerik.trimEnd());
    }
    return;
  }
  // Onay: --yes yoksa TTY'de sor, etkileşimsizde --yes iste (asla asılma).
  if (!sec.onay) {
    if (process.stdin.isTTY && soruSor(`${tanim.ad} için ${plan.yol} yazılsın mı? (e/h) `)) {
      // onaylandı, devam et
    } else {
      const msg = process.stdin.isTTY ? "onay verilmedi, yazılmadı" : "etkileşimsiz kip: yazmak için --yes ekleyin (önizleme için --dry-run)";
      if (json) console.log(JSON.stringify({ ok: false, code: "onay_yok", reason: msg, istemci: tanim.id, yol: plan.yol }));
      else {
        console.error(`hata: ${msg}`);
        console.log(`hedef: ${plan.yol}`);
      }
      process.exitCode = 1;
      return;
    }
  }
  // Gerçek yazma: yedek + birleşim (hatada açık rapor, sahte başarı yok).
  try {
    const sonuc = uygula(plan);
    if (json) {
      console.log(JSON.stringify({ ok: true, istemci: tanim.id, yol: plan.yol, durum: plan.bozuk ? "yedeklendi + yazıldı" : "yazıldı", yedek: sonuc.yedek }));
    } else {
      if (sonuc.yedek) console.log(`yedek: ${sonuc.yedek}`);
      console.log(`yazıldı: ${tanim.ad} -> ${plan.yol}`);
    }
  } catch (hata) {
    const msg = hata instanceof Error ? hata.message : String(hata);
    if (json) console.log(JSON.stringify({ ok: false, code: "yazma_hatasi", reason: msg, istemci: tanim.id, yol: plan.yol }));
    else console.error(`hata: ${msg}`);
    process.exitCode = 1;
  }
}
