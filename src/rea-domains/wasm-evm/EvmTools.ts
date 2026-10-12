// EvmTools: gerçek wasm-validate + saf TS EVM disas (salt-okunur, yürütme yok).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
// Sonuç birliği: başarılı analiz ya da kapı/bozuk bilgisi.
export type EvmSonuc = { ok: true; arac: string; ozet: string; detay?: unknown } | { ok: false; code: string; neden: string };
// wasm-validate adayları: env öncelikli, sonra bilinen kurulum yolu.
function adaylar(): string[] {
  const e = process.env.REA_WABT_BIN;
  const sabit = "C:\\tools\\wabt\\bin\\wasm-validate.exe";
  return e ? [e, sabit, "wasm-validate"] : [sabit, "wasm-validate"];
}
// WASM doğrulama: yoksa kapı, bozuksa invalid_wasm, sağlamsa geçerli.
export function rea_wasm_validate(yol: string): EvmSonuc {
  if (!yol || !existsSync(yol)) return { ok: false, code: "capability_unsupported", neden: `Dosya yok: ${yol}` };
  for (const bin of adaylar()) {
    try {
      execFileSync(bin, [yol], { stdio: "ignore", timeout: 15000 });
      return { ok: true, arac: "rea_wasm_validate", ozet: "geçerli", detay: { dosya: yol, gecerli: true } };
    } catch (e: unknown) {
      const kod = (e as { status?: number })?.status;
      if (typeof kod === "number" && kod !== 0) return { ok: false, code: "invalid_wasm", neden: `kal: ${yol}` };
    }
  }
  return { ok: false, code: "capability_unsupported", neden: "wasm-validate yok" };
}
// Tekil opcode adları: arith/logic/jump/sys tam tablosu.
const AD: Record<number, string> = { 0: "STOP", 1: "ADD", 2: "MUL", 3: "SUB", 4: "DIV", 5: "SDIV", 6: "MOD", 7: "SMOD", 8: "ADDMOD", 9: "MULMOD", 10: "EXP", 11: "SIGNEXTEND", 16: "LT", 17: "GT", 18: "SLT", 19: "SGT", 20: "EQ", 21: "ISZERO", 22: "AND", 23: "OR", 24: "XOR", 25: "NOT", 26: "BYTE", 27: "SHL", 28: "SHR", 29: "SAR", 32: "SHA3", 48: "ADDRESS", 49: "BALANCE", 50: "ORIGIN", 51: "CALLER", 52: "CALLVALUE", 53: "CALLDATALOAD", 54: "CALLDATASIZE", 55: "CALLDATACOPY", 56: "CODESIZE", 57: "CODECOPY", 58: "GASPRICE", 59: "EXTCODESIZE", 60: "EXTCODECOPY", 61: "RETURNDATASIZE", 62: "RETURNDATACOPY", 63: "EXTCODEHASH", 64: "BLOCKHASH", 65: "COINBASE", 66: "TIMESTAMP", 67: "NUMBER", 68: "DIFFICULTY", 69: "GASLIMIT", 70: "CHAINID", 71: "SELFBALANCE", 72: "BASEFEE", 80: "POP", 81: "MLOAD", 82: "MSTORE", 83: "MSTORE8", 84: "SLOAD", 85: "SSTORE", 86: "JUMP", 87: "JUMPI", 88: "PC", 89: "MSIZE", 90: "GAS", 91: "JUMPDEST", 240: "CREATE", 241: "CALL", 242: "CALLCODE", 243: "RETURN", 244: "DELEGATECALL", 245: "CREATE2", 250: "STATICCALL", 253: "REVERT", 254: "INVALID", 255: "SELFDESTRUCT" };
// Aralık opcode adları: PUSH1-32, DUP1-16, SWAP1-16, LOG0-4.
function aralikAd(b: number): string | null {
  if (b >= 96 && b <= 127) return `PUSH${b - 95}`;
  if (b >= 128 && b <= 143) return `DUP${b - 127}`;
  if (b >= 144 && b <= 159) return `SWAP${b - 143}`;
  if (b >= 160 && b <= 164) return `LOG${b - 160}`;
  return null;
}
// Saf EVM disas: her bayt pc+opcode+operand ile çözülür, yürütme yok.
export function rea_evm_disasm(hex: string): EvmSonuc {
  const s = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!s || s.length % 2 !== 0 || /[^0-9a-fA-F]/.test(s)) return { ok: false, code: "capability_unsupported", neden: "boş/geçersiz hex" };
  const bayt = Buffer.from(s, "hex");
  const ops: { pc: number; opcode: string; ad: string; operand: string | null }[] = [];
  let pc = 0;
  while (pc < bayt.length) {
    const b = bayt[pc] as number;
    const ad = AD[b] ?? aralikAd(b) ?? `UNKNOWN_0x${b.toString(16)}`;
    let operand: string | null = null;
    const baslangic = pc;
    if (ad.startsWith("PUSH")) { const n = b - 95; operand = "0x" + Buffer.from(bayt.subarray(pc + 1, pc + 1 + n)).toString("hex"); pc += n; }
    ops.push({ pc: baslangic, opcode: "0x" + b.toString(16).padStart(2, "0"), ad, operand });
    pc += 1;
  }
  return { ok: true, arac: "rea_evm_disasm", ozet: `${ops.length} op`, detay: { ops } };
}
