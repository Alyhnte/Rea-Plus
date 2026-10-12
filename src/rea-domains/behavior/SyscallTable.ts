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
