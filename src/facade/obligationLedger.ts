// rea-plus facade: yükümlülük defteri (obligation ledger)
// Her bulgu kod satırına, her kod satırı teste bağlanır; zincir koparsa derleme durur.
export type ObligationDurum = "açık" | "kodlandı" | "testli" | "kapalı";

// Tek zincir halkası: bulgu -> kod -> test üçlüsünü birlikte tutar.
export interface ObligationLink {
  bulgu: string; // Örn. "OB-042: jadx headless bayrak hatası"
  kod: string; // Örn. "src/rea-domains/android/JadxBridge.ts:31"
  test: string; // Örn. "tests/android/jadx.flags.test.ts::headless"
  durum: ObligationDurum;
}

// Defter: kurulduğu andaki katalog + paket digest'ine mühürlenir.
export interface ObligationLedger {
  ledger_id: string;
  tools_sha256: string;
  evidence_digest: string;
  links: ObligationLink[];
  kapatıldı: boolean;
}

// Defteri kurar: bulgu listesi halkalara dönüşür, hepsi "açık" başlar.
export function build_reconstruction_obligation_ledger(
  bulgular: string[],
  opts: { tools_sha256: string; evidence_digest: string; ledger_id?: string },
): ObligationLedger {
  // Boş bulgu listesi geçersizdir; defter en az bir halka ister.
  if (bulgular.length === 0) throw new Error("obligation ledger boş bulguyla kurulamaz");
  const links: ObligationLink[] = bulgular.map((bulgu) => ({ bulgu, kod: "", test: "", durum: "açık" }));
  return { ledger_id: opts.ledger_id ?? `obl_${Date.now().toString(36)}`, tools_sha256: opts.tools_sha256, evidence_digest: opts.evidence_digest, links, kapatıldı: false };
}

// Halkayı ilerletir: kod yazılınca "kodlandı", test bağlanınca "testli" olur.
export function advanceObligation(ledger: ObligationLedger, bulgu: string, kod: string, test?: string): ObligationLedger {
  // Kapalı defter değişmez; önce yeniden açılmalıdır.
  if (ledger.kapatıldı) throw new Error("kapalı defter ilerletilemez");
  const links = ledger.links.map((l) => {
    if (l.bulgu !== bulgu) return l;
    if (test) return { ...l, kod, test, durum: "testli" as const };
    return { ...l, kod, durum: "kodlandı" as const };
  });
  return { ...ledger, links };
}

// Zinciri doğrular: her "testli" halkanın kod ve test alanı dolu olmalıdır.
export function verifyObligationChain(ledger: ObligationLedger): { ok: boolean; eksik: string[] } {
  // Eksik halkalar kapatmayı engeller; listeleyip çağırana bildirir.
  const eksik = ledger.links.filter((l) => {
    if (l.durum === "açık") return true;
    if (!l.kod) return true;
    if (l.durum === "testli" && !l.test) return true;
    return false;
  }).map((l) => l.bulgu);
  return { ok: eksik.length === 0, eksik };
}

// Defteri kapatır: yalnız zincir tamamsa mühürlenir, sonrası salt-okunurdur.
export function closeObligationLedger(ledger: ObligationLedger): ObligationLedger {
  const { ok, eksik } = verifyObligationChain(ledger);
  // Kapatma kapısı: tek eksik halka bile kapanışı durdurur.
  if (!ok) throw new Error(`zincir eksik, kapatılamaz: ${eksik.join(", ")}`);
  const links = ledger.links.map((l) => ({ ...l, durum: "kapalı" as const }));
  return { ...ledger, links, kapatıldı: true };
}
