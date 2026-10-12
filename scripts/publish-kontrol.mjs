#!/usr/bin/env node
// publish-kontrol.mjs — YAYINLAMA YAPMAZ. Sadece `npm pack --dry-run` dogrulamasi.
// Beklenti: dist/server.js + README + LICENSE pakette olmali. Boyut raporlanir. exit 0/1.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED = ["dist/server.js", "README", "LICENSE"];

function run(cmd) {
  try {
    // npm notice ciktisi stderr'e gider; 2>&1 ile birlestir.
    return execSync(`${cmd} 2>&1`, { cwd: root, encoding: "utf8", shell: true, timeout: 120000 });
  } catch (err) {
    const out = [err?.stdout, err?.stderr, err?.message].filter(Boolean).join("\n");
    console.error("[publish-kontrol] komut basarisiz:", cmd);
    console.error(out);
    process.exit(1);
  }
}

const textOut = run("npm pack --dry-run");
console.log(textOut);

const missing = REQUIRED.filter((n) => !textOut.includes(n));
if (missing.length > 0) {
  console.error(`[publish-kontrol] FAIL — pakette eksik: ${missing.join(", ")}`);
  process.exit(1);
}

// Boyut raporu: once metin ciktidan, olmazsa --json ciktidan.
let sizeLine = null;
for (const line of textOut.split("\n")) {
  if (/package size|unpacked size|total files|tarball|shasum/i.test(line)) sizeLine = line.trim();
}
if (sizeLine) console.log(`[publish-kontrol] boyut: ${sizeLine}`);

try {
  const jsonRaw = run("npm pack --dry-run --json");
  const start = jsonRaw.indexOf("{");
  const parsed = JSON.parse(start >= 0 ? jsonRaw.slice(start) : jsonRaw);
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  if (entry) {
    const bytes = entry.size ?? entry.unpackedSize ?? null;
    const count = entry.fileCount ?? entry.files?.length ?? null;
    console.log(
      `[publish-kontrol] ozet — dosya: ${count ?? "?"} paket bayt: ${bytes ?? "?"} ad: ${entry.filename ?? entry.name ?? "?"}`
    );
  }
} catch {
  // Boyut json alinamazsa metin cikti yeterli; sessiz gec.
}

console.log("[publish-kontrol] OK — dist/server.js + README + LICENSE pakette. (publish YOK)");
process.exit(0);
