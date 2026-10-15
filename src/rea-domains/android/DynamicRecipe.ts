// DynamicRecipe: Android dinamik analiz recetesi URETIMI + kuru-dogrulama.
// Calistirma YOK: emulator/frida/adb burada kosulmaz; istemcinin uygulayacagi
// 5 adimlik JSON recete uretilir (komut + beklenen cikti + dogrulama + eksik-arac dali).
// Saf moduldur: exec/spawn/timer yok, gercek cihaz/emulator gerektirmez.

// Facade prefix kurali: rea_ oneki zorunlu.
export const DYNAMIC_RECIPE_TOOLS = [
  "rea_android_dinamik_recete",
  "rea_android_recete_dogrula",
] as const;

export type ReceteDurum = "hazir" | "eksik";

export interface DinamikAdim {
  id: string;
  baslik: string;
  komut: string;
  beklenen_cikti: string;
  dogrulama: string;
  durum: ReceteDurum;
  eksik_arac: string | null;
  uyari: string | null;
}

export interface DinamikRecete {
  surum: 1;
  ad: "android-dinamik";
  calistirma: "uret-dogrula";
  adimlar: DinamikAdim[];
}

export interface ReceteGirdi {
  apkYolu?: string;
  paket?: string;
  seri?: string;
  avd?: string;
  // Arac bulunurlugu (yoklama yapilmaz, cagiran bildirir; false = eksik isareti).
  emulator?: boolean;
  adb?: boolean;
  frida?: boolean;
  apkMevcut?: boolean;
  objection?: boolean;
}

// Beklenen 5 adim kimligi (sira sabit).
const ADIM_SIRASI = [
  "emulator_ac",
  "frida_server_kur",
  "apk_yukle",
  "pinning_bypass",
  "trace_baslat",
] as const;

// Recete uret: eksik arac "eksik" isaretlenir, uydurma adim eklenmez/cikarilmaz.
export function rea_android_dinamik_recete(girdi: ReceteGirdi = {}) {
  const apk = (girdi.apkYolu ?? "").trim() || "ornek.apk";
  const paket = (girdi.paket ?? "").trim() || "com.ornek.app";
  const avd = (girdi.avd ?? "").trim() || "Test_API34";
  const seri = (girdi.seri ?? "").trim();
  const seriBayrak = seri ? `-s ${seri} ` : "";
  const emulatorVar = girdi.emulator !== false;
  const adbVar = girdi.adb !== false;
  const fridaVar = girdi.frida !== false;
  const apkVar = girdi.apkMevcut !== false;
  const objectionVar = girdi.objection !== false;

  const adimlar: DinamikAdim[] = [
    {
      id: "emulator_ac",
      baslik: "Emulator ac",
      komut: `emulator -avd ${avd} -no-snapshot-load`,
      beklenen_cikti: "emulator: boot completed",
      dogrulama: `adb ${seriBayrak}wait-for-device && adb ${seriBayrak}shell getprop sys.boot_completed  # beklenen: 1`,
      durum: emulatorVar ? "hazir" : "eksik",
      eksik_arac: emulatorVar
        ? null
        : "Android SDK emulator yok (Android Studio > Device Manager ile AVD kurun: https://developer.android.com/studio/run/emulator)",
      uyari: null,
    },
    {
      id: "frida_server_kur",
      baslik: "frida-server kur",
      komut: `adb ${seriBayrak}push frida-server /data/local/tmp/frida-server && adb ${seriBayrak}shell chmod +x /data/local/tmp/frida-server && adb ${seriBayrak}shell su -c /data/local/tmp/frida-server &`,
      beklenen_cikti: "frida-server: listening",
      dogrulama: "frida-ps -U  # beklenen: frida-server'a bagli cihaz satiri",
      durum: !adbVar || !fridaVar ? "eksik" : "hazir",
      eksik_arac:
        !adbVar
          ? "adb PATH'te yok (platform-tools kurulu degil)"
          : !fridaVar
            ? "frida-server binary yok (cihaz mimarisine uygun surumu indirin: https://github.com/frida/frida/releases)"
            : null,
      uyari: null,
    },
    {
      id: "apk_yukle",
      baslik: "APK yukle",
      komut: `adb ${seriBayrak}install -r ${apk}`,
      beklenen_cikti: "Success",
      dogrulama: `adb ${seriBayrak}shell pm list packages | grep ${paket}  # beklenen: package:${paket}`,
      durum: !adbVar || !apkVar ? "eksik" : "hazir",
      eksik_arac:
        !adbVar
          ? "adb PATH'te yok (platform-tools kurulu degil)"
          : !apkVar
            ? `APK yok: ${apk}`
            : null,
      uyari: null,
    },
    {
      id: "pinning_bypass",
      baslik: "Pinning bypass (objection)",
      komut: `objection -g ${paket} explore --startup-command "android sslpinning disable"`,
      beklenen_cikti: "ssl pinning disabled",
      dogrulama: `objection -g ${paket} explore -c "android sslpinning disable"  # beklenen: pinning devre disi mesaji`,
      durum: !fridaVar || !objectionVar ? "eksik" : "hazir",
      eksik_arac:
        !fridaVar
          ? "frida yok (frida + frida-server kurulu olmali: pip install objection frida-tools)"
          : !objectionVar
            ? "objection yok (pip install objection; alternatif F-Droid: TrustMeAlready modulunu aratin)"
            : null,
      uyari:
        "Yalniz kendi uygulamanizda / test cihazinda kullanin; ucuncu taraf uygulamada pinning bypass hukuki risk tasir. " +
        "Ipucu: objection (pip install objection) veya F-Droid uzerinden TrustMeAlready/Xposed modulu; bu recete calistirmaz, komutu istemci uygular.",
    },
    {
      id: "trace_baslat",
      baslik: "Trace baslat",
      komut: `frida -U -f ${paket} -l trace.js --no-pause`,
      beklenen_cikti: `Spawned ${paket}`,
      dogrulama: `frida-ps -U | grep ${paket}  # beklenen: ${paket} satiri`,
      durum: !fridaVar || !adbVar ? "eksik" : "hazir",
      eksik_arac:
        !fridaVar
          ? "frida yok (frida-tools kurulu olmali: pip install frida-tools)"
          : !adbVar
            ? "adb PATH'te yok (platform-tools kurulu degil)"
            : null,
      uyari: null,
    },
  ];

  const recete: DinamikRecete = { surum: 1, ad: "android-dinamik", calistirma: "uret-dogrula", adimlar };
  return { ok: true as const, arac: "rea_android_dinamik_recete", recete };
}

