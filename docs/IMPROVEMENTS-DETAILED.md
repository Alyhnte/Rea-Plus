# İyileştirme Önerileri — Detaylı (ne işe yarar / hız / maliyet / yetenek)

## 1. Magic-byte sniffing (uzantı yerine içerik tanıma)
- **Ne işe yarar:** Dosyanın ilk baytlarına bakarak gerçek tipi bulur. Örn. `.bin` denen dosya aslında APK (PK zip), `.dat` aslında ELF (7f 45 4c 46) çıkabilir. Uzantıya güvenen yönlendirme yanlış motora gider, sniffing doğru motora yollar.
- **Yapılırsa ne olur:** Yanlış motor denemeleri biter. `capability_unsupported` sonrası ikinci deneme gerekmez, ilk seferde doğru kapı çalınır.
- **Ne hızlanır:** Hedef açma süresi (özellikle toplu taramada). Yanlış deneme + hata + yeniden deneme döngüsü kalkar.
- **Ne yavaşlar / maliyet:** Açılışta ilk 4KB okuma + imza tablosu eşleştirme (mikrosaniyeler). İmza tablosu bakımı gerekir (yeni format çıkınca ekleme).
- **Kazanılan yetenek:** Uzantısız / yanlış uzantılı / iç içe dosyaları (APK içi dex, firmware içi ELF) otomatik tanıma ve içe doğru inme.

## 2. Güven skoru (her eşleşmeye 0-100 puan)
- **Ne işe yarar:** "Bu APK, jadx ile %95 açılır ama Ghidra ile %40" gibi karar verilebilir hale gelir. Şu an kapılar evet/hayır diyor; skor, en iyi adayı sıralar.
- **Yapılırsa ne olur:** Router en yüksek skorluyu dener, düşük skorlular yedek bekler. Kullanıcıya "neden bu araç" açıklanabilir.
- **Ne hızlanır:** Çok motorlu hedeflerde (örn. Electron: JS mi native mi?) deneme sayısı bire iner.
- **Ne yavaşlar / maliyet:** Skor formülü + kalibrasyon testleri gerekir. Yanlış kalibre edilirse iyi motor geriye düşer (gözlem + ayar ister).
- **Kazanılan yetenek:** Belirsiz hedeflerde otomatik en-iyi-motor seçimi ve açıklanabilir karar.

## 3. Fallback zinciri (jadx→apktool, ghidra→hopper→ida)
- **Ne işe yarar:** Birinci araç yoksa/bozulursa ikinci otomatik devreye girer. Örn. jadx yok → apktool ile manifest+resource yine alınır (decompile eksik kalır ama iş durmaz).
- **Yapılırsa ne olur:** Eksik araç = tam duruş olmaktan çıkar, kısmi sonuç + "şu eksik, şunu kur" raporu gelir.
- **Ne hızlanır:** Operatör beklemez; kısmi kanıt hemen gelir, tam kanıt araç kurulunca tamamlanır.
- **Ne yavaşlar / maliyet:** Zincir tanımı + kısmi-sonuç şeması gerekir. İki araç koşunca toplam süre uzayabilir (ama paralel koşulursa değil).
- **Kazanılan yetenek:** Dayanıklılık: bozuk/eksik ortamda bile iş yapan MCP.

## 4. Probe sonuçlarını TTL ile cacheleme
- **Ne işe yarar:** `doctor` her çağrıda adb/java/r2 yoklaması yapıyor (process spawn ~10-100ms her biri). Sonucu örn. 60sn saklar, tekrar sormaz.
- **Yapılırsa ne olur:** Art arda 10 tool çağrısında 10× probe yerine 1 probe. Oturum başı saniyeler kazanılır.
- **Ne hızlanır:** Tüm tool çağrıları, özellikle hızlı ardışık çağrılar (session_open → open_target → disassemble).
- **Ne yavaşlar / maliyet:** Araç çağrı arasında kurulursa 60sn görünmez (stale). Çözüm: `doctor --refresh` bayrağı + kurulum sonrası cache temizleme.
- **Kazanılan yetenek:** Ölçek: çok dosyalı taramada probe maliyeti sabitlenir.

## 5. Paralel probe
- **Ne işe yarar:** 8 araç kontrolünü sıra yerine aynı anda yapar.
- **Yapılırsa ne olur:** doctor süresi en yavaş probe kadar olur (800ms → ~150ms tipik).
- **Ne hızlanır:** İlk açılış ve `prerequisites` raporu belirgin hızlanır.
- **Ne yavaşlar / maliyet:** Aynı anda 8 process spawn (kısa CPU sıçraması). Windows'ta abartılırsa AV uyarısı tetiklenebilir; limit (4 paralel) konur.
- **Kazanılan yetenek:** Hızlı readiness: ajan beklemeden ortama karar verir.

## 6. Yapılandırılmış eksik-neden + kurulum komutu
- **Ne işe yarar:** Şu an "adb yok" deniyor. İyisi: `{eksik: adb, kur: "winget install Google.PlatformTools", neden: "packages listesi için", alternatif: "cihazı USB ile bağla"}`.
- **Yapılırsa ne olur:** Kullanıcı/ajan tek adımda kurar, doküman aramaz. Ajan kurulumu otomatik önerebilir.
- **Ne hızlanır:** Kurulum döngüsü (sor → ara → kur → dene) tek mesaja iner.
- **Ne yavaşlar / maliyet:** Her kapıya kur-komut tablosu + platform ayrımı (winget/choco/apt/brew) bakımı.
- **Kazanılan yetenek:** Kendi kendine onarım öneren MCP.

## 7. Otomatik config önerisi
- **Ne işe yarar:** Eksik araca göre `configs/` dosyasını üretir: "Ghidra bulundu, REA_GHIDRA_DIR ekle" → hazır JSON snippet.
- **Yapılırsa ne olur:** Kurulum sonrası manuel config düzenleme kalkar, kopyala-yapıştır kuruluma döner.
- **Ne hızlanır:** İlk kurulum (10 dakika → 2 dakika).
- **Ne yavaşlar / maliyet:** Config şema değişince snippet üretici güncellenmeli; yanlış yol yazılırsa debug gerekir (yolu test eden butonla çözülür).
- **Kazanılan yetenek:** Sıfırdan kuran kullanıcı için guided setup.

## 8. Eksik-araç telemetrisi
- **Ne işe yarar:** Hangi araç en çok eksik kalıyor, hangi hedefte takılınıyor kaydı tutulur (lokal, opt-in). Örn. "10 koşunun 7'sinde wabt yoktu" → air-gap paketine wabt gömülür.
- **Yapılırsa ne olur:** Yol haritası veriye dayanır; en çok can yakan eksik önce kapanır.
- **Ne hızlanır:** Uzun vadede herkesin kurulumu (paket doğru araçları içerir).
- **Ne yavaşlar / maliyet:** Log yazma (mikrosaniye) + gizlilik onayı gerekir (varsayılan kapalı, lokal dosya).
- **Kazanılan yetenek:** Kanıta dayalı önceliklendirme.
