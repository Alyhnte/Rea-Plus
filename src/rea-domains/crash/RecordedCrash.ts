// Kayıtlı crash notu ayrıştırıcı: hedef çalıştırılmaz, metin parse edilir.
// Girdi ham metin ya da dosya yolu olabilir (dosya varsa okunur).
import { existsSync, readFileSync } from "node:fs";
// Girdi tek satırlık mevcut yolsa dosya okunur, değilse ham metin sayılır.
function metniCoz(girdi: string): string {
  const g = (girdi ?? "").trim();
  if (!g) return "";
  if (!g.includes("\n") && existsSync(g)) {
    try { return readFileSync(g, "utf8"); } catch { return ""; }
  }
  return girdi;
}
// Sinyal satırı: önce büyük harfli SIG/EXC jetonu (case-sensitive, "Signal"
// sözcüğü eşleşmesin), yoksa "signal <no>" kalıbı aranır.
function sinyalBul(metin: string): string {
  const m1 = metin.match(/\b(SIG[A-Z]{2,}|EXC_[A-Z_]+)\b/);
  if (m1) return (m1[1] as string).trim();
  const m2 = metin.match(/signal\s+\d+[^\n]{0,40}/i);
  return m2 ? (m2[0] as string).trim() : "bilinmiyor";
}
// Kayıt parse: thread blokları + frame satırları + register satırları.
export function rea_crash_kayit_parse(girdi: string) {
  const metin = metniCoz(girdi);
  if (!metin.trim()) return { ok: false as const, code: "capability_unsupported" as const, neden: "boş crash kaydı" };
  const parcalar = metin.split(/(?=^Thread \d+|^thread #\d+)/gim).filter((s) => s.trim());
  // Başlık öncesi giriş satırları blok sayılmasın (thread başlığıyla başlayanlar alınır).
  const threadBlok = parcalar.filter((s) => /^Thread \d+|^thread #\d+/im.test(s));
  const bloklar = threadBlok.length > 0 ? threadBlok : [metin];
  const threadler = bloklar.map((blok) => {
    const baslik = (blok.split("\n")[0] ?? "").trim().slice(0, 120);
    const satirlar = blok.split("\n").map((s) => s.trim());
    const frameler = satirlar.filter((s) => /(^#\d+|^\d+\s+\S+\s+0x|0x[0-9a-f]+\s+in\s|\bat\b.+#)/i.test(s)).map((s) => s.slice(0, 200)).slice(0, 30);
    return { baslik, frameSayisi: frameler.length, frameler };
  });
  const registerlar = metin.split("\n").filter((s) => /^\s*(rax|rbx|rcx|rdx|rsi|rdi|rbp|rsp|rip|r8|r9|r1[0-5]|eax|ebx|pc|sp|lr|x\d+)\s*[:=]/im).map((s) => s.trim().slice(0, 120)).slice(0, 32);
  return { ok: true as const, arac: "rea_crash_kayit_parse", sinyal: sinyalBul(metin), threadSayisi: threadler.length, threadler, registerlar };
}
// Özet: thread sayısı + sinyal + ilk frame (crashed thread öncelikli).
export function rea_crash_ozet(girdi: string) {
  const p = rea_crash_kayit_parse(girdi);
  if (!p.ok) return p;
  const crashed = p.threadler.find((t) => /crash/i.test(t.baslik)) ?? p.threadler[0];
  return { ok: true as const, arac: "rea_crash_ozet", sinyal: p.sinyal, threadSayisi: p.threadSayisi, ilkFrame: crashed?.frameler[0] ?? "yok", registerSayisi: p.registerlar.length };
}
