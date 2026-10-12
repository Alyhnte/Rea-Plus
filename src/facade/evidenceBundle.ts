// rea-plus facade: kanıt paketi (evidence bundle)
// Büyük blob'lar pakete gömülmez; ev_* referansıyla retained-evidence deposunda tutulur.
import { createHash } from "node:crypto";
import { mergedCatalog } from "./catalogMerge.js";

// Retained-evidence kaydı: içerik deposunda durur, pakete yalnız referansı girer.
export interface RetainedEvidence {
  // Kararlı referans: her zaman "ev_" ile başlar (örn. ev_9f2c…).
  id: `ev_${string}`;
  sha256: string;
  bytes: number;
  mime: string;
}

// Tek kanıt girdisi: satır içi küçük değer ya da ev_* referansı taşır.
export interface EvidenceItem {
  ad: string;
  // Satır içi değer 4KB altı işler için; üstü retained-evidence ister.
  inline?: string;
  ref?: `ev_${string}`;
}

// Stabil paket: digest + tools_sha256 her derlemede aynı sırayla hesaplanır.
export interface EvidenceBundle {
  digest: string;
  tools_sha256: string;
  items: EvidenceItem[];
  retained: RetainedEvidence[];
}

// ev_* öneki koruması: yanlış referans pakete girmeden elenir.
export function isRetainedRef(id: string): id is `ev_${string}` {
  return id.startsWith("ev_") && id.length > 4;
}

// Katalog kimliklerinden stabil tools_sha256 üretir (sıralı + birleşik hash).
export function buildToolsSha256(ids?: readonly string[]): string {
  // Varsayılan: mergedCatalog() kimlikleri; sıralama stabiliteyi garanti eder.
  const list = [...(ids ?? mergedCatalog().map((c) => c.id))].sort();
  return createHash("sha256").update(list.join("\n"), "utf8").digest("hex");
}

// Paket özeti: öğe adları + referanslar + tools_sha256 tek digest'te birleşir.
export function buildEvidenceBundle(items: EvidenceItem[], retained: RetainedEvidence[]): EvidenceBundle {
  // Önce referans bütünlüğü denetlenir, sonra özet hesaplanır.
  for (const it of items) {
    if (it.ref && !isRetainedRef(it.ref)) throw new Error(`geçersiz evidence ref: ${it.ref}`);
  }
  const tools_sha256 = buildToolsSha256();
  const body = JSON.stringify({ items, retained: retained.map((r) => r.id), tools_sha256 });
  const digest = createHash("sha256").update(body, "utf8").digest("hex");
  return { digest, tools_sha256, items, retained };
}

// Paketi doğrular: digest yeniden hesaplanır, tools_sha256 katalogla karşılaştırılır.
export function verifyEvidenceBundle(bundle: EvidenceBundle): boolean {
  const body = JSON.stringify({ items: bundle.items, retained: bundle.retained.map((r) => r.id), tools_sha256: bundle.tools_sha256 });
  const digest = createHash("sha256").update(body, "utf8").digest("hex");
  return digest === bundle.digest && bundle.tools_sha256 === buildToolsSha256();
}
