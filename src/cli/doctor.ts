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

// mergedCatalog içinden indirme adresi bul, yoksa boş dön.
function katalogUrl(id: string): string {
  const e = mergedCatalog().find((c) => c.id === id);
  return e ? `${e.ad}: ${e.url} (${e.nereye})` : "";
}

// Yedi aracı yokla: node sürümü process'ten, gerisi PATH'ten.
export function runDoctorCommand(json: boolean): void {
  const satirlar: DoctorSatir[] = [
    { id: "node", ad: "Node", durum: "var", surum: process.version, indir: katalogUrl("frida") },
    { id: "r2", ad: "radare2", durum: "yok", surum: null, indir: katalogUrl("radare2") },
    { id: "dot", ad: "Graphviz", durum: "yok", surum: null, indir: katalogUrl("graphviz") },
    { id: "java", ad: "Java", durum: "yok", surum: null, indir: katalogUrl("jadx") },
    { id: "adb", ad: "ADB", durum: "yok", surum: null, indir: katalogUrl("apktool") },
    { id: "wabt", ad: "WABT", durum: "yok", surum: null, indir: katalogUrl("wabt") },
    { id: "playwright", ad: "Playwright", durum: "yok", surum: null, indir: "" },
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
  if (json) console.log(JSON.stringify({ ok: true, araclar: satirlar }, null, 2));
  else for (const s of satirlar) console.log(`${s.durum === "var" ? "[+]" : "[-]"} ${s.ad}: ${s.surum ?? "yok"} ${s.durum === "yok" && s.indir ? `-> ${s.indir}` : ""}`);
}
