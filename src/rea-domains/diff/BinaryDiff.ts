// BinaryDiff: iki binary sürümü arası fonksiyon seviyesi fark (Dalga G/3).
// Yama analizi iş akışı: hangi fonksiyon değişmiş / hangisi yeni / hangisi silinmiş.
// Yöntem: hash (sha256) + boyut + imza (ilk 16 bayt) karşılaştırması.
// Kimlik: debug sembolü varsa ad (ELF symtab STT_FUNC), yoksa adres (sub_0x<rel>).
// Eşleşme politikası (sahte skor yok): önce birebir hash (taşınmış ama aynı içerik
// aynen sayılır), sonra aynı kimlikte farklı hash (değişen), kalanlar eklenen/çıkarılan.
// Eşleşemeyen fonksiyon "eşleşmedi" olur; benzerlik skoru uydurulmaz.
// Büyük dosyalar: rastgele erişimli sınırlı pencereyle (64KB) okunur; dosyanın tamamı
// belleğe alınmaz. Kayıt/facade entegrasyonu yoktur (export-only; entegrasyon ayrı dalgada).
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";

export const BINDIFF_TOOLS = ["rea_bindiff_fonksiyonlar", "rea_bindiff_karsilastir"] as const;

const PENCERE = 65536; // tek okuma üst sınırı (streaming tavanı)
const IMZA_BAYT = 16; // imza = fonksiyonun ilk 16 baytı (hex)
const AD_BAYT = 256; // sembol adı için tek okuma üst sınırı

export type FonkDesc = {
  kimlik: string; // ad varsa ad, yoksa sub_0x<.text-rölatif-ofset>
  ad: string | null;
  adres: string; // sanal adres (hex)
  offset: number; // .text-rölatif bayt ofseti
  boyut: number;
  hash: string; // sha256 hex
  imza: string; // ilk 16 bayt hex
};

export type DegisenDesc = {
  kimlik: string;
  ad: string | null;
  adres: string;
  eskiHash: string;
  yeniHash: string;
  eskiBoyut: number;
  yeniBoyut: number;
  eskiImza: string;
  yeniImza: string;
};

export type Istatistik = { okunanBayt: number; azamiBellekBayt: number };
type Engel = { ok: false; code: "capability_unsupported"; neden: string };
const engel = (neden: string): Engel => ({ ok: false, code: "capability_unsupported", neden });

// Sınırlı-pencereli okuyucu: her okuma PENCERE'yi aşmaz, sayaçları tutar.
class Akis {
  fd = -1;
  boy = 0;
  okunan = 0;
  tavan = 0;
  constructor(readonly yol: string) {
    this.boy = statSync(yol).size;
    this.fd = openSync(yol, "r");
  }
  kapat(): void {
    if (this.fd >= 0) { try { closeSync(this.fd); } catch { /* kapanmış */ } this.fd = -1; }
  }
  // [off, off+len) aralığını oku; dosya sonu kırpılır, menzil dışıysa null.
  oku(off: number, len: number): Buffer | null {
    if (off < 0 || off >= this.boy || len <= 0) return null;
    const n = Math.min(len, PENCERE, this.boy - off);
    const buf = Buffer.alloc(n);
    let doldu = 0;
    while (doldu < n) {
      const k = readSync(this.fd, buf, doldu, n - doldu, off + doldu);
      if (k <= 0) break;
      doldu += k;
    }
    if (doldu === 0) return null;
    const dilim = doldu === n ? buf : buf.subarray(0, doldu);
    this.okunan += dilim.length;
    if (dilim.length > this.tavan) this.tavan = dilim.length;
    return Buffer.from(dilim);
  }
}

const u16 = (b: Buffer, o: number): number => b.readUInt16LE(o);
const u32 = (b: Buffer, o: number): number => b.readUInt32LE(o);
const u64s = (b: Buffer, o: number): number => Number(b.readBigUInt64LE(o));
const hexAdres = (n: number): string => `0x${n.toString(16)}`;
const relKimlik = (rel: number): string => `sub_0x${rel.toString(16).padStart(8, "0")}`;

