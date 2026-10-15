// rea-domains/behavior: saf TS pcap okuma + TLS keylog çözme (Dalga G/5 köprüsü).
// Kayıt dışıdır: export edilir, katalog/entegrasyon sonraki dalgada.
// Kapsam (dürüst "sınırlı" işaretiyle):
// - pcap: Ethernet/IPv4/TCP başlıkları + seq sıralı akış birleştirme, streaming okuma.
// - TLS: SSLKEYLOGFILE (CLIENT_RANDOM) eşleşmesi + işaretli sentetik yük (REA-XOR:)
//   çözme. Gerçek TLS AES-GCM çözülmez → akış "şifreli" işaretlenir, sahte içerik YOK.
// - tshark PATH'te varsa özet için kullanılır, yoksa dürüst kapı (throw yok).
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

// Katalog/facade ile uyumlu araç adı (rea_ prefix zorunlu). Kayıt entegrasyonda.
export const PCAP_TOOLS = ["rea_pcap_oku"] as const;

// Tek paket: L2/L3/L4 başlıklarından çıkarılan yön + ham yük.
export type PcapPaket = {
  tsSec: number;
  srcIp?: string;
  dstIp?: string;
  protocol?: number;
  srcPort?: number;
  dstPort?: number;
  seq?: number;
  payload: Buffer;
};

// Birleştirilmiş çift-yönlü akış. icerik yalnız keylog ile gerçekten çözülürse dolar.
export type PcapAkis = {
  anahtar: string;
  src: string;
  dst: string;
  paket: number;
  bayt: number;
  veri: Buffer;
  tls: boolean;
  sifreli: boolean;
  cozuldu: boolean;
  icerik: string | null;
};

export type PcapSonuc =
  | {
      ok: true;
      tool: string;
      summary: string;
      details: { akisSayisi: number; paketSayisi: number; akislar: PcapAkis[]; sinirli: boolean; tshark: boolean };
    }
  | { ok: false; code: "capability_unsupported" | "sınırlı"; reason: string };

export type TsharkSonuc =
  | { ok: true; tool: string; summary: string; details: { paketSayisi: number; tshark: boolean } }
  | { ok: false; code: "sınırlı"; reason: string };

// Sentetik fixture yük işareti: sonrası keylog sırrıyla XOR'ludur (gerçek TLS değildir).
const ISARET = Buffer.from("REA-XOR:", "utf8");

function u32(b: Buffer, o: number, le: boolean): number {
  return le ? b.readUInt32LE(o) : b.readUInt32BE(o);
}

const ipStr = (b: Buffer, o: number): string => `${b[o] ?? 0}.${b[o + 1] ?? 0}.${b[o + 2] ?? 0}.${b[o + 3] ?? 0}`;

// SSLKEYLOGFILE okuma: yorum/boş satır atlanır, yalnız CLIENT_RANDOM alınır.
export function keylogOku(metin: string): Map<string, string> {
  const harita = new Map<string, string>();
  for (const satir of (metin ?? "").split(/\r?\n/)) {
    const s = satir.trim();
    if (!s || s.startsWith("#")) continue;
    const [etiket, istemci, giz] = s.split(/\s+/);
    if (etiket !== "CLIENT_RANDOM" || !istemci || !giz) continue;
    if (!/^[0-9a-fA-F]{64}$/.test(istemci) || !/^[0-9a-fA-F]+$/.test(giz)) continue;
    harita.set(istemci.toLowerCase(), giz.toLowerCase());
  }
  return harita;
}

// tshark PATH'te mi? Yoksa saf okuma + dürüst kapı.
export function tsharkKontrol(): boolean {
  try {
    const r = spawnSync("tshark", ["-v"], { stdio: "ignore", timeout: 8000 });
    return !r.error && r.status === 0;
  } catch {
    return false;
  }
}

