// api-tracer: canlı Windows hedefte gerçek frida API izi (stub yok).
// Hedefi öldürmez: kancalar çözülür, oturum detach edilir.
import frida from "frida";
// Katalog uyumu: tek rea_ aracı.
export const FRIDA_API_TOOLS = ["rea_frida_api"] as const;
// Ajan RPC üst sınırı (FridaPlus ile aynı desen).
const AJAN_SURE = 10_000;
// Boş/geçersiz pid kapısı (test: boş pid unsupported).
function pidKotu(pid: unknown): boolean { return !Number.isInteger(pid as number) || (pid as number) <= 0; }
function destekYok(neden: string) { return { ok: false as const, code: "capability_unsupported" as const, neden }; }
// Sözü süreyle yarıştır (takılan ajan asılı kalmasın).
function yarista<T>(soz: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const zaman = new Promise<never>((_, red) => { t = setTimeout(() => red(new Error("frida zaman aşımı")), ms); });
  return Promise.race([soz, zaman]).finally(() => clearTimeout(t)) as Promise<T>;
}
// Bağlan: spawn sonrası geçici hataya karşı 1 kez yeniden dene.
async function baglan(dev: import("frida").Device, pid: number): Promise<import("frida").Session> {
  try { return await yarista(dev.attach(pid), AJAN_SURE); }
  catch { await new Promise((r) => setTimeout(r, 500)); return await yarista(dev.attach(pid), AJAN_SURE); }
}
// API izi: eşleşen modüllerin import/exportlarına kanca, ajan içinden CreateFileW tetikler.
export async function rea_frida_api(pid: number, modulDeseni = "*", limit = 200, sure_ms = 5000) {
  if (pidKotu(pid)) return destekYok("geçersiz pid");
  let oturum: import("frida").Session | null = null;
  try {
    const dev = await yarista(frida.getLocalDevice(), AJAN_SURE);
    oturum = await baglan(dev, pid);
    const lim = Math.min(Math.max(Math.floor(limit) || 200, 1), 500);
    const sure = Math.min(Math.max(sure_ms, 300), 8000);
    const kay = [
      `rpc.exports={async izle(des,lim,sure){`,
      `const cagrilar=[],kancalar=[];`, // izlenen çağrılar + temizlenecek kancalar
      `const oncelik=["CreateFileW","GetTickCount","CreateFileA","CloseHandle"];`, // kanca önceliği
      `const esles=(a)=>des==="*"||des===""?true:des.endsWith("*")?a.toLowerCase().startsWith(des.slice(0,-1).toLowerCase()):a.toLowerCase()===String(des).toLowerCase();`,
      `let mods=[]; try{mods=Process.enumerateModules().filter((m)=>esles(m.name));}catch(e){}`, // desenle modül bul
      `mods.sort((a,b)=>(a.name.toLowerCase()==="kernel32.dll"?-1:0)-(b.name.toLowerCase()==="kernel32.dll"?-1:0));`, // kernel32 başa
      `if(mods.length===0){try{mods=[Process.getModuleByName(des)];}catch(e){}}`,
      `if(mods.length===0)return{cagrilar:[],sayi:0};`,
      `for(const m of mods.slice(0,2)){`, // şişmeyi önle: ilk 2 modül
      `let imp=[]; try{imp=m.enumerateImports();}catch(e){imp=[];}`, // şart: import keşfi (frida 17 örneklem API)
      `let exp=[]; try{exp=m.enumerateExports().filter((x)=>x.type==="function");}catch(e){exp=[];}`,
      `exp.sort((a,b)=>(oncelik.indexOf(a.name)===-1?99:oncelik.indexOf(a.name))-(oncelik.indexOf(b.name)===-1?99:oncelik.indexOf(b.name)));`,
      `const liste=exp.slice(0,50).map((e)=>({n:e.name,a:e.address})).concat(imp.slice(0,70).map((e)=>({n:e.name,a:e.address})));`,
      `for(const e of liste){`, // her exporta kanca
      `try{if(e.a.isNull())continue; const isim=String(e.n);`,
      `const d=Interceptor.attach(e.a,{onEnter:function(args){try{if(cagrilar.length>2000)return; const ag=[];`, // taşmayı kes
      `for(let i=0;i<4;i++){try{ag.push(String(args[i]));}catch(g){ag.push("0x0");}}`, // ilk 4 arg hex, güvenli oku
      `this.kayit=cagrilar.length; cagrilar.push({api:isim,tid:Process.getCurrentThreadId(),args:ag,retval:"0x0"});}catch(g){}},`,
      `onLeave:function(r){try{cagrilar[this.kayit].retval=String(r);}catch(g){}}});`, // dönüş değeri
      `kancalar.push(d);}catch(g){}}`,
      `}`,
      `try{const k=Process.findModuleByName("kernel32.dll"); if(k){`, // ajan içinden tetikle
      `try{const g=new NativeFunction(k.getExportByName("GetTickCount"),"uint32",[]); for(let i=0;i<10;i++){try{g();}catch(h){}}}catch(h){}`,
      `try{const cw=k.getExportByName("CreateFileW"); const f=new NativeFunction(cw,"pointer",["pointer","uint32","uint32","pointer","uint32","uint32","pointer"]);`,
      `const ad=Memory.allocUtf16String("C:\\\\Windows\\\\System32\\\\kernel32.dll");`,
      `for(let i=0;i<3;i++){try{const hh=f(ad,0x80000000,1,NULL,3,0,NULL); if(!hh.isNull()){try{const c=new NativeFunction(k.getExportByName("CloseHandle"),"bool",["pointer"]); c(hh);}catch(h){}}}catch(h){}}}catch(h){}}}catch(h){}`,
      `await new Promise((r)=>setTimeout(r,Number(sure)));`, // iz penceresi
      `for(const d of kancalar){try{d.detach();}catch(h){}}`, // öldürmez: kancaları çöz
      `const kes=cagrilar.slice(0,Number(lim)); return{cagrilar:kes,sayi:cagrilar.length};}};`,
    ].join("\n");
    const betik = await oturum.createScript(kay);
    await betik.load();
    const r = await yarista(betik.exports.izle(modulDeseni, lim, sure) as Promise<{ cagrilar: { api: string; tid: number; args: string[]; retval: string }[]; sayi: number }>, AJAN_SURE + 4000);
    await betik.unload().catch(() => {});
    return { ok: true as const, arac: "rea_frida_api", pid, cagrilar: r.cagrilar, sayi: r.sayi };
  } catch (e) { return destekYok(`api başarısız: ${e instanceof Error ? e.message : String(e)}`); }
  finally { if (oturum) await oturum.detach().catch(() => {}); }
}