function cstr(b: Buffer, off: number): string {
  let son = off;
  while (son < b.length && b[son] !== 0) son++;
  return b.subarray(off, son).toString("utf8");
}

type MetinAraligi = { textOff: number; textLen: number; textVaddr: number };

// PE: MZ -> e_lfanew -> PE sig -> COFF -> OPT(magic) -> bölüm tablosu (gerçek SizeOfOptionalHeader).
function peMetin(akis: Akis): MetinAraligi | { hata: string } {
  const dos = akis.oku(0, 64);
  if (!dos || dos.length < 64 || dos[0] !== 0x4d || dos[1] !== 0x5a) return { hata: "PE değil (MZ imzası yok)" };
  const e = u32(dos, 0x3c);
  if (e > akis.boy - 24) return { hata: "PE değil (e_lfanew menzil dışı)" };
  const bas = akis.oku(e, 64);
  if (!bas || bas.length < 24 || u32(bas, 0) !== 0x00004550) return { hata: "PE değil (PE imzası yok)" };
  const nsec = u16(bas, 6);
  const sizeOpt = u16(bas, 20);
  if (nsec < 1 || nsec > 96) return { hata: "PE değil (bölüm sayısı geçersiz)" };
  if (sizeOpt < 32 || sizeOpt > 4096) return { hata: "PE değil (optional başlık boyutu geçersiz)" };
  const opt = e + 4 + 20;
  const ob = akis.oku(opt, sizeOpt);
  if (!ob || ob.length < sizeOpt) return { hata: "PE değil (optional başlık okunamadı)" };
  const magic = u16(ob, 0);
  if (magic !== 0x10b && magic !== 0x20b) return { hata: "PE değil (optional magic geçersiz)" };
  const secOff = opt + sizeOpt;
  const sec = akis.oku(secOff, nsec * 40);
  if (!sec || sec.length < nsec * 40) return { hata: "PE değil (bölüm tablosu okunamadı)" };
  let secilen = -1;
  for (let i = 0; i < nsec; i++) {
    const ad = cstr(sec, i * 40);
    const flags = u32(sec, i * 40 + 36);
    if (flags & 0x20) { secilen = i; break; }
    if (ad === ".text" && secilen < 0) secilen = i;
  }
  if (secilen < 0) return { hata: "PE değil (çalıştırılabilir bölüm yok)" };
  const o = secilen * 40;
  const vsize = u32(sec, o + 8), vaddr = u32(sec, o + 12);
  const rawsize = u32(sec, o + 16), rawptr = u32(sec, o + 20);
  if (rawptr >= akis.boy) return { hata: "PE değil (bölüm verisi menzil dışı)" };
  const textLen = Math.min(vsize || rawsize, rawsize, akis.boy - rawptr);
  if (textLen <= 0) return { hata: "PE değil (boş kod bölümü)" };
  return { textOff: rawptr, textLen, textVaddr: vaddr };
}

type ElfSembol = { ad: string | null; deger: number; boyut: number };

