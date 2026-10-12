# -*- coding: utf-8 -*-
# DumpXrefs.py: verilen adrese gelen referansları (getReferencesTo) JSON döker.
# Çalışma: analyzeHeadless ... -postScript DumpXrefs <addr-hex> [<cikti.json>] -scriptPath <bu dizin>
# args[0] = adres hex (zorunlu), args[1] = çıktı dosyası (yoksa stdout'a yazar).
import json

# Argümanlar: adres zorunlu, çıktı dosyası opsiyonel (köprü her zaman verir).
args = getScriptArgs()
if len(args) < 1:
    raise Exception("Kullanim: DumpXrefs <addr-hex> [<cikti.json>]")
addrStr = args[0]
cikti = args[1] if len(args) > 1 else None

# Adrese gelen tüm referansları listele (from/to hex metin + tip).
addr = toAddr(addrStr)
sonuc = []
for ref in getReferencesTo(addr):
    sonuc.append({
        "from": ref.getFromAddress().toString(),
        "to": ref.getToAddress().toString(),
        "type": ref.getReferenceType().toString(),
    })

# JSON'u dosyaya (veya stdout'a) yaz.
metin = json.dumps(sonuc)
if cikti:
    open(cikti, "w").write(metin)
else:
    print(metin)
