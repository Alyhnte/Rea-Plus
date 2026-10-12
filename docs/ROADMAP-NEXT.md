# ROADMAP-NEXT — her şey port edildikten sonra derin analiz

Durum: rea'nın tüm kamusal yetenekleri ReaPlus'ta (162 araç, 42 test dosyası).
Ticari lisanslılar kapılı (Hopper/IDA/JEB), Linux-özeller belgeli (binwalk).

## 1. Derinlikten akla: soruşturma orkestrasyonu (en yüksek değer)

Araçlar var, dedektif yok. Sıradaki iş: hedef tipine göre otomatik plan kuran
`rea_investigate(hedef, soru)` — sniff→confidence→uygun provider→evidence bundle→readiness.
Bugün ajan bunu elle diziyor; orkestrasyon 5 çağrıyı 1'e indirir, kanıt formatı
standartlaşır. Maliyet: saf TS planlayıcı + 10 test. Risk: yok (salt-okunur).

## 2. Decompile kalitesi: tip yayılımı

Ghidra pseudo-C + ilspycmd C# + rizin disasm var; ama tipler çağrılar arası
yayılmıyor. `rea_typedef` (imza→struct önerisi, DWARF/PDB varsa okuma) eklensin.
Windows'ta `symchk`/DIA ile PDB çekme mümkün. Değer: okunabilirlik 10x.

## 3. Davranış: syscall + dosya/registry izi

API tracer + net + timeline var. Eksik: syscall numara tablosu (ntdll sürüm
matrisi) ve CreateFileW/RegSetValue özel profilleri. İkisi de FridaPlus'a
20'şer satır. Sonrası: `rea_behavior_full` tek çağrıda hepsi.

## 4. Ölçek: repo-tarama modu

Tek dosya iyi; 10.000 dosyalı repo yavaş (her çağrı process spawn).
Çözüm: kalıcı worker + sonuç cache (probeCache deseni) + paralel kuyruk (4'lü).
`rea_scan_repo` toplu API. Maliyet: orta. Değer: CI entegrasyonu açılır.

## 5. Doğruluk: golden korpus

Her provider için 5 gerçek binary'lik korpus + beklenen çıktı hash'i.
Şu an fixture'lar minimal (mini_branch, mini_pe). Korpus büyüdükçe regresyon
yakalanır. Maliyet: düşük, sürekli.

## 6. Uzun vade (ağır)

- angr/Triton sembolik yürütme (VMProtect sınıfı için tek gerçek yol; WSL+conda).
- Android dinamik (emülatör + frida-server + unpin reçetesi).
- Fuzzing harness (AFL++ WSL).
- IDA/Hopper canlı köprü (lisans + headless API araştırması).

## Öncelik sırası

orkestrasyon → typedef → syscall profilleri → repo-tarama → korpus → ağır işler.
İlk üçü toplam ~2 hafta, MCP'yi kullanan ajanın hızını 3-5x artırır.
