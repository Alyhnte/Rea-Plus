// rea-plus facade: tool namespace
// conduit 30 ismi donduruldu, rea kökenliler prefix zorunlu.
export const FROZEN_CONDUIT_TOOLS: readonly string[] = [
  "health", "session_open", "session_close", "session_list", "events_pull",
  "static_info", "open_target", "close_target",
  "disassemble", "get_cfg", "xrefs", "strings", "dump",
  "debug_open", "debug_attach", "debug_close", "debug_state",
  "debug_breakpoint", "debug_continue", "debug_step", "debug_pause",
  "debug_registers", "debug_callstack",
  "debug_memory", "debug_code", "debug_thread", "debug_plugin", "debug_time",
  "explain", "prerequisites",
];

export function qualifyReaTool(name: string): string {
  if ((FROZEN_CONDUIT_TOOLS as readonly string[]).includes(name)) {
    return `rea_${name}`;
  }
  return name;
}

export function assertNoCollision(names: string[]): void {
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) throw new Error(`tool collision: ${n}`);
    seen.add(n);
  }
  for (const f of FROZEN_CONDUIT_TOOLS) {
    // rea tarafı çıplak frozen ismi kullanamaz
    if (names.includes(f) && !names.includes(`rea_${f}`)) {
      throw new Error(`rea tool must be prefixed, got bare: ${f}`);
    }
  }
}
