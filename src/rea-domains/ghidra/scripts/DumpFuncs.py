# -*- coding: utf-8 -*-
# DumpFuncs.py: GhidraScript/Jython — programdaki fonksiyonları JSON dosyaya döker.
# Çalışma: analyzeHeadless ... -postScript DumpFuncs <cikti.json> -scriptPath <bu dizin>
# Çıktı: [{name, entry, size, callingConvention}] (entry "0x..." metin, size adres sayısı)
import json

# Argüman: args[0] = çıktı JSON dosya yolu (zorunlu).
args = getScriptArgs()
if len(args) < 1:
    raise Exception("Kullanim: DumpFuncs <cikti.json>")
cikti = args[0]

# Fonksiyon yöneticisi: ileri yönlü sıralı tüm fonksiyonlar.
fm = currentProgram.getFunctionManager()
sonuc = []
it = fm.getFunctions(True)
while it.hasNext():
    f = it.next()
    try:
        cc = f.getCallingConventionName()
    except Exception:
        cc = None
    sonuc.append({
        "name": f.getName(),
        "entry": f.getEntryPoint().toString(),
        "size": int(f.getBody().getNumAddresses()),
        "callingConvention": cc,
    })

# JSON'u çıktı dosyasına yaz (headless köprü buradan okur).
open(cikti, "w").write(json.dumps(sonuc))
