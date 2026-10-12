# -*- coding: utf-8 -*-
# DumpStrings.py: tanımlı string verilerini (ilk 500) address+value JSON döker.
# Çalışma: analyzeHeadless ... -postScript DumpStrings <cikti.json> -scriptPath <bu dizin>
# args[0] = çıktı dosyası (yoksa stdout'a yazar).
import json

# Argüman: çıktı dosyası opsiyonel (köprü her zaman verir).
args = getScriptArgs()
cikti = args[0] if len(args) > 0 else None

# Tanımlı verileri gez, string değerlileri topla (bellek şişmesin diye 500 kap).
listing = currentProgram.getListing()
it = listing.getDefinedData(True)
sonuc = []
while it.hasNext() and len(sonuc) < 500:
    d = it.next()
    try:
        if d.hasStringValue():
            sonuc.append({"address": d.getAddress().toString(), "value": str(d.getValue())})
    except Exception:
        continue

# JSON'u dosyaya (veya stdout'a) yaz.
metin = json.dumps(sonuc)
if cikti:
    open(cikti, "w").write(metin)
else:
    print(metin)
