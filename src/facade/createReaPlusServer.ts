// rea-plus facade: birleşik server
// transport politikası conduit'tan gelir: stdio + streamable-http, stateless, token gate.
import { createBridgeServer, PROTOCOL_VERSION, SERVER_NAME } from "../conduit-core/server.js";
import { mergedCatalog } from "./catalogMerge.js";
import { FROZEN_CONDUIT_TOOLS } from "./toolNamespace.js";

export const REA_PLUS_NAME = "rea-plus";
export const REA_PLUS_VERSION = "0.4.0";
export const REA_PLUS_PROTOCOL = PROTOCOL_VERSION;

export function createReaPlusServer() {
  // WP2: önce conduit çekirdek ayağa kalkar, rea register*Tools() buraya taşınacak.
  const server = createBridgeServer();
  // WP3: rea tool'ları qualifyReaTool() ile prefixlenerek eklenecek.
  // WP4: src/rea-domains/* provider'lar lazy-load (hopper/ghidra/ida/jeb/js/apk/dotnet/wasm/evm/firmware/browser).
  return { server, base: SERVER_NAME, frozen: FROZEN_CONDUIT_TOOLS, catalog: mergedCatalog() };
}
