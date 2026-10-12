# rea-plus — Reverse Engineering MCP Önerileri

## Hemen eklenebilecekler (yüksek değer, düşük risk)

- Ghidra headless + Hopper bridge (pseudocode zaten kanıtlı)
- JADX + Apktool + adb üçlüsü (APK manifest/class/decompile tek pakette)
- .NET static (metadata + CIL, çalıştırmadan)
- WABT WAT decode + EVM selector tablosu (offline, hızlı)
- HAR + mitmproxy capture import (web kanıtı)
- Binwalk/Unblob firmware açma + native handoff
- Go binary modül/version okuma (kurulum gerekmez)
- pwntools ELF layout + mitigation adayları
- source-map + bundle diff (`compare_source_to_bundle`)
- process capture (PTY, run karşılaştırma)

## Orta vade (mimari ister)

- IDA MCP + JEB MCP provider seçici (`REA_JEB_MCP_URL` gibi)
- V8 inspector runtime observation (Electron aktif gözlem)
- Playwright scenario + network + storage tek oturumda
- reconstruction obligation ledger (bulgu → kod → test zinciri)
- evidence bundle + digest (`tools_sha256` stabil)
- compact input schema (13KB altı model uyumu)
- Windows native addon (process/authority/filesystem) prebuild

## Uzun vade (fark yaratır)

- 16-bit DOS + MIPS/PSP profilleri (TH04 tarzı vakalar)
- NativeAOT PE + Swift/ObjC dispatch metadata
- recorded crash → register/signal timeline
- differential binary diff (versiyonlar arası fonksiyon eşleme)
- decompiler pseudocode → C rekonstrüksiyon test harness (DX-Ball: 3205 case)
- offline air-gap paketi (araçlar gömülü, indirme yok)
- skill pack: `reverse-engineer-anything` references/ ile soruşturma akışı
