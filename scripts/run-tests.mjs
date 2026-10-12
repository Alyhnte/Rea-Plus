// run-tests.mjs: tests/*.mjs koşucusu.
// - Varsayılan: canlı enjeksiyon/debugger/paket yakalama/tarayıcı testleri HARİÇ tutulur
//   (bunlar gerçek süreçlere dokunur; yalnız VM/CI'ın ayrı işinde, bilinçli koşulmalı).
// - `--live`: hariç tutulanları da ekler. Dosya argümanı verilirse yalnız onlar koşulur.
// - Her dosya: 90 sn tavan. Aşımda süreç AĞACI öldürülür ve koşucu asla miras kalan
//   borular yüzünden takılmaz ('exit' beklenir, 'close' değil).
import { spawn, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT_MS = 90_000;

// Gerçek süreç enjeksiyonu / debugger / paket yakalama / tarayıcı / sunucu spawn edenler
// ve makineye özel ağır dış araç isteyenler (yerel Ghidra kurulumu + kişisel yollar).
const LIVE = new Set([
  "frida-api.test.mjs",
  "fridaplus.test.mjs",
  "sniff.test.mjs",
  "e2e.http.mjs",
  "browser2.test.mjs",
  "ghidra-full.test.mjs",
  "ghidra-prof2.test.mjs",
]);

const argv = process.argv.slice(2);
const live = argv.includes("--live");
const explicit = argv.filter((a) => !a.startsWith("--"));

let files;
if (explicit.length) {
  files = explicit;
} else {
  const all = readdirSync(join(root, "tests")).filter((f) => f.endsWith(".mjs")).sort();
  files = all.filter((f) => live || !LIVE.has(f)).map((f) => join("tests", f));
  const haric = all.filter((f) => LIVE.has(f));
  if (!live && haric.length) console.log(`CANLI HARIC (${haric.length}): ${haric.join(", ")}  [dahil etmek icin: --live]`);
}

function agaciOldur(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    try { spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* zaten ölü */ }
  } else {
    try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch { /* zaten ölü */ } }
  }
}

function kos(file) {
  return new Promise((res) => {
    const bas = Date.now();
    const p = spawn(process.execPath, [file], {
      cwd: root,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const ekle = (d) => { out = (out + d).slice(-8000); };
    p.stdout.on("data", ekle);
    p.stderr.on("data", ekle);
    let zamanAsimi = false;
    const t = setTimeout(() => { zamanAsimi = true; agaciOldur(p.pid); }, TIMEOUT_MS);
    const bitir = (code) => {
      clearTimeout(t);
      try { p.stdout.destroy(); p.stderr.destroy(); } catch { /* kapanmış */ }
      res({ code: zamanAsimi ? "TIMEOUT" : code, ms: Date.now() - bas, out });
    };
    p.on("exit", (code) => bitir(code ?? -1));
    p.on("error", (e) => { out += String(e); bitir(-1); });
  });
}

let pass = 0;
const fails = [];
for (const f of files) {
  const r = await kos(f);
  const ad = f.replace(/\\/g, "/").replace("tests/", "");
  if (r.code === 0) {
    pass++;
    console.log(`PASS ${ad} (${r.ms}ms)`);
  } else {
    fails.push(ad);
    const tail = r.out.trim().split(/\r?\n/).slice(-30).join(" | ").slice(0, 3000);
    console.log(`FAIL(${r.code}) ${ad} (${r.ms}ms) :: ${tail}`);
  }
}
console.log(`\n=== ${pass}/${files.length} PASS, ${fails.length} FAIL ===`);
if (fails.length) console.log(`FAILS: ${fails.join(", ")}`);
process.exit(fails.length ? 1 : 0);
