// rea-domains/behavior: Windows x64 syscall mini tablosu (saf, exec yok)
// Win10/11 x64 yaklaşıklık; sürüme göre kayar, ad çözümleme içindir.
export const SYSCALL_ADLARI: Record<number, string> = {
// G/Ç çekirdeği: dosya okuma/yazma ve aygıt kontrolü.
0x06: "NtReadFile",
0x07: "NtDeviceIoControlFile",
0x08: "NtWriteFile",
0x0F: "NtClose",
0x33: "NtOpenFile",
0x55: "NtCreateFile",
// Bellek/section: ayırma, koruma, eşleme.
0x18: "NtAllocateVirtualMemory",
0x1E: "NtFreeVirtualMemory",
0x50: "NtProtectVirtualMemory",
0x47: "NtCreateSection",
0x28: "NtMapViewOfSection",
0x27: "NtUnmapViewOfSection",
// Proses/iş parçacığı: açma, üretme, kuyruk ve bağlam.
0x26: "NtOpenProcess",
0xC1: "NtCreateThreadEx",
0x05: "NtOpenThread",
0x02: "NtResumeThread",
0x3C: "NtQueueApcThread",
0x10: "NtSetContextThread",
0x12: "NtGetContextThread",
0x2C: "NtTerminateProcess",
// Kayıt defteri: anahtar açma/oluşturma ve değer yazma.
0x32: "NtOpenKey",
0x4E: "NtCreateKey",
0x3A: "NtSetValueKey",
};
// Numaradan ada çevir; bilinmeyende kararlı syscall_0x.. etiketi.
export function syscall_ad(no: number): string {
if (!Number.isInteger(no) || no < 0) return "syscall_bilinmiyor";
return SYSCALL_ADLARI[no] ?? `syscall_0x${no.toString(16)}`;
}
// Ad var mı? Rapor öncesi hızlı kapı (büyük/küçük duyarsız).
export function syscall_biliniyor(ad: string): boolean {
if (!ad || typeof ad !== "string") return false;
const k = ad.toLowerCase();
return Object.values(SYSCALL_ADLARI).some((a) => a.toLowerCase() === k);
}
// --- Dalga C/1: katı numara matrisi (sahte eşleşme yok) ---
// Bilinen numarada ad, bilinmeyende "bilinmiyor" (etiket uydurulmaz).
export function syscall_coz(no: number): string {
if (!Number.isInteger(no) || no < 0) return "bilinmiyor";
return SYSCALL_ADLARI[no] ?? "bilinmiyor";
}
// Tracer API adı -> ntdll syscall adı (küçük harf anahtarlı).
export const API_SYSCALL: Record<string, string> = {
"createfilew": "NtCreateFile",
"createfilea": "NtCreateFile",
"ntcreatefile": "NtCreateFile",
"writefile": "NtWriteFile",
"ntwritefile": "NtWriteFile",
"readfile": "NtReadFile",
"ntreadfile": "NtReadFile",
"openprocess": "NtOpenProcess",
"ntopenprocess": "NtOpenProcess",
"virtualalloc": "NtAllocateVirtualMemory",
"virtualallocex": "NtAllocateVirtualMemory",
"ntallocatevirtualmemory": "NtAllocateVirtualMemory",
"createthread": "NtCreateThreadEx",
"createthreadex": "NtCreateThreadEx",
"ntcreatethreadex": "NtCreateThreadEx",
"regsetvaluew": "NtSetValueKey",
"regsetvaluea": "NtSetValueKey",
"regsetvalueexw": "NtSetValueKey",
"regsetvalueexa": "NtSetValueKey",
"ntsetvaluekey": "NtSetValueKey",
"regcreatekeyw": "NtCreateKey",
"regcreatekeya": "NtCreateKey",
"regcreatekeyexw": "NtCreateKey",
"regcreatekeyexa": "NtCreateKey",
"ntcreatekey": "NtCreateKey",
};
// API adından syscall adı; eşleşme yoksa "bilinmiyor".
export function api_syscall_ad(api: string): string {
if (!api || typeof api !== "string") return "bilinmiyor";
return API_SYSCALL[api.trim().toLowerCase()] ?? "bilinmiyor";
}
// Tracer çağrısı: { api, no?, args? } -> { api, no, ad }.
// Öncelik: sayısal no alanı, sayısal api metni ("85"/"0x55"), ad eşleşmesi.
// Eşleşme yoksa ad "bilinmiyor", no null (sahte eşleşme yok).
export type TracerEşleşme = { api: string; no: number | null; ad: string };
export function tracer_syscall_eslestir(cagri: { api?: unknown; no?: unknown }): TracerEşleşme {
const api = typeof cagri?.api === "string" ? cagri.api : "";
if (Number.isInteger(cagri?.no) && (cagri.no as number) >= 0) {
const no = cagri.no as number;
return { api, no, ad: syscall_coz(no) };
}
const s = api.trim().toLowerCase();
if (/^0x[0-9a-f]+$/.test(s)) { const no = parseInt(s, 16); return { api, no, ad: syscall_coz(no) }; }
if (/^\d+$/.test(s)) { const no = parseInt(s, 10); return { api, no, ad: syscall_coz(no) }; }
const ad = api_syscall_ad(api);
if (ad === "bilinmiyor") return { api, no: null, ad };
const no = Object.keys(SYSCALL_ADLARI).map(Number).find((n) => SYSCALL_ADLARI[n] === ad) ?? null;
return { api, no, ad };
}
