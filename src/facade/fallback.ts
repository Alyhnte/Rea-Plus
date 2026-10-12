// rea-plus facade: araç yedeği (saf tablo + saf fonksiyon).
// catalogMerge.ts içindeki rea araçları yoksa denenebilir zincir kurar.
export const FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  // JEB lisanslıdır; yoksa açık kaynak jadx ile devam edilir.
  jeb: ["jadx"],
  // jadx yoksa kaynak yerine apktool ile devam edilir.
  jadx: ["apktool"],
  // Ghidra ağır kurulumdur; önce Cutter (açık, rizin) sonra Hopper/IDA denenir.
  ghidra: ["cutter", "hopper", "ida"],
  // Hopper lisanslıdır; önce açık Cutter, yoksa IDA denenir.
  hopper: ["cutter", "ida"],
  // Cutter açık kaynaktır; rizin CLI yoksa hopper/ida denenir.
  cutter: ["hopper", "ida"],
  // Binwalk Linux ister; yoksa unblob denenir.
  binwalk: ["unblob"],
  // WABT zinciri: wasm2wat yoksa wat2wasm, o da yoksa unsupported.
  wasm2wat: ["wat2wasm"],
};
// Birincil mevcutsa [birincil], yoksa mevcut yedekleri sırayla döner.
// Hiçbiri yoksa [] döner; wasm2wat özelinde ["unsupported"] döner.
export function resolveChain(birincil: string, mevcut: Set<string>): string[] {
  // Birincil kuruluysa zincire gerek yoktur.
  if (mevcut.has(birincil)) return [birincil];
  // Tabloda yoksa denenebilir yedek de yoktur.
  const yedekler = FALLBACKS[birincil] ?? [];
  // Sırayı koruyup yalnız mevcut olanları al (girdi Set'i değişmez).
  const bulunan = yedekler.filter((aday) => mevcut.has(aday));
  if (bulunan.length > 0) return bulunan;
  // wasm2wat için ters yön de yoksa çağıran unsupported dalına gider.
  if (birincil === "wasm2wat") return ["unsupported"];
  return [];
}
