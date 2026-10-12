# native-windows — prebuild yol haritası

> WP5 orta vade: `process / authority / filesystem` için Win32 prebuild ikili planı.
> TS yüzeyi `addon.ts` ile sabit; gerçek Win32 okuma yalnız prebuild ikilide.

## Kapsam

| Yüzey | TS işlevi | Win32 karşılığı |
|---|---|---|
| process | `rea_native_process_info(pid)` | CreateToolhelp32Snapshot + NtQueryInformationProcess |
| authority | `rea_native_authority_check(pid)` | OpenProcessToken + GetTokenInformation |
| filesystem | `rea_native_fs_snapshot(dizin)` | USN günlüğü / dizin yürüyüşü (derinlik ≤ 5) |

## Kapılar

- `win32` dışı host → `capability_unsupported`, Linux/macOS ajanına handoff.
- `REA_NATIVE_PREBUILD=1` yoksa → iskelet yanıtı, ikiliye dokunulmaz.
- `rea_native_caps()` tek bakışta `win32 × prebuild` matrisini döner.

## Prebuild adımları

1. `npm i -D prebuildify node-gyp` — derleme zinciri kurulur.
2. `binding.gyp` içine `src/native-windows/binding.cc` hedefi eklenir.
3. Üç giriş `Napi::` ile sarılır: `processInfo`, `authorityCheck`, `fsSnapshot`.
4. `npx prebuildify --napi --strip` çıktısı `prebuilds/win32-x64/` altına konur.
5. `addon.ts` `REA_NATIVE_PREBUILD=1` iken `../prebuilds` yolundan yükler.
6. İmza: her prebuild `SHA256SUMS` ile mühürlenir, `evidenceBundle` içine `tools_sha256` yanına işlenir.

## Test

- `rea_native_caps()` → iskelet kipinde `prebuild: false` bekler.
- `rea_native_process_info(0)` → `capability_unsupported` (geçersiz pid).
- `rea_native_fs_snapshot("", 2)` → `capability_unsupported` (dizin boş).
- Win32 + prebuild kurulu CI koşucusunda canlı okuma doğrulanır.
