// JEB statik provider iskeleti (WP4a): MCP istemcisini ÇAĞIRAN başlatır.
// Provider içinde spawn/fetch yok; sadece URL doğrulanır, yönlendirme döner.
import { existsSync } from "node:fs";
import { request as httpIstek } from "node:http";
import { request as httpsIstek } from "node:https";
import type { Capabilities } from "../../conduit-core/engines/types.js";

// Facade prefix kuralı: rea_ öneki zorunlu.
export const JEB_TOOLS = ["rea_jeb_ac", "rea_jeb_siniflar", "rea_jeb_sorgu"] as const;

export interface StatikSaglayici {
  readonly id: string;
  readonly capabilities: Capabilities;
  open(oturumId: string, hedefYol: string): Promise<void>;
  close(oturumId: string): Promise<void>;
}

// MCP uç adresi: yalnızca env (varsayılan yazılmaz, yanlış hedefe saplanmaz).
export function jebMcpUrl(env = process.env): string | null {
  const aday = (env.REA_JEB_MCP_URL ?? "").trim();
  if (!aday) return null;
  try {
    const u = new URL(aday);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return aday;
  } catch {
    return null;
  }
}

// Ortak kapı: URL yoksa ya da hedef yoksa capability_unsupported.
export function jebDurumu(hedefYol: string, env = process.env) {
  const url = jebMcpUrl(env);
  if (!url) return { tamam: false as const, neden: "REA_JEB_MCP_URL tanımlı değil ya da http(s) değil" };
  if (!existsSync(hedefYol)) return { tamam: false as const, neden: `Hedef yok: ${hedefYol}` };
  return { tamam: true as const, url };
}

export class JebProvider implements StatikSaglayici {
  readonly id = "jeb";
  readonly capabilities: Capabilities = {
    kind: "static",
    disassembly: true,
    symbols: true,
    readMemory: false,
    writeMemory: false,
    breakpoints: false,
    registers: false,
    modules: false,
    threads: false,
  };

  // Not: MCP bağlantısını çağıran (facade) başlatır; provider client üretmez.
  async open(oturumId: string, hedefYol: string): Promise<void> {
    void oturumId;
    const durum = jebDurumu(hedefYol);
    if (!durum.tamam) throw new Error(`capability_unsupported: ${durum.neden}`);
  }

  // Kapatma: bizim açtığımız soket yok, no-op.
  async close(oturumId: string): Promise<void> {
    void oturumId;
  }
}

// Çağıranın MCP ucuna GERÇEK HTTP POST (fetch yok, node:http/https).
// hazirUrl: çağıranın verdiği tam uç adresi; yontem: MCP yöntem adı;
// govdeJson: gönderilecek JSON gövde (string). URL yoksa unsupported.
export function rea_jeb_sorgu(hazirUrl: string, yontem: string, govdeJson = ""): Promise<
  | { ok: true; arac: "rea_jeb_sorgu"; url: string; yontem: string; durum: number; govde: string }
  | { ok: false; code: "capability_unsupported"; neden: string }
> {
  return new Promise((coz) => {
    if (!hazirUrl || !hazirUrl.trim()) {
      coz({ ok: false as const, code: "capability_unsupported" as const, neden: "hazirUrl yok — fallback: REA_JEB_MCP_URL tanımlayıp çağıran MCP ucunu başlatın" });
      return;
    }
    let u: URL;
    try {
      u = new URL(hazirUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("protokol");
    } catch {
      coz({ ok: false as const, code: "capability_unsupported" as const, neden: `geçersiz MCP URL: ${hazirUrl}` });
      return;
    }
    // SSRF kapısı: çağıran kontrollü URL varsayılanla yalnız loopback'e gidebilir;
    // uzak hedef işletmecinin açık opt-in'i (REA_JEB_ALLOW_REMOTE=1) ister, link-local/metadata her durumda engelli.
    const host = u.hostname.toLowerCase();
    const yerel = host === "localhost" || host === "::1" || host.startsWith("127.");
    const linkLocal = host.startsWith("169.254.") || host === "metadata.google.internal";
    if (linkLocal || (!yerel && process.env.REA_JEB_ALLOW_REMOTE !== "1")) {
      coz({ ok: false as const, code: "capability_unsupported" as const, neden: `hedef host engelli (yalnız loopback; uzak için REA_JEB_ALLOW_REMOTE=1): ${host}` });
      return;
    }
    if (!yontem || !yontem.trim()) {
      coz({ ok: false as const, code: "capability_unsupported" as const, neden: "yontem boş" });
      return;
    }
    const govde = govdeJson ?? "";
    const gonder = u.protocol === "https:" ? httpsIstek : httpIstek;
    const varsayilanPort = u.protocol === "https:" ? 443 : 80;
    const istek = gonder(
      { hostname: u.hostname, port: u.port ? Number(u.port) : varsayilanPort, path: `${u.pathname}${u.search}`, method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(govde) }, timeout: 15_000 },
      (yanit) => {
        let ham = "";
        yanit.setEncoding("utf8");
        yanit.on("data", (parca) => { ham += parca; });
        yanit.on("end", () => coz({ ok: true as const, arac: "rea_jeb_sorgu" as const, url: hazirUrl, yontem, durum: yanit.statusCode ?? 0, govde: ham.slice(0, 16_000) }));
      },
    );
    istek.on("timeout", () => istek.destroy(new Error("zaman aşımı")));
    istek.on("error", (e) => coz({ ok: false as const, code: "capability_unsupported" as const, neden: `JEB MCP isteği başarısız: ${e.message}` }));
    istek.write(govde);
    istek.end();
  });
}
