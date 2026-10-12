// TypeSpread: bilinen Windows API imzaları + register yayılımı (saf kural motoru).
export const TYPEDEF_SPREAD_TOOLS = ["rea_typedef_oner"] as const;
type Engel = { ok: false; code: "gecersiz_girdi"; neden: string };
const engel = (n: string): Engel => ({ ok: false, code: "gecersiz_girdi", neden: n });
// Bilinen imza tablosu: api (küçük harf) -> x64 arg sırası (rcx,rdx,r8,r9...).
const IMZA: Record<string, string[]> = {
  createfilew: ["lpFileName", "dwDesiredAccess", "dwShareMode", "lpSecurityAttributes", "dwCreationDisposition", "dwFlagsAndAttributes", "hTemplateFile"],
  createfilea: ["lpFileName", "dwDesiredAccess", "dwShareMode", "lpSecurityAttributes", "dwCreationDisposition", "dwFlagsAndAttributes", "hTemplateFile"],
  readfile: ["hFile", "lpBuffer", "nNumberOfBytesToRead", "lpNumberOfBytesRead", "lpOverlapped"],
  writefile: ["hFile", "lpBuffer", "nNumberOfBytesToWrite", "lpNumberOfBytesWritten", "lpOverlapped"],
  regopenkeyexw: ["hKey", "lpSubKey", "ulOptions", "samDesired", "phkResult"],
  regopenkeyexa: ["hKey", "lpSubKey", "ulOptions", "samDesired", "phkResult"],
  messageboxw: ["hWnd", "lpText", "lpCaption", "uType"],
  messageboxa: ["hWnd", "lpText", "lpCaption", "uType"],
  virtualalloc: ["lpAddress", "dwSize", "flAllocationType", "flProtect"],
  createprocessw: ["lpApplicationName", "lpCommandLine", "lpProcessAttributes", "lpThreadAttributes", "bInheritHandles", "dwCreationFlags"],
};
// Girdi normalize: JSON string | {cagrilar} | ham dizi (bozukta null).
function girdiyiCoz(g: unknown): { api: string; args: { reg: string }[] }[] | null {
  let v: unknown = typeof g === "string" ? null : g;
  if (typeof g === "string") { try { v = JSON.parse(g); } catch { return null; } }
  const d = (v as { cagrilar?: unknown[] }).cagrilar ?? v;
  if (!Array.isArray(d)) return null;
  return d.map((c) => {
    const r = c as { api?: unknown; args?: unknown };
    const args = Array.isArray(r.args) ? r.args.map((a) => typeof a === "string" ? { reg: a } : { reg: String((a as { reg?: unknown }).reg ?? "") }).filter((a) => a.reg) : [];
    return { api: String(r.api ?? ""), args };
  }).filter((c) => c.api && c.args.length);
}
// Çağrılara struct/arg adı öner: önce imza tablosu, sonra aynı register->aynı ad yayılımı.
export function rea_typedef_oner(imzalarJson: string | unknown) {
  const cagrilar = girdiyiCoz(imzalarJson);
  if (!cagrilar || !cagrilar.length) return engel("çağrı listesi yok (cagrilar:[{api,args:[{reg}]}] beklenir)");
  const oneriler: { api: string; reg: string; oneri: string; kaynak: "imza" | "yayilim" }[] = [];
  const yay: Record<string, string> = {}; // reg (küçük harf) -> ad
  for (const c of cagrilar) {
    const sig = IMZA[c.api.toLowerCase()];
    c.args.forEach((a, i) => {
      const ad = sig?.[i];
      if (ad) { oneriler.push({ api: c.api, reg: a.reg, oneri: ad, kaynak: "imza" }); yay[a.reg.toLowerCase()] ??= ad; }
    });
  }
  for (const c of cagrilar) {
    const sig = IMZA[c.api.toLowerCase()];
    c.args.forEach((a, i) => {
      if (sig?.[i]) return; // imza zaten önerdi
      const ad = yay[a.reg.toLowerCase()];
      if (ad) oneriler.push({ api: c.api, reg: a.reg, oneri: ad, kaynak: "yayilim" });
    });
  }
  if (!oneriler.length) return engel("öneri üretilemedi (bilinen imza ve yayılım yok)");
  return { ok: true as const, arac: "rea_typedef_oner", sayi: oneriler.length, oneriler };
}