type DogrulamaHatasi = { ok: false; code: "gecersiz_recete"; neden: string };

// Kuru-dogrulama: recete SEMASINI denetler, hicbir seyi calistirmaz.
export function rea_android_recete_dogrula(recete: unknown) {
  const hata = (neden: string): DogrulamaHatasi => ({ ok: false as const, code: "gecersiz_recete", neden });
  if (typeof recete !== "object" || recete === null) return hata("Recete obje degil");
  const r = recete as { surum?: unknown; ad?: unknown; adimlar?: unknown };
  if (r.surum !== 1) return hata("surum 1 olmali");
  if (r.ad !== "android-dinamik") return hata("ad android-dinamik olmali");
  if (!Array.isArray(r.adimlar)) return hata("adimlar dizi olmali");
  if (r.adimlar.length !== ADIM_SIRASI.length) return hata(`adim sayisi ${ADIM_SIRASI.length} olmali (bulunan: ${r.adimlar.length})`);
  for (let i = 0; i < r.adimlar.length; i++) {
    const adim = r.adimlar[i] as Partial<DinamikAdim>;
    const beklenenId = ADIM_SIRASI[i] as string;
    if (adim.id !== beklenenId) return hata(`${i}. adim id ${beklenenId} olmali (bulunan: ${String(adim.id)})`);
    if (typeof adim.komut !== "string" || !adim.komut.trim()) return hata(`${adim.id}: komut bos`);
    if (typeof adim.beklenen_cikti !== "string" || !adim.beklenen_cikti.trim()) return hata(`${adim.id}: beklenen_cikti bos`);
    if (typeof adim.dogrulama !== "string" || !adim.dogrulama.trim()) return hata(`${adim.id}: dogrulama bos`);
    if (adim.durum !== "hazir" && adim.durum !== "eksik") return hata(`${adim.id}: durum hazir/eksik olmali`);
    if (adim.durum === "eksik" && (typeof adim.eksik_arac !== "string" || !adim.eksik_arac.trim())) {
      return hata(`${adim.id}: eksik durumda eksik_arac dolu olmali`);
    }
    if (adim.id === "pinning_bypass") {
      if (typeof adim.uyari !== "string" || !adim.uyari.trim()) return hata("pinning_bypass: uyari zorunlu");
      const kucuk = adim.uyari.toLowerCase();
      if (!kucuk.includes("objection") || !kucuk.includes("f-droid")) {
        return hata("pinning_bypass: uyari objection + F-Droid ipucu tasimali");
      }
    }
  }
  return { ok: true as const, arac: "rea_android_recete_dogrula", adim_sayisi: r.adimlar.length };
}
