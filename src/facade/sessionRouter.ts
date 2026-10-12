// rea-plus facade: session router
// conduit registry bozulmaz, rea session ayrı namespace'te yaşar.
import type { EngineId } from "../conduit-core/engines/types.js";

export type ReaPlusEngine =
  | EngineId
  | "hopper" | "ghidra" | "ida" | "jeb"
  | "jadx" | "apktool" | "adb"
  | "dotnet" | "wasm" | "evm" | "go" | "firmware" | "browser" | "electron";

const CONDUIT_ENGINES: ReadonlySet<string> = new Set(["radare2", "x64dbg", "cdb", "frida"]);

export function routeSession(engine: ReaPlusEngine): "conduit" | "rea-domains" {
  if (CONDUIT_ENGINES.has(engine)) return "conduit";
  return "rea-domains";
}

export function isConduitEngine(engine: string): boolean {
  return CONDUIT_ENGINES.has(engine);
}
