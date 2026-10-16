# SANDBOX — ağsız snapshot'lı VM tarifi

Bu belge, ReaPlus'ı İnternet'e dokunmadan denemek için iki sanallaştırma
platformundaki kurulumu baştan sona anlatır. İlke: önce snapshot, sonra çalıştır,
iş bitince geri yükle. Mağaza yayını ile ilgisi yoktur; yalnız yerel doğrulama içindir.

Ortak ilkeler (her iki platform için geçerlidir):

- VM İnternet'e çıkmaz: ağsız kip (sanal anahtar yok / yalnızca-host ağı, kablosu bağlı değil).
- Tüm denemeler snapshot'tan başlar; kirlenen makine onarılmaz, geri yüklenir.
- Konak dizinine/ağa yazma yok; paylaşılan klasör kapalı tutulur.

## 1. Hyper-V (Windows 10/11 Pro)

Önkoşul: Hyper-V rolü açık, en az 8 GB RAM ve 40 GB boş disk.

### Adım 1 — Sanal anahtarı ağsız bırak

Hyper-V Yöneticisi > Sanal Anahtar Yöneticisi: İnternet'e bağlı harici anahtar
EKLEMEYİN. Yalnızca "Yalnızca iç" (internal) anahtar kullanın ya da hiç anahtar
bağlamayın; makine ağsız kalmalıdır.

### Adım 2 — Yeni sanal makine oluştur

Yeni > Sanal Makine: 2. Nesil, 4 GB RAM, 40 GB VHDX, ISO'dan kurulum yapın.
Ağ bağlantısı ekranında anahtar SEÇMEYİN ("Bağlı Değil").

### Adım 3 — Misafir işletim sistemini kur

ISO'dan kurulumu tamamlayın, güncellemeleri çevrimdışı medyadan yapın.
Misafir ilk açılışta ağ kablosu bağlı değil uyarısı veriyorsa doğru yoldasınız.

### Adım 4 — ReaPlus çalışma kopyasını içeri al

Kapalıyken VHDX'i konağa bağlayıp `dist/` çıktısını salt-okunur kopyalayın
ya da ISO olarak ekleyin. Paylaşılan klasör ve pano entegrasyonunu kapatın.

### Adım 5 — Snapshot al

Makine kapalıyken Denetim Noktası > "temiz-kurulum" adıyla snapshot alın.
Bu nokta, her deneyin dönüş adresidir.

### Adım 6 — Deneyi çalıştır

Makineyi başlatın, `npm test` (canlı testler hariç) koşun, sonucu not edin.
Ağ isteği yapan deneyler ağsız ortamda atlanır ya da başarısız olur; bu beklenen
bir durumdur, konak ağını AÇMAYIN.

### Adım 7 — Geri yükleme

Denetim Noktaları > "temiz-kurulum" > Uygula. Makine bir sonraki deneye
tertemiz başlar. Snapshot zinciri uzarsa eskileri silin, yalnız tabanı tutun.

## 2. VirtualBox (Windows/Linux konak)

Önkoşul: VirtualBox 7+, Extension Pack yok (USB/ağ eklentisi gerekmez).

### Adım 1 — Yeni makine oluştur

Yeni: tür ve sürümü ISO'ya göre seçin, 4 GB RAM, 40 GB VDI (dinamik).

### Adım 2 — Ağı kapat

Ayarlar > Ağ: "Bağlı Değil" seçin. Köprü/ NAT / yalnızca-host ağı SEÇMEYİN.
Kablo bağlı kutusu boş kalmalıdır; makine ağsız çalışır.

### Adım 3 — Misafir işletim sistemini kur

ISO'yu takıp kurulumu tamamlayın. Misafir Eklentileri kurmayın (sürükle-bırak
ve paylaşılan pano kapalı kalmalıdır).

### Adım 4 — ReaPlus çalışma kopyasını içeri al

ISO görüntüsü olarak ekleyip misafir içinden salt-okunur bağlayın.
Sürükle-bırak ve paylaşılan klasör kapalı tutulur.

### Adım 5 — Snapshot al

Anlık Görüntüler > "temiz-kurulum" adıyla snapshot alın. Bu nokta, her
deneyin dönüş adresidir.

### Adım 6 — Deneyi çalıştır

Makineyi snapshot'tan başlatın, `npm test` (canlı testler hariç) koşun.
Ağ isteyen deneylerin atlanması normaldir; konak ağını AÇMAYIN.

### Adım 7 — Geri yükleme

Anlık Görüntüler > "temiz-kurulum" > Geri Yükle. Makine tertemiz döner.
Eski dalları silin, yalnız taban snapshot'ı saklayın.

## 3. Ortak kontrol listesi

Her deney öncesi bu liste baştan işaretlenir:

- [ ] Ağ bağlı değil (Hyper-V: anahtar yok; VirtualBox: bağlı değil)
- [ ] "temiz-kurulum" snapshot'ı mevcut ve güncel
- [ ] Paylaşılan klasör/pano/sürükle-bırak kapalı
- [ ] Deney snapshot'tan başlatıldı
- [ ] Deney bitince geri yükleme yapıldı
- [ ] Konak dizinine ve ağa yazılmadı
