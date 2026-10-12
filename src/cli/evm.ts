// cli/evm: EVM imza -> selector (gerçek keccak, offline)
// js-sha3 kullanılır, ilk 4 byte selector olur.
import { keccak256 } from "js-sha3";

// Çıktı tipi: CLI hem metin hem JSON basar.
export interface EvmSonuc {
  sig: string;
  selector: string;
}

// İmzayı kanonik forma yaklaştır: boşlukları at.
export function kanonikSig(sig: string): string {
  return sig.replace(/\s+/g, "");
}

// İmza geçerli mi: "name(tipler)" formu gerekir.
export function sigGecerli(sig: string): boolean {
  return sig.includes("(") && sig.includes(")") && sig.indexOf("(") < sig.indexOf(")");
}

// Selector hesapla: keccak256 hex ilk 8 hanesi + 0x.
export function selectorUret(sig: string): EvmSonuc {
  const temiz = kanonikSig(sig);
  if (!sigGecerli(temiz)) {
    throw new Error("geçersiz imza, örnek: transfer(address,uint256)");
  }
  const hex = keccak256(temiz);
  return { sig: temiz, selector: `0x${hex.slice(0, 8)}` };
}

// CLI komutu: analyze-evm "transfer(address,uint256)" [--json]
export function runEvmCommand(args: string[], json: boolean): void {
  const sig = args[0] ?? "";
  if (!sig) {
    const msg = 'kullanım: analyze-evm "transfer(address,uint256)" [--json]';
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(msg);
    process.exitCode = 1;
    return;
  }
  try {
    const sonuc = selectorUret(sig);
    if (json) console.log(JSON.stringify({ ok: true, ...sonuc }));
    else console.log(`${sonuc.sig} -> ${sonuc.selector}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(`hata: ${msg}`);
    process.exitCode = 1;
  }
}