function elfCozum(akis: Akis): { aralik: MetinAraligi; semboller: ElfSembol[] } | { hata: string } {
  const h = akis.oku(0, 64);
  if (!h || h.length < 64 || h[0] !== 0x7f || h[1] !== 0x45 || h[2] !== 0x4c || h[3] !== 0x46)
    return { hata: "ELF değil (sihir yok)" };
  if (h[4] !== 2 || h[5] !== 1) return { hata: "ELF değil (yalnız 64-bit LE desteklenir)" };
  const shoff = u64s(h, 40), shentsize = u16(h, 58), shnum = u16(h, 60), shstrndx = u16(h, 62);
  if (shentsize !== 64 || shnum < 1 || shnum > 256) return { hata: "ELF değil (kesit tablosu geçersiz)" };
  if (shoff >= akis.boy) return { hata: "ELF değil (kesit tablosu menzil dışı)" };
  const sh = akis.oku(shoff, shnum * 64);
  if (!sh || sh.length < shnum * 64) return { hata: "ELF değil (kesit tablosu okunamadı)" };
  const kes = (i: number): { ad: number; tip: number; bayrak: number; v: number; off: number; boy: number; bag: number; bilgi: number; hiza: number; giris: number } => {
    const o = i * 64;
    return { ad: u32(sh, o), tip: u32(sh, o + 4), bayrak: u64s(sh, o + 8), v: u64s(sh, o + 16), off: u64s(sh, o + 24), boy: u64s(sh, o + 32), bag: u32(sh, o + 40), bilgi: u32(sh, o + 44), hiza: u64s(sh, o + 48), giris: u64s(sh, o + 56) };
  };
  if (shstrndx >= shnum) return { hata: "ELF değil (ad tablosu indisi geçersiz)" };
  const shstr = kes(shstrndx);
  if (shstr.boy <= 0 || shstr.boy > PENCERE || shstr.off >= akis.boy) return { hata: "ELF değil (kesit adları okunamadı)" };
  const adHam = akis.oku(shstr.off, shstr.boy);
  if (!adHam) return { hata: "ELF değil (kesit adları okunamadı)" };
  const ad = (i: number): string => (i < 0 || i >= adHam.length ? "" : cstr(adHam, i));
  let metinIdx = -1, metin = { textOff: 0, textLen: 0, textVaddr: 0 };
  for (let i = 1; i < shnum; i++) {
    const k = kes(i);
    if (k.tip === 1 && k.bayrak & 0x4) {
      if (ad(k.ad) === ".text") {
        metinIdx = i;
        metin = { textOff: k.off, textLen: k.boy, textVaddr: k.v };
        break;
      }
      if (metinIdx < 0) { metinIdx = i; metin = { textOff: k.off, textLen: k.boy, textVaddr: k.v }; }
    }
  }
  if (metinIdx < 0 || metin.textLen <= 0 || metin.textOff >= akis.boy)
    return { hata: "ELF değil (çalıştırılabilir bölüm yok)" };
  metin.textLen = Math.min(metin.textLen, akis.boy - metin.textOff);
  // Sembol tabloları: STT_FUNC + aynı kesit + menzil içi. Aday adlar strtab'dan istek üzerine okunur.
  const semboller: ElfSembol[] = [];
  for (let i = 1; i < shnum; i++) {
    const t = kes(i);
    if (t.tip !== 2 || t.giris !== 24 || t.boy <= 0) continue;
    if (t.bag >= shnum) continue;
    const str = kes(t.bag);
    if (str.tip !== 3 || str.off >= akis.boy) continue;
    const sayi = Math.floor(t.boy / 24);
    if (sayi > 1_000_000) continue;
    for (let g = 0; g < sayi; g += 256) {
      const ilk = g, son = Math.min(sayi, g + 256);
      const blok = akis.oku(t.off + ilk * 24, (son - ilk) * 24);
      if (!blok) break;
      for (let j = ilk; j < son; j++) {
        const o = (j - ilk) * 24;
        const bilgi = blok[o + 4] & 0xf;
        if (bilgi !== 2) continue; // STT_FUNC değil
        if (u16(blok, o + 6) !== metinIdx) continue;
        const deger = u64s(blok, o + 8), boyut = u64s(blok, o + 16);
        if (boyut <= 0 || boyut > metin.textLen) continue;
        if (deger < metin.textVaddr || deger + boyut > metin.textVaddr + metin.textLen) continue;
        const adOff = u32(blok, o);
        let isim: string | null = null;
        if (str.boy > 0 && str.boy <= 16 * 1024 * 1024 && adOff < str.boy) {
          const ham = akis.oku(str.off + adOff, Math.min(AD_BAYT, str.boy - adOff));
          if (ham) { const s = cstr(ham, 0); if (s) isim = s; }
        }
        semboller.push({ ad: isim, deger, boyut });
      }
    }
  }
  semboller.sort((a, b) => a.deger - b.deger);
  return { aralik: metin, semboller };
}

// [off, off+len) aralığını parçalı hashle (imzayla birlikte).
function aralikOzet(akis: Akis, off: number, len: number): { hash: string; imza: string } {
  const ozet = createHash("sha256");
  let imzaBayt = Buffer.alloc(0);
  let kalan = len, p = off;
  while (kalan > 0) {
    const parca = akis.oku(p, Math.min(PENCERE, kalan));
    if (!parca || parca.length === 0) break;
    ozet.update(parca);
    if (imzaBayt.length < IMZA_BAYT) imzaBayt = Buffer.concat([imzaBayt, parca.subarray(0, IMZA_BAYT - imzaBayt.length)]);
    p += parca.length;
    kalan -= parca.length;
  }
  return { hash: ozet.digest("hex"), imza: imzaBayt.toString("hex") };
}

