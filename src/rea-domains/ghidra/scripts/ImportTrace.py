# -*- coding: utf-8 -*-
# ImportTrace.py: snapshot baytlarini TraceManager izi (trace) kurup icine yazar.
# Calisma: analyzeHeadless ... -postScript ImportTrace.py <snapshot.json> <cikti.json> -scriptPath <bu dizin>
#   args[0] = snapshot JSON dosya yolu (adres->hex bayt sozlugu, orn. {"0x400200": "488d05..."})
#   args[1] = cikti JSON dosya yolu
# Cikti: {trace, bolge, yazilan, adresSayisi, dogrulama{adres: bool}, tamam}
# Akis: DBTrace kur -> kok sema (Session/Memory/MemoryRegion) -> bolge ac ->
#       baytlari putBytes ile yaz -> getBytes ile geri okuyup dogrula.
# Not: Ghidra 12 headless Jython icermez; bu betik PyGhidra (CPython3) kipinde kosar.
# @runtime PyGhidra
import json

# Argumanlar: snapshot + cikti (ikisi de zorunlu).
args = getScriptArgs()
if len(args) < 2:
    raise Exception("Kullanim: ImportTrace.py <snapshot.json> <cikti.json>")
snapYol = args[0]
cikti = args[1]

# Snapshot sozlugunu oku (adres->hex).
ham = open(snapYol, "r").read()
snapshot = json.loads(ham)
if not isinstance(snapshot, dict) or len(snapshot) == 0:
    raise Exception("Snapshot adres->hex sozlugu olmali: " + snapYol)

from ghidra.trace.database import DBTrace
from ghidra.trace.model import Lifespan
from ghidra.trace.model.memory import TraceMemoryFlag
from ghidra.trace.model.target.schema import XmlSchemaContext
from ghidra.program.model.address import AddressRangeImpl
from java.util import ArrayList
from java.nio import ByteBuffer
import jpype

# Kok sema: Session kok, Memory kapsayici, MemoryRegion arayuzlu bolgeler.
# (Bozuk sema = BadSchemaException; debugger semalariyla ayni desen.)
SEMA_XML = """<context>
  <schema name="Session">
    <attribute name="Memory" schema="Memory" required="yes" fixed="yes" />
  </schema>
  <schema name="Memory">
    <interface name="Memory" />
    <element schema="MemoryRegion" />
  </schema>
  <schema name="MemoryRegion">
    <interface name="MemoryRegion" />
  </schema>
</context>"""

# Tek bolge: snapshot araligini kapsar (koseli yol = eleman semasi).
BOLGE_YOLU = "Memory[rea_snapshot_mem]"

# TraceManager izi: programin derleyici ayarini taban alir.
progSpec = currentProgram.getCompilerSpec()
trace = DBTrace("rea_snapshot", progSpec, "rea-plus")
# Degisiklikler transaction ister; kilit once birakilir, sonra commit edilir.
kilit = trace.lockWrite()
tx = trace.startTransaction("rea_snapshot_kurulum")
basarili = False
try:
    ctx = XmlSchemaContext.deserialize(SEMA_XML)
    om = trace.getObjectManager()
    om.createRootObject(ctx.getSchemaOrNull(ctx.name("Session")))
    # Program adreslerini izin adres uzayina offset ile tasi.
    fabrika = trace.getBaseAddressFactory()
    varsayilan = fabrika.getDefaultAddressSpace()
    eslesme = []
    for aStr, hexStr in snapshot.items():
        try:
            paddr = toAddr(aStr)
        except Exception:
            paddr = None
        if paddr is None:
            raise Exception("Snapshot adresi cozulemedi: " + str(aStr))
        try:
            veri = bytes.fromhex(hexStr)
        except Exception:
            raise Exception("Snapshot hex bozuk: " + str(aStr))
        if len(veri) == 0:
            raise Exception("Snapshot bayt bos: " + str(aStr))
        eslesme.append((aStr, varsayilan.getAddress(paddr.getOffset()), veri))
    eslesme.sort(key=lambda e: e[1].getOffset())
    # Bolgeyi ac (READ/WRITE/EXECUTE).
    mm = trace.getMemoryManager()
    bayraklar = ArrayList()
    bayraklar.add(TraceMemoryFlag.READ)
    bayraklar.add(TraceMemoryFlag.WRITE)
    bayraklar.add(TraceMemoryFlag.EXECUTE)
    mm.addRegion(BOLGE_YOLU, Lifespan.ALL, AddressRangeImpl(eslesme[0][1], eslesme[-1][1]), bayraklar)
    # Baytlari yaz, geri okuyup dogrula (Java byte isaretli: 128+ kaydirilir).
    yazilan = 0
    dogrulama = {}
    for aStr, taddr, veri in eslesme:
        imzali = [(b - 256) if b > 127 else b for b in veri]
        n = mm.putBytes(0, taddr, ByteBuffer.wrap(jpype.JArray(jpype.JByte)(imzali)))
        yazilan += n
        okuma = jpype.JArray(jpype.JByte)(len(veri))
        m = mm.getBytes(0, taddr, ByteBuffer.wrap(okuma))
        geri = bytes(int(b) & 0xFF for b in okuma[:m])
        dogrulama[aStr] = (geri == veri)
    tamam = all(dogrulama.values())
    open(cikti, "w").write(json.dumps({
        "trace": "rea_snapshot",
        "bolge": BOLGE_YOLU,
        "yazilan": yazilan,
        "adresSayisi": len(eslesme),
        "dogrulama": dogrulama,
        "tamam": tamam,
    }))
    print("ImportTrace: yazilan=%d adres=%d tamam=%s -> %s" % (yazilan, len(eslesme), tamam, cikti))
    basarili = True
finally:
    # Once kilit birakilir (commit kilitliyken flush edemez), sonra transaction kapatilir.
    try:
        kilit.close()
    except Exception as e:
        print("kilit notu: %s" % e)
    try:
        trace.endTransaction(tx, basarili)
    except Exception as e:
        print("transaction notu: %s" % e)
    try:
        trace.close()
    except Exception as e:
        print("kapatma notu: %s" % e)
print("ImportTrace bitti")
# Ephemeral headless: Trace DB artigi JVM cikisini kilitler; cikti diskte, guvenle cik.
import java.lang.System as JSystem
JSystem.exit(0)
