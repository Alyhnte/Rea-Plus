# WSL — Linux gerektiren araçlar (binwalk/unblob)

Ubuntu WSL kurulu. `sudo` şifre ister, otomatik kurulum yok.

## Manuel kurulum (bir kez)

```powershell
wsl -d Ubuntu
sudo apt update && sudo apt install -y binwalk python3-pip
pip install unblob
```

## Kullanım

Kurulunca `rea_firmware_extract` Linux tarafında çalışır.
Doğrulama: `wsl -d Ubuntu -- binwalk -h`
