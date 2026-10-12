// rea-plus facade: MCP yapılandırma önerisi (saf fonksiyonlar)
// Girdi yalnız araç/env adıdır; yol ve token asla gömülmez.
// Bilinen araç -> REA_* ortam değişkeni eşlemesi.
const ARAC_ENV: Record<string, string> = {
  hopper: "REA_HOPPER_PATH",
  ghidra: "REA_GHIDRA_DIR",
  ida: "REA_IDA_URL",
  jeb: "REA_JEB_MCP_URL",
  jadx: "REA_JADX_BIN",
  apktool: "REA_APKTOOL_BIN",
  wabt: "REA_WABT_DIR",
  binwalk: "REA_BINWALK_BIN",
};
// Araç/env adını REA_* anahtarına çevirir (bilinmeyene REA_<ID>).
function envAdı(girdi: string): string {
  if (girdi.startsWith("REA_")) return girdi;
  return ARAC_ENV[girdi] ?? `REA_${girdi.toUpperCase()}`;
}
// Bulunanlara göre MCP JSON snippet'i üretir (stdio dist/server.js).
export function suggestConfig(bulunan: string[]): string {
  // Yinelenenleri ele, sırala: çıktı deterministik olur.
  const env: Record<string, string> = {};
  for (const ad of [...new Set(bulunan.map(envAdı))].sort()) env[ad] = "";
  // Değerler boş bırakılır; kullanıcı kendi yolunu yazar.
  const snippet = { mcpServers: { "rea-plus": { command: "node", args: ["dist/server.js"], env } } };
  return JSON.stringify(snippet, null, 2);
}
// Eksiklere göre kabuk satırları üretir (win32: setx, diğer: export).
export function suggestEnv(eksikler: string[], platform: string = process.platform): string {
  // Platform parametrelidir; test iki biçimi de aynı girdide dener.
  const adlar = [...new Set(eksikler.map(envAdı))].sort();
  if (platform === "win32") return adlar.map((a) => `setx ${a} ""`).join("\n");
  return adlar.map((a) => `export ${a}=""`).join("\n");
}
