# -*- coding: utf-8 -*-
# DumpDisasm.py: adres araligindaki talimatlari mnemonic+bytes JSON dosyasina doker.
# Calisma: analyzeHeadless ... -postScript DumpDisasm.py <addr> <uzunluk> <cikti.json> -scriptPath <bu dizin>
#   args[0] = baslangic adresi (hex "0x400200" ya da sembol/fonksiyon adi: "entry", "entry0")
#   args[1] = okunacak en fazla talimat sayisi (1..500)
#   args[2] = cikti JSON dosya yolu
# Cikti: [{addr, mnemonic, bytes(hex), length, text}]
# Not: Ghidra 12 headless Jython icermez; bu betik PyGhidra (CPython3) kipinde kosar.
# @runtime PyGhidra
import json

# Argumanlar: adres + uzunluk + cikti (ucu de zorunlu).
args = getScriptArgs()
if len(args) < 3:
    raise Exception("Kullanim: DumpDisasm.py <addr> <uzunluk> <cikti.json>")
addrStr = args[0].strip()
try:
    uzunluk = int(args[1])
except Exception:
    raise Exception("Uzunluk sayi olmali: " + args[1])
uzunluk = max(1, min(uzunluk, 500))
cikti = args[2]


def adresCoz(istenen):
    """Hex adresi ya da sembol/fonksiyon adini Address'e cevir."""
    # 1) Dogrudan hex adres ("0x400200", "00400200"); toAddr cozemeyince null doner.
    try:
        dene = toAddr(istenen)
    except Exception:
        dene = None
    if dene is not None:
        return dene
    kucuk = istenen.lower()
    # 2) Fonksiyon adi eslesmesi (birebir, buyuk/kucuk duyarsiz).
    fm = currentProgram.getFunctionManager()
    it = fm.getFunctions(True)
    while it.hasNext():
        f = it.next()
        if f.getName().lower() == kucuk:
            return f.getEntryPoint()
    # 3) Sembol tablosu taramasi (birebir).
    st = currentProgram.getSymbolTable()
    sit = st.getAllSymbols(True)
    while sit.hasNext():
        s = sit.next()
        if s.getName().lower() == kucuk:
            return s.getAddress()
    # 4) rizin tarzi sayi sonekini dusur ("entry0" -> "entry"), sonra iceren adi kabul et.
    sade = kucuk.rstrip("0123456789")
    if sade and sade != kucuk:
        fit = fm.getFunctions(True)
        while fit.hasNext():
            f = fit.next()
            if f.getName().lower() == sade or sade in f.getName().lower():
                return f.getEntryPoint()
    raise Exception("Adres cozulemedi: " + istenen)


start = adresCoz(addrStr)

# Listing uzerinde ileri yurume: tam adresteki talimat, yoksa sonraki.
listing = currentProgram.getListing()
ins = listing.getInstructionAt(start)
if ins is None:
    ins = listing.getInstructionAfter(start)
if ins is None:
    it2 = listing.getInstructions(start, True)
    ins = it2.next() if it2.hasNext() else None
if ins is None:
    raise Exception("Adres cevresi talimat yok: " + addrStr)

# Talimatlari topla: mnemonic + ham bayt (hex) + uzunluk + metin.
sonuc = []
while ins is not None and len(sonuc) < uzunluk:
    try:
        ham = ins.getBytes()
        hexs = "".join("%02x" % (b & 0xFF) for b in ham)
    except Exception:
        hexs = ""
    sonuc.append({
        "addr": ins.getAddress().toString(),
        "mnemonic": ins.getMnemonicString(),
        "bytes": hexs,
        "length": int(ins.getLength()),
        "text": ins.toString(),
    })
    try:
        ins = ins.getNext()
    except Exception:
        break

# JSON'u cikti dosyasina yaz (headless kopru buradan okur).
open(cikti, "w").write(json.dumps(sonuc))
print("DumpDisasm: %d talimat -> %s" % (len(sonuc), cikti))
