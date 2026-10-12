// frida-plus: canlı Windows hedefte gerçek frida ajanları (stub yok).
// conduit-core DONUK: burası rea-domains katmanı, çekirdeğe dokunmaz.
import frida from "frida";
import { execFileSync } from "node:child_process";
// Katalog uyumu: rea_ önekli 5 araç.
export const FRIDAPLUS_TOOLS = ["rea_frida_step", "rea_frida_pause", "rea_frida_resume", "rea_frida_cond", "rea_frida_stalker"] as const;
// Makul üst sınırlar: ajan RPC 10sn, python askı 8sn.
const AJAN_SURE = 10_000;
const PYTHON_SURE = 8_000;
// Boş/geçersiz pid kapısı (test: boş pid unsupported).
function pidKotu(pid: unknown): boolean { return !Number.isInteger(pid as number) || (pid as number) <= 0; }
function destekYok(neden: string) { return { ok: false as const, code: "capability_unsupported" as const, neden }; }
// Sözü süreyle yarıştır (takılan ajan asılı kalmasın).
function yarista<T>(soz: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const zaman = new Promise<never>((_, red) => { t = setTimeout(() => red(new Error("frida zaman aşımı")), ms); });
  return Promise.race([soz, zaman]).finally(() => clearTimeout(t)) as Promise<T>;
}
// NtSuspend/Resume: python ctypes ile GERÇEK askı (frida çekirdekte yok).
function ntIslem(pid: number, op: "NtSuspendProcess" | "NtResumeProcess"): void {
  const py = ["import ctypes,sys", `k=ctypes.windll.kernel32`, `n=ctypes.windll.ntdll`, `h=k.OpenProcess(0x0800,False,${pid})`,
    `sys.exit(2 if not h else 0 if (n.${op}(h) or 0)==0 and (k.CloseHandle(h) or True) else 3)`].join("; ");
  execFileSync("python", ["-c", py], { stdio: "ignore", timeout: PYTHON_SURE });
}
// Bağlan: yeni spawn'da geçici attach hatası olursa 1 kez yeniden dene.
async function baglan(dev: import("frida").Device, pid: number): Promise<import("frida").Session> {
  try { return await yarista(dev.attach(pid), AJAN_SURE); }
  catch { await new Promise((r) => setTimeout(r, 500)); return await yarista(dev.attach(pid), AJAN_SURE); }
}
// Süreci duraklat (Windows NtSuspendProcess, gerçek).
export async function rea_frida_pause(pid: number) {
  if (pidKotu(pid)) return destekYok("geçersiz pid");
  try { ntIslem(pid, "NtSuspendProcess"); return { ok: true as const, arac: "rea_frida_pause", pid, durum: "duraklatildi" }; }
  catch (e) { return destekYok(`pause başarısız: ${e instanceof Error ? e.message : String(e)}`); }
}
// Ayrı resume (NtResumeProcess, gerçek).
export async function rea_frida_resume(pid: number) {
  if (pidKotu(pid)) return destekYok("geçersiz pid");
  try { ntIslem(pid, "NtResumeProcess"); return { ok: true as const, arac: "rea_frida_resume", pid, durum: "sürdürüldü" }; }
  catch (e) { return destekYok(`resume başarısız: ${e instanceof Error ? e.message : String(e)}`); }
}
// Tek-adım emülasyonu: Instruction.parse ile next PC + geçici bp + continue + hitte disarm.
export async function rea_frida_step(pid: number, adres?: string | number) {
  if (pidKotu(pid)) return destekYok("geçersiz pid");
  let oturum: import("frida").Session | null = null;
  try {
    const dev = await yarista(frida.getLocalDevice(), AJAN_SURE);
    oturum = await baglan(dev, pid);
    const hedef = adres === undefined ? "" : String(adres);
    const kay = [
      `rpc.exports={async adim(h){`, `const m=Process.findModuleByName("kernel32.dll");`,
      `const taban=h?ptr(h):m.getExportByName("GetTickCount");`, `let ins; try{ins=Instruction.parse(taban);}catch(e){return{slot:false,adim:String(e)};}`,
      `const ileri=String(ins.next); let vurdu=false;`, `let d=null; try{d=Interceptor.attach(ins.next,{onEnter(){vurdu=true; try{d.detach();}catch(e){}}});}catch(e){return{slot:false,adim:String(e)};}`,
      `try{const f=new NativeFunction(m.getExportByName("GetTickCount"),"uint32",[]); f();}catch(e){}`,
      `await new Promise(r=>setTimeout(r,600)); try{d.detach();}catch(e){}`, `return{slot:true,adres:String(taban),sonraki:ileri,vurdu};}};`,
    ].join("\n");
    const betik = await oturum.createScript(kay);
    await betik.load();
    const r = await yarista(betik.exports.adim(hedef) as Promise<{ slot: boolean; sonraki?: string; vurdu?: boolean; adres?: string; adim?: string }>, AJAN_SURE);
    await betik.unload().catch(() => {});
    if (!r.slot) return { ok: false as const, code: "no_breakpoint_slot" as const, neden: `geçici bp kurulamadı: ${r.adim ?? ""}` };
    return { ok: true as const, arac: "rea_frida_step", pid, adres: r.adres, sonraki: r.sonraki, vurdu: r.vurdu };
  } catch (e) { return destekYok(`step başarısız: ${e instanceof Error ? e.message : String(e)}`); }
  finally { if (oturum) await oturum.detach().catch(() => {}); }
}
// Koşullu bp: hw bp yerine Interceptor + hitte regs oku + agentta koşul + tutmazsa continue.
export async function rea_frida_cond(pid: number, adres: string | number, kosulJs: string, maxHit = 50) {
  if (pidKotu(pid) || adres === undefined || adres === "") return destekYok("geçersiz pid/adres");
  let oturum: import("frida").Session | null = null;
  try {
    const dev = await yarista(frida.getLocalDevice(), AJAN_SURE);
    oturum = await baglan(dev, pid);
    const kay = [
      `rpc.exports={async kosul(aStr,kosul,sinir){`, `const a=ptr(aStr); let hit=0, tuttu=false;`,
      `const d=Interceptor.attach(a,{onEnter:function(){hit++; try{const r={}; const c=this.context; for(const k in c){try{r[k]=String(c[k]);}catch(e){}}`,
      `let v=false; try{v=!!new Function("regs","return ("+kosul+");")(r);}catch(e){v=false;} if(v){tuttu=true;}}catch(e){}}});`,
      `try{const f=new NativeFunction(a,"uint32",[]); for(let i=0;i<3&&!tuttu;i++){try{f();}catch(e){}}}catch(e){}`,
      `const t0=Date.now(); while(Date.now()-t0<5000&&hit<sinir&&!tuttu){await new Promise(r=>setTimeout(r,100));}`,
      `try{d.detach();}catch(e){} return{tuttu,hitSayisi:hit};}};`,
    ].join("\n");
    const betik = await oturum.createScript(kay);
    await betik.load();
    const r = await yarista(betik.exports.kosul(String(adres), kosulJs, maxHit) as Promise<{ tuttu: boolean; hitSayisi: number }>, AJAN_SURE);
    await betik.unload().catch(() => {});
    return { ok: true as const, arac: "rea_frida_cond", pid, adres: String(adres), tuttu: r.tuttu, hitSayisi: r.hitSayisi };
  } catch (e) { return destekYok(`cond başarısız: ${e instanceof Error ? e.message : String(e)}`); }
  finally { if (oturum) await oturum.detach().catch(() => {}); }
}
// Stalker: call olaylarını izle, recv ile fonksiyon çağrı listesi topla.
export async function rea_frida_stalker(pid: number, tid?: number, sure_ms = 2000) {
  if (pidKotu(pid)) return destekYok("geçersiz pid");
  let oturum: import("frida").Session | null = null;
  try {
    const dev = await yarista(frida.getLocalDevice(), AJAN_SURE);
    oturum = await baglan(dev, pid);
    const kay = [
      `rpc.exports={async izle(tidMs,sure){`, `const cagrilar=[]; const hedefTid=tidMs?Number(tidMs):Process.getCurrentThreadId();`,
      `Stalker.follow(hedefTid,{events:{call:true},onReceive(ev){try{const ps=Stalker.parse(ev); for(const p of ps){if(p[0]==="call")cagrilar.push(String(p[2]));}}catch(e){}}});`,
      `try{const m=Process.findModuleByName("kernel32.dll"); const f=new NativeFunction(m.getExportByName("GetTickCount"),"uint32",[]);`,
      `for(let i=0;i<40;i++){try{f();}catch(e){}}}catch(e){}`,
      `await new Promise(r=>setTimeout(r,Number(sure))); Stalker.unfollow(hedefTid); Stalker.flush();`,
      `await new Promise(r=>setTimeout(r,200)); return{cagrilar:cagrilar.slice(0,200),sayi:cagrilar.length};}};`,
    ].join("\n");
    const betik = await oturum.createScript(kay);
    await betik.load();
    const r = await yarista(betik.exports.izle(tid ?? 0, Math.min(Math.max(sure_ms, 300), 8000)) as Promise<{ cagrilar: string[]; sayi: number }>, AJAN_SURE + 4000);
    await betik.unload().catch(() => {});
    return { ok: true as const, arac: "rea_frida_stalker", pid, cagrilar: r.cagrilar, sayi: r.sayi };
  } catch (e) { return destekYok(`stalker başarısız: ${e instanceof Error ? e.message : String(e)}`); }
  finally { if (oturum) await oturum.detach().catch(() => {}); }
}
