// prepare: git kurulumlarinda dist'i derler. Katmanli kurulumlarda (Dockerfile'in
// bagimlilik katmani gibi) kaynak henuz kopyalanmamissa sessizce atlar; asil
// build adimi kaynagi gorunce kosar.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync("tsconfig.json") || !existsSync("src")) {
  console.log("prepare: kaynak yok (katmanli kurulum), build atlandi");
  process.exit(0);
}
const r = spawnSync("npm", ["run", "build"], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