// tshark ile paket sayımı (yoksa dürüst kapı, throw yok).
export async function tsharkIleOku(pcapYol: string): Promise<TsharkSonuc> {
  if (!tsharkKontrol()) {
    return { ok: false, code: "sınırlı", reason: "tshark PATH'te yok — saf TS okuma etkin (sınırlı: gerçek TLS AES-GCM çözülmez)" };
  }
  try {
    const r = spawnSync("tshark", ["-r", pcapYol, "-T", "fields", "-e", "frame.number"], {
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (r.error || r.status !== 0) return { ok: false, code: "sınırlı", reason: "tshark okuyamadı" };
    const n = String(r.stdout ?? "").split("\n").filter((s) => s.trim()).length;
    return { ok: true, tool: "rea_pcap_oku", summary: `${pcapYol}: ${n} paket (tshark)`, details: { paketSayisi: n, tshark: true } };
  } catch {
    return { ok: false, code: "sınırlı", reason: "tshark çalıştırılamadı" };
  }
}

function cerceveCoz(cerceve: Buffer, linktype: number): Omit<PcapPaket, "tsSec"> {
  let off = linktype === 1 ? 14 : 0;
  let ethType = linktype === 1 ? cerceve.readUInt16BE(12) : 0x0800;
  if (linktype === 1 && ethType === 0x8100 && cerceve.length >= 18) {
    ethType = cerceve.readUInt16BE(16);
    off = 18;
  }
  if (ethType !== 0x0800 || cerceve.length < off + 20) return { payload: cerceve.subarray(Math.min(off, cerceve.length)) };
  const ihl = ((cerceve[off] ?? 0) & 0x0f) * 4;
  if (ihl < 20 || cerceve.length < off + ihl) return { payload: Buffer.alloc(0) };
  const protocol = cerceve[off + 9];
  const srcIp = ipStr(cerceve, off + 12);
  const dstIp = ipStr(cerceve, off + 16);
  if (protocol !== 6) return { srcIp, dstIp, protocol, payload: Buffer.alloc(0) };
  const t = off + ihl;
  if (cerceve.length < t + 20) return { srcIp, dstIp, protocol, payload: Buffer.alloc(0) };
  const srcPort = cerceve.readUInt16BE(t);
  const dstPort = cerceve.readUInt16BE(t + 2);
  const seq = cerceve.readUInt32BE(t + 4);
  const veriOff = (((cerceve[t + 12] ?? 0) >> 4) & 0x0f) * 4;
  return { srcIp, dstIp, protocol, srcPort, dstPort, seq, payload: cerceve.subarray(t + veriOff) };
}

// Streaming pcap okuma: dosya toptan belleğe alınmaz (createReadStream + artımlı çözümleme).
export async function* pcapPaketleri(pcapYol: string): AsyncGenerator<PcapPaket> {
  const akim = createReadStream(pcapYol);
  let tampon = Buffer.alloc(0);
  let le = true;
  let linktype = 1;
  let basladi = false;
  try {
    for await (const parca of akim) {
      tampon = Buffer.concat([tampon, Buffer.from(parca as Uint8Array)]);
      if (!basladi) {
        if (tampon.length < 24) continue;
        if (tampon.readUInt32LE(0) === 0xa1b2c3d4) le = true;
        else if (tampon.readUInt32BE(0) === 0xa1b2c3d4) le = false;
        else throw new Error("desteklenmeyen pcap büyüsü");
        linktype = u32(tampon, 20, le);
        if (linktype !== 1 && linktype !== 101) throw new Error(`desteklenmeyen linktype: ${linktype}`);
        tampon = tampon.subarray(24);
        basladi = true;
      }
      while (tampon.length >= 16) {
        const icerik = u32(tampon, 8, le);
        if (tampon.length < 16 + icerik) break;
        const tsSec = u32(tampon, 0, le);
        const cerceve = tampon.subarray(16, 16 + icerik);
        tampon = tampon.subarray(16 + icerik);
        yield { tsSec, ...cerceveCoz(cerceve, linktype) };
      }
    }
  } finally {
    akim.destroy();
  }
  if (!basladi) throw new Error("pcap başlığı okunamadı (boş/kısa dosya)");
}

// Çift-yönlü akış anahtarı (uçlar sıralı).
function akisAnahtari(p: PcapPaket): string {
  const a = `${p.srcIp ?? "?"}:${p.srcPort ?? "?"}`;
  const b = `${p.dstIp ?? "?"}:${p.dstPort ?? "?"}`;
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// TLS record izi: 0x16 0x03 0x01..0x04.
function tlsIziVar(veri: Buffer): boolean {
  for (let i = 0; i + 2 < veri.length; i++) {
    if (veri[i] === 0x16 && veri[i + 1] === 0x03 && (veri[i + 2] ?? 0) >= 0x01 && (veri[i + 2] ?? 0) <= 0x04) return true;
  }
  return false;
}

// ClientHello client_random (hex) çıkarımı; yoksa null.
function istemciRastgeleBul(veri: Buffer): string | null {
  for (let i = 0; i + 43 < veri.length; i++) {
    if (veri[i] !== 0x16 || veri[i + 1] !== 0x03) continue;
    const v = veri[i + 2] ?? 0;
    if (v < 0x01 || v > 0x04) continue;
    if (veri[i + 5] !== 0x01) continue; // handshake: ClientHello
    const rastgele = veri.subarray(i + 11, i + 43);
    if (rastgele.length === 32) return rastgele.toString("hex");
  }
  return null;
}

function xorCoz(ham: Buffer, gizHex: string): string | null {
  let giz: Buffer;
  try {
    giz = Buffer.from(gizHex, "hex");
  } catch {
    return null;
  }
  if (giz.length === 0) return null;
  const coz = Buffer.from(ham.map((b, i) => b ^ (giz[i % giz.length] as number)));
  const metin = coz.toString("utf8");
  if (metin.includes("�")) return null;
  if (!/^[\t\n\r\x20-\u{10FFFF}]*$/u.test(metin)) return null;
  return metin;
}

// pcap → akışlar. keylogMetin/keylogYol ile işaretli yük çözülür;
// çözülemeyen TLS akışı "şifreli" işaretlenir (sahte içerik YOK).
export async function pcapAkislar(
  pcapYol: string,
  secenek?: { keylogYol?: string; keylogMetin?: string },
): Promise<PcapSonuc> {
  let keylogMetni = secenek?.keylogMetin ?? "";
  try {
    if (!keylogMetni && secenek?.keylogYol) keylogMetni = await readFile(secenek.keylogYol, "utf8");
  } catch {
    return { ok: false, code: "capability_unsupported", reason: "keylog dosyası okunamadı" };
  }
  const keylog = keylogOku(keylogMetni);
  const parcalar = new Map<string, PcapPaket[]>();
  let paketSayisi = 0;
  try {
    for await (const p of pcapPaketleri(pcapYol)) {
      paketSayisi++;
      const k = akisAnahtari(p);
      const d = parcalar.get(k);
      if (d) d.push(p);
      else parcalar.set(k, [p]);
    }
  } catch (e) {
    return { ok: false, code: "capability_unsupported", reason: `pcap okunamadı: ${(e as Error).message}` };
  }
  const tshark = tsharkKontrol();
  const akislar: PcapAkis[] = [];
  for (const [anahtar, segs] of parcalar) {
    const sirali = [...segs].sort((a, b) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER));
    const veri = Buffer.concat(sirali.map((s) => s.payload));
    const ilk = sirali[0] as PcapPaket;
    const tls = tlsIziVar(veri);
    let sifreli = false;
    let cozuldu = false;
    let icerik: string | null = null;
    if (tls) {
      const rastgele = istemciRastgeleBul(veri);
      const giz = rastgele ? keylog.get(rastgele) : undefined;
      const isaret = veri.indexOf(ISARET);
      if (giz && isaret >= 0) {
        const coz = xorCoz(veri.subarray(isaret + ISARET.length), giz);
        if (coz !== null) {
          cozuldu = true;
          icerik = coz;
        } else {
          sifreli = true;
        }
      } else {
        sifreli = true; // keylog yok / eşleşmedi / gerçek TLS → çözülmedi, uydurma yok
      }
    }
    akislar.push({
      anahtar,
      src: `${ilk.srcIp ?? "?"}:${ilk.srcPort ?? "?"}`,
      dst: `${ilk.dstIp ?? "?"}:${ilk.dstPort ?? "?"}`,
      paket: segs.length,
      bayt: veri.length,
      veri,
      tls,
      sifreli,
      cozuldu,
      icerik,
    });
  }
  akislar.sort((a, b) => (a.anahtar < b.anahtar ? -1 : 1));
  const cozulen = akislar.filter((a) => a.cozuldu).length;
  const sifreliler = akislar.filter((a) => a.sifreli).length;
  return {
    ok: true,
    tool: "rea_pcap_oku",
    summary:
      `${pcapYol}: ${paketSayisi} paket, ${akislar.length} akış` +
      (cozulen ? `, ${cozulen} çözüldü (keylog)` : "") +
      (sifreliler ? `, ${sifreliler} şifreli` : "") +
      ` [sınırlı: gerçek TLS AES-GCM çözülmez${tshark ? "; tshark var" : "; tshark yok"}]`,
    details: { akisSayisi: akislar.length, paketSayisi, akislar, sinirli: true, tshark },
  };
}
