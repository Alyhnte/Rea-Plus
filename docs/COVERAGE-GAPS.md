# COVERAGE-GAPS — araçların HİÇBİRİNİN yapamadığı önemli kısım

## Kısa cevap

**Davranış düzeyi dinamik izleme (API/syscall/ağ/dosya izi): uygulamanın ÇALIŞIRKEN ne yaptığı.**
Statik taraf yapıyı söyler (fonksiyonlar, xref, string), canlı debug anlık durumu söyler
(register, bellek, breakpoint). Ama "bu exe çalışınca hangi API'leri hangi argümanlarla
çağırıyor, nereye bağlanıyor, hangi dosyaya yazıyor" sorusunu otomatik cevaplayan
hiçbir araç yok. Stalker çağrı listesi verir (argümansız), process capture stdout
verir (davranış vermez), logcat/screencap cihaz ister.

## Neden önemli

Gerçek RE sorularının çoğu davranıştır: "bu zararlı nereye sızıyor",
"bu lisans kontrolü nerede patlıyor", "bu özellik hangi servisi çağırıyor".
Şu an ajan bunu breakpoint kovalayarak elle bulur; otomatik iz + özet yoktur.

## Nasıl çözülür (sıralı, kolaydan zora)

1. **Frida API-tracer (kolay, 1-2 gün):** `rea_frida_api(pid, modülDeseni)` —
   `Module.enumerateImports` + `Interceptor.attach` ile fonksiyon adı + argüman
   ilk N baytı + dönüş değeri loglanır. FridaPlus deseni hazır (cond/stalker
   ispatlı). Test: notepad `CreateFileW` yakalar.
2. **UPX unpack (kolay, saatler):** `winget install UPX.UPX`, `rea_upx_unpack`
   (`upx -d`). Paketli sample'lar statik analize kapalıdır; unpack hepsini açar.
3. **C# decompile (kolay, saatler):** `dotnet tool install ilspycmd`,
   `rea_dotnet_decompile` (dnfile listeler, ilspycmd C#'a çevirir). dnfile hazır.
4. **Ağ izi (orta, günler):** mitmproxy `mitmdump` (Windows çalışır) +
   `rea_net_capture` (HAR üretir, mevcut HAR import ile birleşir).
5. **Syscall izi (orta):** Windows ETW veya `NtTrace`? Pratik yol: Frida
   Stalker + ntdll hook (syscall numaraları), `rea_frida_syscalls`.
6. **Android dinamik (zor, haftalar):** Emülatör + frida-server + SSL unpinning
   reçetesi (`rea_android_dynamic`). Cihazsız tam RE yok.
7. **Fuzzing (zor):** AFL++ (WSL) + `rea_fuzz` harness. Zafiyet avı için şart.

## İkinci büyük boşluk: şifreli/paketli + sanal makine korumaları

UPX ötesi packer'lar (Themida, VMProtect) ve .NET obfuscator'lar (ConfuserEx)
için unpack reçetesi yok. Çözüm: unpack profilleri docs + bellek-dump
(x64dbg/cdb snapshot'tan OEP bulma) akışı. Bu, yukarıdaki 7 maddeden sonra gelir.
