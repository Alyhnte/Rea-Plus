# ReaPlus Örnek Prompt Kütüphanesi

5 hazır senaryo: komut + beklenen çıktı + ne anlama geldiği. Buradaki **her
komut ve her sayı gerçek koşudan alınmıştır** (uydurma çıktı yok);
`tests/docs-examples.test.mjs` hepsini çalıştırıp doğrular.

Yüzey (üretilmiş referans [`TOOLS.md`](TOOLS.md) özeti): **187 araç**,
**183 outputSchema**, **187 annotations**, 2 resource, 3 prompt.

Ön koşul: `npm run build` (örnekler `dist/` üstünden koşar). Corpus
dosyaları salt okunur (`tests/corpus/`); hiçbir örnek onları değiştirmez.

## 1) PE triage — "bu exe nedir, ne çağırır?"

```bash
node dist/cli/index.js analyze-pe tests/corpus/mini_pe_x64.exe
```

Beklenen çıktı (gerçek koşu):

```text
dosya: tests/corpus/mini_pe_x64.exe
machine: 0x8664 bit: 64 sections: 1 entry: 0x1000
dll (1): kernel32.dll
fonksiyon (1): kernel32.dll!ExitProcess
```

Ne anlama gelir: `0x8664` = x64 COFF, tek `.text` bölümü, giriş `0x1000`;
tek import `kernel32.dll!ExitProcess` — minimal bir test ikilisi profili.
Makineye okunur hali:

```bash
node dist/cli/index.js analyze-pe tests/corpus/mini_pe_x64.exe --json
```

```json
{"ok":true,"path":"tests/corpus/mini_pe_x64.exe","machine":34404,
 "machine_hex":"0x8664","bit":"64","section_sayisi":1,"entry":4096,
 "entry_hex":"0x1000","dlls":["kernel32.dll"],
 "fonksiyonlar":["kernel32.dll!ExitProcess"],
 "bolumler":[{"ad":".text","vsize":4096,"vaddr":4096}]}
```

## 2) APK manifest — "bu paketin adı, izinleri, aktiviteleri?"

`jadx` kuruluysa (yoksa `capability_unsupported` + kurulum ipucu döner,
uydurma manifest üretilmez):

```bash
node -e "import('./dist/rea-domains/android/JadxBridge.js').then(m=>console.log(JSON.stringify(m.rea_jadx_manifest('tests/corpus/sahte.apk'))))"
```

Beklenen çıktı (gerçek koşu, jadx 1.x):

```json
{"ok":true,"arac":"rea_jadx_manifest","apk":"tests/corpus/sahte.apk",
 "paket":"com.ornek.sahte","izinler":[],"aktiviteler":[]}
```

Ne anlama gelir: jadx `--no-src` ile kaynakları açıp `AndroidManifest.xml`'i
parse eder; sahte korpus APK'sında paket adı var ama izin/aktivite yok —
gerçek bir uygulamada burada `INTERNET` gibi izinler ve `.MainActivity`
gibi aktiviteler listelenir. `rea_jadx_classes` ile sınıf listesine,
`rea_jadx_decompile` ile tek sınıf kaynağına inilir.

## 3) Davranış profili — "olayları zaman çizgisine diz"

Saf fonksiyon, yürütme yok — API/syscall/net/dosya/process olaylarını
kaynak önceliğine dizer, ilk/son + top-5 API özeti üretir:

```bash
node -e "import('./dist/rea-domains/behavior/BehaviorTimeline.js').then(m=>console.log(m.rea_behavior_timeline([
 {\"kaynak\":\"api\",\"zaman\":3,\"detay\":\"CreateFileW\"},
 {\"kaynak\":\"net\",\"zaman\":1,\"detay\":\"dns:ornek.test\"},
 {\"kaynak\":\"api\",\"zaman\":2,\"detay\":\"CreateFileW\"},
 {\"kaynak\":\"process\",\"zaman\":4,\"detay\":\"exit:0\"}
]).summary))"
```

Beklenen çıktı (gerçek koşu):

```text
4 olay api@2 -> process@4 top_api=CreateFileW
```

Ne anlama gelir: 4 olay kronolojiye değil **kaynak önceliğine**
(api > syscall > net > dosya > process) dizilir; `sayılar`
`{api:2, net:1, process:1}`, `top_api` en sık API'yi verir. Boş/eksik
listede `capability_unsupported` döner — boş timeline uydurulmaz.

## 4) Repo tarama — "bu dizinde ne tür dosyalar var?"

Sihir bayt + uzantı ipucuyla PE/ELF/APK/JS/WASM tespiti, motor önerisi ve
5 dosyalık plan (tamamen offline, `.git`/`node_modules`/`dist` atlanır):

```bash
node -e "import('node:fs').then(async fs=>{const {rea_scan_repo}=await import('./dist/rea-domains/reposcan/RepoScan.js');
const r=await rea_scan_repo('<hedef-dizin>');console.log(r.summary,JSON.stringify(r.details.tipler));})"
```

5 sihirli dosyalı bir dizinde gerçek koşu:

```text
5 dosya, 5 tip {"pe":1,"elf":1,"apk":1,"js":1,"wasm":1}
```

Ne anlama gelir: her dosya `yol/tip/motor` üçlüsüyle listelenir
(örn. `.exe` → `pe`/`cutter`, `.apk` → `apk`/`jadx`, `.elf` →
`elf`/`radare2`); `planlar` her dosya için önerilen sonraki aracı verir.
Hedefsiz/boş dizinde boş liste (`ok:true`), yok dizinde
`capability_unsupported`.

## 5) PDB indirme — "debug kaydından sembole"

Adım 1 — CodeView RSDS kaydından PDB kimliğini çöz (salt okunur):

```bash
node -e "import('./dist/rea-domains/typedef/PdbReader.js').then(m=>console.log(JSON.stringify(m.rea_pdb_yolu('<debug-bilgili.exe>'))))"
```

Debug bilgili bir PE'de gerçek koşu (yerel üretilmiş örnek):

```json
{"ok":true,"arac":"rea_pdb_yolu","pdb":"ornek_test.pdb",
 "guid":"ABCDEF01-2345-6789-ABCD-EF0123456789","yas":1}
```

Debug kaydı yoksa `bulunamadi` döner (`PDB debug kaydı yok`) — uydurma
GUID üretilmez.

Adım 2 — Microsoft symbol server düzeninde indir + bütünlük + önbellek:

```text
<server>/ornek_test.pdb/ABCDEF0123456789ABCDEF01234567891/ornek_test.pdb
```

Ne anlama gelir: URL `Ad/GUID-tiresiz+YAŞ/Ad` düzenindedir; inen dosya
MSF imzası + GUID+yaş deseniyle doğrulanır, `<önbellek>/Ad/SİG/Ad`
altına yazılır; ikinci çağrı ağa gitmeden `cache:true` döner. Bozuk
içerik `butunluk_hatasi` ile reddedilir, yarım dosya yazılmaz; ağ yoksa
`ag_hatasi` — sahte PDB asla yazılmaz. Önbellek dizini
`REAPLUS_SYMBOL_CACHE` ile taşınır.

## Sonraki adımlar

- Tam araç listesi: [`TOOLS.md`](TOOLS.md) (üretilmiş, 187 araç).
- Doğrulama akışı: [`VERIFY.md`](VERIFY.md); katkı akışı: `CONTRIBUTING.md`.
