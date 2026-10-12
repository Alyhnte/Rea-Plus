# -*- coding: utf-8 -*-
# DumpDecompile.py: DecompInterface ile tek fonksiyonun pseudo-C karşılığını dosyaya yazar.
# Çalışma: analyzeHeadless ... -postScript DumpDecompile <addr-hex> <cikti> -scriptPath <bu dizin>
# args[0] = adres hex ("0x401000"), args[1] = çıktı metin dosyası.
from ghidra.app.decompiler import DecompInterface

# Argümanlar: adres + çıktı yolu (ikisi de zorunlu).
args = getScriptArgs()
if len(args) < 2:
    raise Exception("Kullanim: DumpDecompile <addr-hex> <cikti>")
addrStr = args[0]
cikti = args[1]

# Decompiler arayüzünü mevcut programa bağla.
decomp = DecompInterface()
decomp.openProgram(currentProgram)
try:
    addr = toAddr(addrStr)
    func = getFunctionContaining(addr)
    if func is None:
        raise Exception("Adreste fonksiyon yok: " + addrStr)
    # 60sn sınırı: büyük fonksiyonlarda takılmayı önler.
    res = decomp.decompileFunction(func, 60, monitor)
    if res is None or not res.decompileCompleted():
        raise Exception("Decompile basarisiz: " + addrStr)
    kod = res.getDecompiledFunction().getC()
    # Pseudo-C metnini dosyaya yaz (köprü metin olarak okur).
    open(cikti, "w").write(kod)
finally:
    decomp.dispose()