// ret (0xC3) ayracıyla fonksiyonlara böl: tek geçiş, sınırlı pencere.
function retBol(akis: Akis, aralik: MetinAraligi): FonkDesc[] {
  const out: FonkDesc[] = [];
  let rel = 0, bas = 0, uzun = 0;
  let ozet = createHash("sha256");
  let imzaBayt = Buffer.alloc(0);
  const bitir = (son: number): void => {
    out.push({
      kimlik: relKimlik(bas), ad: null, adres: hexAdres(aralik.textVaddr + bas),
      offset: bas, boyut: uzun, hash: ozet.digest("hex"), imza: imzaBayt.toString("hex"),
    });
    void son;
    ozet = createHash("sha256");
    imzaBayt = Buffer.alloc(0);
    uzun = 0;
  };
  while (rel < aralik.textLen) {
    const pencere = akis.oku(aralik.textOff + rel, Math.min(PENCERE, aralik.textLen - rel));
    if (!pencere || pencere.length === 0) break;
    let s = 0;
    for (;;) {
      const p = pencere.indexOf(0xc3, s);
      if (p < 0) break;
      const parca = pencere.subarray(s, p + 1);
      ozet.update(parca);
      if (imzaBayt.length < IMZA_BAYT) imzaBayt = Buffer.concat([imzaBayt, parca.subarray(0, IMZA_BAYT - imzaBayt.length)]);
      uzun += parca.length;
      bitir(rel + p + 1);
      bas = rel + p + 1;
      s = p + 1;
    }
    if (s < pencere.length) {
      const kalan = pencere.subarray(s);
      ozet.update(kalan);
      if (imzaBayt.length < IMZA_BAYT) imzaBayt = Buffer.concat([imzaBayt, kalan.subarray(0, IMZA_BAYT - imzaBayt.length)]);
      uzun += kalan.length;
    }
    rel += pencere.length;
  }
  if (uzun > 0) bitir(rel); // ret'siz kuyruk da fonksiyondur (uydurma yok, görünen bayt)
  return out;
}

// Dosyadaki fonksiyonları listele: sembol varsa adla, yoksa adresle.
export function rea_bindiff_fonksiyonlar(yol: string) {
  if (!yol) return engel("yol boş");
  if (!existsSync(yol)) return engel(`dosya yok: ${yol}`);
  let akis: Akis;
  try {
    akis = new Akis(yol);
  } catch {
    return engel(`dosya açılamadı: ${yol}`);
  }
  try {
    if (akis.boy < 4) return engel("desteklenmeyen biçim (dosya çok küçük)");
    const sihir = akis.oku(0, 4);
    if (!sihir) return engel("desteklenmeyen biçim (okunamadı)");
    const pe = sihir[0] === 0x4d && sihir[1] === 0x5a;
    const elf = sihir[0] === 0x7f && sihir[1] === 0x45 && sihir[2] === 0x4c && sihir[3] === 0x46;
    if (!pe && !elf) return engel("desteklenmeyen biçim (yalnız PE/ELF)");
    if (pe) {
      const m = peMetin(akis);
      if ("hata" in m) return engel(m.hata);
      const fonksiyonlar = retBol(akis, m);
      return {
        ok: true as const, arac: "rea_bindiff_fonksiyonlar", dosya: yol, bicim: "pe" as const,
        sembollu: false, fonksiyonlar, sayi: fonksiyonlar.length,
        istatistik: { okunanBayt: akis.okunan, azamiBellekBayt: akis.tavan } satisfies Istatistik,
      };
    }
    const e = elfCozum(akis);
    if ("hata" in e) return engel(e.hata);
    const { aralik, semboller } = e;
    if (semboller.length > 0) {
      const fonksiyonlar: FonkDesc[] = semboller.map((s) => {
        const rel = s.deger - aralik.textVaddr;
        const { hash, imza } = aralikOzet(akis, aralik.textOff + rel, s.boyut);
        return {
          kimlik: s.ad ?? relKimlik(rel), ad: s.ad, adres: hexAdres(s.deger),
          offset: rel, boyut: s.boyut, hash, imza,
        };
      });
      return {
        ok: true as const, arac: "rea_bindiff_fonksiyonlar", dosya: yol, bicim: "elf" as const,
        sembollu: true, fonksiyonlar, sayi: fonksiyonlar.length,
        istatistik: { okunanBayt: akis.okunan, azamiBellekBayt: akis.tavan } satisfies Istatistik,
      };
    }
    const fonksiyonlar = retBol(akis, aralik);
    return {
      ok: true as const, arac: "rea_bindiff_fonksiyonlar", dosya: yol, bicim: "elf" as const,
      sembollu: false, fonksiyonlar, sayi: fonksiyonlar.length,
      istatistik: { okunanBayt: akis.okunan, azamiBellekBayt: akis.tavan } satisfies Istatistik,
    };
  } finally {
    akis.kapat();
  }
}

// İki sürümü karşılaştır: eklenen / çıkarılan / değişen / aynen.
export function rea_bindiff_karsilastir(eskiYol: string, yeniYol: string) {
  const e = rea_bindiff_fonksiyonlar(eskiYol);
  if (!e.ok) return e;
  const y = rea_bindiff_fonksiyonlar(yeniYol);
  if (!y.ok) return y;
  const tuketilen = new Set<FonkDesc>();
  const yeniKuyruk = new Map<string, FonkDesc[]>();
  for (const f of y.fonksiyonlar) {
    const k = yeniKuyruk.get(f.hash);
    if (k) k.push(f);
    else yeniKuyruk.set(f.hash, [f]);
  }
  const aynen: string[] = [];
  const kalmisEski: FonkDesc[] = [];
  for (const f of e.fonksiyonlar) {
    const kuyruk = yeniKuyruk.get(f.hash);
    const aday = kuyruk?.find((a) => !tuketilen.has(a));
    if (aday) { tuketilen.add(aday); aynen.push(f.kimlik); }
    else kalmisEski.push(f);
  }
  const yeniKimlik = new Map<string, FonkDesc>();
  for (const f of y.fonksiyonlar) {
    if (!tuketilen.has(f) && !yeniKimlik.has(f.kimlik)) yeniKimlik.set(f.kimlik, f);
  }
  const degisen: DegisenDesc[] = [];
  const cikarilan: FonkDesc[] = [];
  for (const f of kalmisEski) {
    const karsilik = yeniKimlik.get(f.kimlik);
    if (karsilik) {
      tuketilen.add(karsilik);
      degisen.push({
        kimlik: f.kimlik, ad: karsilik.ad ?? f.ad, adres: karsilik.adres,
        eskiHash: f.hash, yeniHash: karsilik.hash,
        eskiBoyut: f.boyut, yeniBoyut: karsilik.boyut,
        eskiImza: f.imza, yeniImza: karsilik.imza,
      });
    } else {
      cikarilan.push(f);
    }
  }
  const eklenen = y.fonksiyonlar.filter((f) => !tuketilen.has(f));
  eklenen.sort((a, b) => a.offset - b.offset);
  cikarilan.sort((a, b) => a.offset - b.offset);
  degisen.sort((a, b) => (a.kimlik < b.kimlik ? -1 : a.kimlik > b.kimlik ? 1 : 0));
  return {
    ok: true as const, arac: "rea_bindiff_karsilastir", eski: eskiYol, yeni: yeniYol,
    eklenen, cikarilan, degisen, aynen,
    ozet: { eklenen: eklenen.length, cikarilan: cikarilan.length, degisen: degisen.length, aynen: aynen.length },
    istatistik: {
      okunanBayt: e.istatistik.okunanBayt + y.istatistik.okunanBayt,
      azamiBellekBayt: Math.max(e.istatistik.azamiBellekBayt, y.istatistik.azamiBellekBayt),
    } satisfies Istatistik,
  };
}
