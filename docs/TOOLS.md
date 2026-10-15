# ReaPlus Araç Referansı

> Bu dosya otomatik üretilir; elle düzenlemeyin. Kaynak: derlenmiş sunucunun
> (`dist/server.js`) gerçek MCP yüzeyi. Yeniden üretmek için:
> `npm run build && node scripts/generate-tool-reference.mjs`

## Özet

- Sunucu: `rea-plus` 0.8.1
- Toplam araç: 172
- Toplam resource: 2
- Toplam prompt: 3
- outputSchema taşıyan araç: 168
- annotations taşıyan araç: 172

## Araçlar

### `close_target`

Release the binary target (and its radare2 process) held by a session.

- Girdi alanları:
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: closed, session_id)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `debug_attach`

Attach by pid, or, on a frida session, connect to a listening Frida Gadget (gadget host:port) or a running mobile package on USB (usb + package). The target keeps running after debug_close.

- Girdi alanları:
  - `auto_analyze` (boolean, opsiyonel) — Run x64dbg auto-analysis after attaching (slower).
  - `break_on_entry` (boolean, opsiyonel) — Pause the debuggee right after attaching.
  - `gadget` (string, opsiyonel) — Frida Gadget listen address host:port. For targets that cannot be attached by pid.
  - `package` (string, opsiyonel) — Process or mobile package name. Defaults to Gadget. Required with usb.
  - `pid` (integer, opsiyonel) — Live process id. Required unless gadget or usb is set.
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
  - `usb` (boolean, opsiyonel) — Use the USB Frida device (phone or tablet) instead of a host:port Gadget.
- outputSchema: var (alanlar: architecture, attached, engine, entry_point, mode, module_base, module_entry, path, pid, session_id)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `debug_breakpoint`

Set, remove, or list breakpoints. Address may be hex, a number, or an x64dbg expression.

- Girdi alanları:
  - `action` (enum, opsiyonel)
  - `address` (string | number, opsiyonel) — Required for set/remove; ignored for list.
  - `condition` (string, opsiyonel) — Break condition expression (set only).
  - `log_text` (string, opsiyonel) — Log text on hit (set only).
  - `name` (string, opsiyonel) — Breakpoint name (set only).
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
  - `type` (enum, opsiyonel)
- outputSchema: var
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `debug_callstack`

Read the current thread's call stack (address, module, function per frame).

- Girdi alanları:
  - `max_frames` (integer, opsiyonel) — Max frames returned (default 50).
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: frames, session_id, threadId)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `debug_close`

Tear down the hidden x64dbg process held by a session. Launched targets are stopped; attached targets are detached and left running.

- Girdi alanları:
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: closed, session_id)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `debug_code`

Live code: disassemble at an address (default: the stopped instruction pointer), assemble one instruction, or run until an address. Requires confirm:true.

- Girdi alanları:
  - `action` (enum, zorunlu)
  - `address` (string | number, opsiyonel) — Address as hex ("0x140001000"), decimal, or an engine expression ("cip").
  - `confirm` (boolean, opsiyonel) — Must be true or the tool returns confirmation_required and does not touch the debuggee.
  - `count` (integer, opsiyonel) — Instruction count for disassemble (default 12).
  - `instruction` (string, opsiyonel) — Single instruction for assemble.
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `debug_continue`

Resume the debuggee until the next breakpoint, single-step, or exit. The stop posts an event (debug.breakpoint_hit / debug.exited / debug.paused) retrievable via events_pull.

- Girdi alanları:
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: address, reason, session_id)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `debug_memory`

Live process memory: read, search, or dump. Requires confirm:true. Without it the call returns confirmation_required and does not touch the debuggee.

- Girdi alanları:
  - `action` (enum, zorunlu)
  - `address` (string | number, opsiyonel) — Read/dump address.
  - `confirm` (boolean, opsiyonel) — Must be true or the tool returns confirmation_required and does not touch the debuggee.
  - `length` (integer, opsiyonel) — Search length in bytes (default 4096, or the main module).
  - `max_results` (integer, opsiyonel)
  - `pattern` (string, opsiyonel) — Search pattern. Hex bytes, or ascii when search_type is ascii.
  - `search_type` (enum, opsiyonel)
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
  - `size` (integer, opsiyonel) — Byte count for read (default 64) or dump (default 256).
  - `start_address` (string | number, opsiyonel) — Address as hex ("0x140001000"), decimal, or an engine expression ("cip").
- outputSchema: var
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `debug_open`

Open a PE target for live debugging on this session's debug engine. Auto-detects x86/x64 and leaves the debuggee paused. x64dbg breaks on entry; cdb stops at the initial loader breakpoint and reports the PE entry.

- Girdi alanları:
  - `auto_analyze` (boolean, opsiyonel) — Run x64dbg auto-analysis after loading (slower).
  - `break_on_entry` (boolean, opsiyonel) — Stop at the entry point after loading.
  - `command_line_args` (string, opsiyonel) — Command line arguments for the debuggee.
  - `path` (string, zorunlu) — Filesystem path of the PE binary to debug.
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: architecture, attached, engine, entry_point, mode, module_base, module_entry, opened, path, pid, session_id)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `debug_pause`

Asynchronously break a running debuggee. Idempotent when already paused.

- Girdi alanları:
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: address, reason, session_id)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `debug_plugin`

x64dbg Scylla and ScyllaHide. status reports files on disk. dump and hide do not open a window: a missing headless plugin returns engine_unavailable with the plugins path. Requires confirm:true. cdb and frida return capability_unsupported.

- Girdi alanları:
  - `action` (enum, zorunlu)
  - `confirm` (boolean, opsiyonel) — Must be true or the tool returns confirmation_required and does not touch the debuggee.
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `debug_registers`

Read debuggee registers (general + flags; segment/debug optionally).

- Girdi alanları:
  - `include_debug` (boolean, opsiyonel) — Include debug registers.
  - `include_segment` (boolean, opsiyonel) — Include segment registers.
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: debug, flags, general, segment, session_id)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `debug_state`

Report live debug state (running/paused/terminated + pause reason) and the open target, if any.

- Girdi alanları:
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `debug_step`

Single-step the debuggee (into or over calls) and report the new location.

- Girdi alanları:
  - `count` (integer, opsiyonel) — Steps to take (default 1).
  - `kind` (enum, opsiyonel)
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: address, disassembly, function, kind, module, registers, session_id)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `debug_thread`

Live threads: list, select, freeze, thaw, or read one thread's context. The id is the value returned by list (cdb index, x64dbg/frida OS thread id). Requires confirm:true. Frida has no suspend or switch API.

- Girdi alanları:
  - `action` (enum, zorunlu)
  - `confirm` (boolean, opsiyonel) — Must be true or the tool returns confirmation_required and does not touch the debuggee.
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
  - `thread_id` (integer, opsiyonel)
- outputSchema: var
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `debug_time`

Checkpoint snapshot, the checkpoint timeline, and rewind of one checkpoint. A checkpoint is the active thread's registers, the thread list, and one memory window. Requires confirm:true.

- Girdi alanları:
  - `action` (enum, zorunlu)
  - `checkpoint_id` (string, opsiyonel)
  - `confirm` (boolean, opsiyonel) — Must be true or the tool returns confirmation_required and does not touch the debuggee.
  - `memory_size` (integer, opsiyonel) — Bytes captured at the instruction pointer (default 64).
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `disassemble`

Disassemble instructions at an address (linear, `count` ops) or a whole function. Defaults to the entry function.

- Girdi alanları:
  - `address` (string | number, opsiyonel) — Target address as hex ("0x400200"), decimal, or flag name ("entry0").
  - `count` (integer, opsiyonel) — Ops for address mode (default 32).
  - `function` (string, opsiyonel) — Function name or address, e.g. "entry0".
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: count, location, ops, session_id, text)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `dump`

Read raw bytes at an address as hexdump text or a JSON byte array.

- Girdi alanları:
  - `address` (string | number, zorunlu) — Target address as hex ("0x400200"), decimal, or flag name ("entry0").
  - `format` (enum, opsiyonel)
  - `length` (integer, opsiyonel) — Bytes to read (default 128).
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: address, bytes, format, length, session_id, text)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `events_pull`

Pull events stored for one application session since a sequence number. This does not subscribe to push notifications.

- Girdi alanları:
  - `after` (integer, opsiyonel) — Return events with seq greater than this.
  - `limit` (integer, opsiyonel)
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: events, retainedFrom, session_id)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `explain`

Short Turkish explanation of an assembly window: what the region does, where it jumps, and which calls notify the user or the system. Pass instructions already disassembled, or a session_id. A live debug session is read only when confirm is true. Call this when the user asks what the assembly means.

- Girdi alanları:
  - `address` (string | number, opsiyonel) — Address to disassemble when instructions are omitted.
  - `confirm` (boolean, opsiyonel) — Required only when explain itself disassembles a live debug session. Pasted instructions skip this.
  - `count` (integer, opsiyonel) — How many instructions to read (default 16).
  - `instructions` (object[], opsiyonel) — Already fetched ops. When set, the debugger is not called.
  - `session_id` (string, opsiyonel) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: atlamalar, bildirimler, cagrilar, dil, gosterilen, kaynak, komut_sayisi, ozet, satirlar)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `get_cfg`

Control-flow graph of a function as JSON and/or Graphviz DOT. Defaults to the entry function.

- Girdi alanları:
  - `address` (string | number, opsiyonel) — Target address as hex ("0x400200"), decimal, or flag name ("entry0").
  - `format` (enum, opsiyonel)
  - `function` (string, opsiyonel) — Function name or address, e.g. "entry0".
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: dot, function, json, location, session_id)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `health`

Report bridge liveness. Does not touch a debugger engine.

- Girdi alanları: yok
- outputSchema: var (alanlar: name, protocol, sessions, status)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `open_target`

Open a binary target for static analysis in a radare2 session. Only mode 'static' is supported; anything else is a capability error. Requires r2 on PATH.

- Girdi alanları:
  - `mode` (string, opsiyonel) — Analysis mode. Only "static" is supported.
  - `path` (string, zorunlu) — Filesystem path of the binary to analyze.
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: engine, mode, opened, path, session_id)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `prerequisites`

Check the programs Conduit uses (radare2, x64dbg, cdb, Python, Frida, Graphviz, ScyllaHide). Missing ones include a download URL and where to put the files. The bridge does not download them. Call this when a tool is missing or before choosing an engine.

- Girdi alanları: yok
- outputSchema: var (alanlar: araclar, ozet)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=true, readOnlyHint=true)

### `rea_adb_devices`

Bağlı cihaz listesi.

- Girdi alanları: yok
- outputSchema: var (alanlar: arac, cihazlar, ok)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_adb_install`

APK cihaza kurulum.

- Girdi alanları:
  - `apk_path` (string, zorunlu)
  - `seri` (string, opsiyonel)
- outputSchema: var (alanlar: apk, arac, ok, sonuc)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_adb_logcat`

Cihaz logcat dökümü.

- Girdi alanları:
  - `seri` (string, opsiyonel)
- outputSchema: var (alanlar: arac, ok, satirlar, toplam_satir)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_adb_packages`

Yüklü paket listesi.

- Girdi alanları:
  - `filtre` (string, opsiyonel)
  - `seri` (string, opsiyonel)
- outputSchema: var (alanlar: arac, ok, paketler)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_adb_screencap`

Cihaz ekran görüntüsü.

- Girdi alanları:
  - `out` (string, zorunlu)
  - `seri` (string, opsiyonel)
- outputSchema: var (alanlar: arac, bayt, ok, yol)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_aot_detect`

NativeAOT sinyali.

- Girdi alanları:
  - `b64dosya` (string, zorunlu)
  - `metin` (string, opsiyonel)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_aot_objc`

ObjC dispatch izleri.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_aot_profile`

AOT profili.

- Girdi alanları:
  - `b64dosya` (string, zorunlu)
  - `metin` (string, opsiyonel)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_aot_swift`

Swift dispatch izleri.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_apktool_build`

Decode dizinden APK rebuild.

- Girdi alanları:
  - `dir` (string, zorunlu)
  - `out` (string, zorunlu)
- outputSchema: var (alanlar: arac, ciktiApk, ok, proje)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_apktool_caps`

apktool yetenek yoklaması.

- Girdi alanları: yok
- outputSchema: var (alanlar: aapt2, aapt2Tamam, apktool, arac, ok)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_apktool_decode`

APK decode (resource).

- Girdi alanları:
  - `apk_path` (string, zorunlu)
  - `out` (string, zorunlu)
- outputSchema: var (alanlar: apk, arac, ciktiDir, ok)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_apktool_framework`

Framework APK kurulumu.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: apk, arac, ok)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_apktool_info`

apktool+aapt2 sürümleri.

- Girdi alanları: yok
- outputSchema: var (alanlar: arac, ok, surum)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_apple_bundle`

Bundle anatomisi.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_apple_macho`

Mach-O sihir + dyld listesi.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_apple_plist`

Info.plist anahtar okuma.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_behavior_full`

Tek çağrıda davranış raporu.

- Girdi alanları:
  - `api` (string, zorunlu)
  - `net` (string, opsiyonel)
- outputSchema: var (alanlar: bulgular, cizelge, ok, ozet, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_behavior_timeline`

Olay çizelgesi + özet.

- Girdi alanları:
  - `olaylar` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_best_motor`

Hedef tip için en iyi motor (skor).

- Girdi alanları:
  - `adaylar` (string[], zorunlu)
  - `tip` (string, zorunlu)
- outputSchema: yok
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_browser_caps`

Browser yetenek yoklaması.

- Girdi alanları: yok
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_browser_click`

Tıklama + sonrası durum.

- Girdi alanları:
  - `selector` (string, zorunlu)
  - `url` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_browser_har_import`

HAR içe aktarma.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_browser_nav`

Sayfa açma + başlık.

- Girdi alanları:
  - `url` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_browser_scenario`

Senaryo kaydı.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_browser_shot`

Tam sayfa ekran görüntüsü.

- Girdi alanları:
  - `out` (string, zorunlu)
  - `url` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_config_suggest`

Bulunan araçlara MCP config snippet.

- Girdi alanları:
  - `bulunan` (string[], zorunlu)
- outputSchema: var (alanlar: snippet)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_console_yakala`

Konsol mesajları.

- Girdi alanları:
  - `url` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_coverage`

Kapsama oranı.

- Girdi alanları:
  - `incelenen` (integer, zorunlu)
  - `toplam` (integer, zorunlu)
- outputSchema: var (alanlar: arac, kalan, ok, oran)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_crash_append`

Crash olayı ekleme.

- Girdi alanları:
  - `olay` (string, zorunlu)
  - `olaylar` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_crash_hint`

Crash ipucu.

- Girdi alanları:
  - `olaylar` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_crash_kayit_parse`

Crash notu parse.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: arac, ok, registerlar, sinyal, threadSayisi, threadler)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_crash_ozet`

Crash özeti.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: arac, ilkFrame, ok, registerSayisi, sinyal, threadSayisi)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_crash_timeline`

Crash timeline.

- Girdi alanları:
  - `olaylar` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_cutter_caps`

Cutter/rizin yetenek yoklaması.

- Girdi alanları: yok
- outputSchema: var (alanlar: arac, ok, pdc, surum)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_cutter_decompile`

Cutter sözde-derleme.

- Girdi alanları:
  - `addr` (string, zorunlu)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: addr, arac, hedef, kaynak, kod, not, ok)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_cutter_disasm`

Cutter/rizin disassembly.

- Girdi alanları:
  - `addr` (string, zorunlu)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: addr, arac, hedef, ok, ops)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_cutter_funcs`

Cutter/rizin fonksiyon listesi.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, fonksiyonlar, hedef, ok)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_cutter_strings`

Cutter/rizin string listesi.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, hedef, ok, strings)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_cutter_xrefs`

Cutter/rizin xref listesi.

- Girdi alanları:
  - `addr` (string, zorunlu)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: addr, arac, hedef, ok, xrefs)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_diff_match`

Fonksiyon eşleme (JSON diziler).

- Girdi alanları:
  - `a` (string, zorunlu)
  - `b` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_diff_summary`

Eklenen/silinen özeti.

- Girdi alanları:
  - `a` (string, zorunlu)
  - `b` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_dos_com`

COM tespiti.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_dos_int21`

INT21 çağrı taraması.

- Girdi alanları:
  - `b64` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_dos_mz`

MZ başlık kontrolü.

- Girdi alanları:
  - `b64` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_dos_psp`

PSP struct parse.

- Girdi alanları:
  - `b64` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_dosya_izi`

API olaylarından dosya yazma/okuma.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_dotnet_cil`

CIL method dökümü (dnfile).

- Girdi alanları:
  - `filtre` (string, opsiyonel)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, assembly, dosya, filtre, method_sayisi, methods, not, ok)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_dotnet_metadata`

Assembly metadata okuma.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, clr, dosya, not, ok, okuyucu)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_dwarf_ozet`

ELF DWARF özeti.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, dosya, fonksiyonAdlari, ok, subprogramSayisi, unitSayisi)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_evidence_bundle`

Kanıt paketi derleme.

- Girdi alanları:
  - `ogeler` (string, zorunlu)
  - `sakli` (string, zorunlu)
- outputSchema: var (alanlar: digest, items, retained, tools_sha256)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_evidence_verify`

Kanıt paketi doğrulama.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: ok)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_evm_disasm`

EVM bytecode disassembly (offline).

- Girdi alanları:
  - `hex` (string, zorunlu)
- outputSchema: var (alanlar: arac, detay, ok, ozet)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_evm_selector`

EVM 4-byte selector (keccak, offline).

- Girdi alanları:
  - `sig` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_evm_selectors`

EVM seçici adayları.

- Girdi alanları:
  - `hex` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_evm_stats`

EVM opcode istatistiği.

- Girdi alanları:
  - `hex` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_fallback`

Birincil yoksa yedek zincir.

- Girdi alanları:
  - `birincil` (string, zorunlu)
  - `mevcut` (string[], zorunlu)
- outputSchema: yok
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_firmware_caps`

Firmware yetenek yoklaması.

- Girdi alanları: yok
- outputSchema: var (alanlar: ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_firmware_extract`

Firmware çıkarma.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: ok, summary, tool)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_firmware_handoff`

Firmware handoff notu.

- Girdi alanları:
  - `neden` (string, zorunlu)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: handoff, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_flutter_payload`

Flutter payload izleri.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: izler, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_flutter_scan`

Flutter/Dart izi tarama.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: buildId, dartMi, motor, ok, summary, tool, tur)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_frida_api`

API tracer (isim+args+retval).

- Girdi alanları:
  - `desen` (string, opsiyonel)
  - `pid` (integer, zorunlu)
- outputSchema: var (alanlar: arac, cagrilar, ok, pid, sayi)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_frida_cond`

Koşullu breakpoint.

- Girdi alanları:
  - `adres` (string, zorunlu)
  - `kosul` (string, zorunlu)
  - `pid` (integer, zorunlu)
- outputSchema: var (alanlar: adres, arac, hitSayisi, ok, pid, tuttu)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_frida_pause`

Hedef süreç duraklatma (NtSuspend).

- Girdi alanları:
  - `pid` (integer, zorunlu)
- outputSchema: var (alanlar: arac, durum, ok, pid)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_frida_resume`

Duraklatılmış süreci devam ettirme.

- Girdi alanları:
  - `pid` (integer, zorunlu)
- outputSchema: var (alanlar: arac, durum, ok, pid)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_frida_stalker`

Stalker çağrı izleme.

- Girdi alanları:
  - `pid` (integer, zorunlu)
  - `sure_ms` (integer, opsiyonel)
- outputSchema: var (alanlar: arac, cagrilar, ok, pid, sayi)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_frida_step`

Sonraki-komut emülasyonu.

- Girdi alanları:
  - `adres` (string, opsiyonel)
  - `pid` (integer, zorunlu)
- outputSchema: var (alanlar: adres, arac, ok, pid, sonraki, vurdu)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_fs_diff`

Snapshot diff.

- Girdi alanları:
  - `once` (string, zorunlu)
  - `sonra` (string, zorunlu)
- outputSchema: var (alanlar: kayıt, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_fs_snapshot`

Dizin snapshot.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: kayıt, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_ghidra_analyze`

Ghidra headless import+analiz.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, hedef, log, ok)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_ghidra_decompile`

Ghidra sözde-kod.

- Girdi alanları:
  - `addr` (string, zorunlu)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: addr, arac, hedef, kod, ok)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_ghidra_disasm`

Ghidra disassembly.

- Girdi alanları:
  - `addr` (string, zorunlu)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: addr, arac, hedef, kod, ok, sayi, talimatlar)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_ghidra_funcs`

Ghidra fonksiyon listesi.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, fonksiyonlar, hedef, ok)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_ghidra_strings`

Ghidra string listesi.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, hedef, ok, strings)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_ghidra_trace`

Snapshot -> Ghidra Trace import.

- Girdi alanları:
  - `kayit` (string, zorunlu)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, hedef, ok, sonuc)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_ghidra_vt`

İki binary fonksiyon diff (version tracking).

- Girdi alanları:
  - `eski` (string, zorunlu)
  - `yeni` (string, zorunlu)
- outputSchema: var (alanlar: arac, degisen, eklenen, eski, ok, ozet, silinen, yeni)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_ghidra_xrefs`

Ghidra xref listesi.

- Girdi alanları:
  - `addr` (string, zorunlu)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: addr, arac, hedef, ok, xrefs)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_go_module`

Go modül bilgisi.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_go_version`

Go sürüm izi.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_hap_liste`

HAP dosya listesi.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, dosya, dosyalar, ok, sayi)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_hap_manifest`

HAP manifest (bundle/version).

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, bundleName, dosya, kaynak, ok, version)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_hopper_istek`

Hopper istek dosyası üretimi.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: adresler, arac, hedef, hopper, istekDosyasi, ok)
- annotations: var (destructiveHint=true, readOnlyHint=false)

### `rea_hopper_tara`

Dosyada string/regex tarama.

- Girdi alanları:
  - `desen` (string, zorunlu)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, desen, eslesmeler, hedef, ok, regex, sayi)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_ida_flirt`

String-tabanlı derleyici/kütüphane tahmini (gerçek FLIRT imzası değil; IDA kuruluysa doğrulama için rea_ida_idb çıktısını IDA'da imza uygulayarak kullanın).

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, eslesmeler, guven, hedef, idaMevcut, kutuphane, method, not, ok, sayi, surumler)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_ida_idb`

IDB batch üretimi (idat).

- Girdi alanları:
  - `out` (string, zorunlu)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, hedef, idat, idb, ok)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_ilspy_decompile`

.NET C# decompile.

- Girdi alanları:
  - `out` (string, zorunlu)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, ciktiDir, cs_sayisi, dosya, not, ok)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_investigate`

Otomatik soruşturma planı (sniff+skor+yedek).

- Girdi alanları:
  - `path` (string, zorunlu)
  - `soru` (string, opsiyonel)
- outputSchema: var (alanlar: arac, motor, ok, plan, skor, tip, yedekler)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_jadx_classes`

APK sınıf listesi.

- Girdi alanları:
  - `apk_path` (string, zorunlu)
- outputSchema: var (alanlar: arac, ok, siniflar, toplam_sinif)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_jadx_decompile`

APK tek sınıf decompile.

- Girdi alanları:
  - `apk_path` (string, zorunlu)
  - `out` (string, zorunlu)
  - `sinif` (string, zorunlu)
- outputSchema: var (alanlar: arac, bayt, ciktiDir, dosya, ok, sinif)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_jadx_full`

APK tam decompile.

- Girdi alanları:
  - `apk_path` (string, zorunlu)
  - `out` (string, zorunlu)
- outputSchema: var (alanlar: arac, ciktiDir, java_dosya_sayisi, ok)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_jadx_manifest`

APK manifest özeti.

- Girdi alanları:
  - `apk_path` (string, zorunlu)
- outputSchema: var (alanlar: aktiviteler, apk, arac, izinler, ok, paket)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_jadx_methods`

Decompile çıktıda method listesi.

- Girdi alanları:
  - `dir` (string, zorunlu)
- outputSchema: var (alanlar: arac, methodlar, ok)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_jadx_read`

Decompile sınıf okuma (400 satır).

- Girdi alanları:
  - `dir` (string, zorunlu)
  - `sinif` (string, zorunlu)
- outputSchema: var (alanlar: arac, dosya, ok, satirlar, toplam_satir)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_jadx_xrefs`

Decompile çıktıda terim arama.

- Girdi alanları:
  - `dir` (string, zorunlu)
  - `terim` (string, zorunlu)
- outputSchema: var (alanlar: arac, kayitlar, ok)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_jeb_sorgu`

JEB MCP sorgusu.

- Girdi alanları:
  - `govde` (string, opsiyonel)
  - `url` (string, zorunlu)
  - `yontem` (string, zorunlu)
- outputSchema: var (alanlar: arac, durum, govde, ok, url, yontem)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_js_bundle`

Bundle özeti.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_js_export_shape`

Export şekli.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_js_require`

Require/import grafı.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_js_sourcemap`

Source-map çözümleme.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_managed_compare`

Managed üye diff.

- Girdi alanları:
  - `a` (string, zorunlu)
  - `b` (string, zorunlu)
- outputSchema: var (alanlar: arac, detay, ok, ozet)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_managed_import`

Reconstruction kaydı.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, detay, ok, ozet)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_managed_verify`

Native bağımlılık doğrulama.

- Girdi alanları:
  - `beklenen` (string, zorunlu)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, detay, ok, ozet)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_mips_funcs`

MIPS fonksiyon ön-tarama.

- Girdi alanları:
  - `b64` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_mips_psp_profile`

MIPS/PSP profili.

- Girdi alanları:
  - `b64` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_missing_reason`

Eksik araç + kur komutu.

- Girdi alanları:
  - `eksik` (string, zorunlu)
  - `platform` (string, opsiyonel)
- outputSchema: var (alanlar: alternatif, eksik, kur, neden)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_net_capture`

Yerel ağ yakalama (HAR).

- Girdi alanları:
  - `url` (string, zorunlu)
- outputSchema: var (alanlar: kayıt, ok, summary, tool)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_obligation_advance`

Halka ilerletme.

- Girdi alanları:
  - `bulgu` (string, zorunlu)
  - `defter` (string, zorunlu)
  - `kod` (string, zorunlu)
- outputSchema: var (alanlar: links)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_obligation_close`

Defter mühürleme.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: kapatıldı, links)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_obligation_ledger`

Defter kurma.

- Girdi alanları:
  - `bulgular` (string[], zorunlu)
  - `evidence_digest` (string, zorunlu)
  - `tools_sha256` (string, zorunlu)
- outputSchema: var (alanlar: evidence_digest, kapatıldı, ledger_id, links, tools_sha256)
- annotations: var (destructiveHint=false, idempotentHint=false, openWorldHint=false, readOnlyHint=true)

### `rea_obligation_verify`

Zincir doğrulama.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: eksik, ok)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_pdb_indir`

PE debug dizinindeki CodeView RSDS kaydından Microsoft symbol server'dan PDB indirme + bütünlük + önbellek.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, cache, dosya, guid, ok, pdb, url, yas, yol)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_pdb_yolu`

PE debug dizininden PDB yolu.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, dosya, guid, ok, pdb, yas)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_pe_imports`

PE import listesi.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, dlls, dosya, fonksiyonlar, not, ok, sayi)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_pe_info`

PE başlık bilgisi.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, bit, dosya, entry, entry_hex, machine, machine_hex, ok, section_sayisi)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_pe_sections`

PE section tablosu.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, bolumler, dosya, ok, sayi)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_process_caps`

Süreç yetenek yoklaması.

- Girdi alanları: yok
- outputSchema: var (alanlar: kayıt, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_process_compare`

Pipe/PTY karşılaştırma.

- Girdi alanları:
  - `cmd` (string, zorunlu)
- outputSchema: yok
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_process_run`

Süreç koşusu kaydı.

- Girdi alanları:
  - `cmd` (string, zorunlu)
- outputSchema: var (alanlar: kayıt, ok, summary, tool)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_pwn_elf_layout`

ELF layout + mitigation.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: yok
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_pwn_gadgets`

Gadget ipucu.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_r2_callgraph`

r2 fonksiyon çağrı grafı.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, fonksiyonlar, hedef, ok)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_r2_debug`

r2 toplu debug (bp+regs).

- Girdi alanları:
  - `addr` (string, zorunlu)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, bpAddr, cikti, hedef, not, ok)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_r2_esil`

r2 ESIL emülasyon regs.

- Girdi alanları:
  - `addr` (string, zorunlu)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: addr, adim, arac, hedef, ok, regs)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_readiness`

Reconstruction hazırlık skoru.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: arac, eksik, ok, seviye, skor)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_recon_funcs`

Pseudo-code fonksiyon listesi.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_recon_harness`

C harness iskeleti.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_recon_tag`

Vaka etiketi.

- Girdi alanları: yok
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_registry_izi`

API olaylarından registry yazma.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_scan_repo`

Repo taraması (tip+plan).

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_sniff`

Dosya tip + motor önerisi (magic-byte).

- Girdi alanları:
  - `b64dosya` (string, zorunlu)
- outputSchema: var (alanlar: motor, tip)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_storage_dump`

Cookies + localStorage.

- Girdi alanları:
  - `url` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_typedef_oner`

Argüman adı önerisi + yayılım.

- Girdi alanları:
  - `text` (string, zorunlu)
- outputSchema: var (alanlar: arac, ok, oneriler, sayi)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_unpack_hunt`

Bilinmeyen packer rehberli akışı.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: adimlar, arac, karar, ok)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_unpack_try`

Otomatik unpack yönlendirme.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: sonuc, yontem)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_upx_info`

UPX sıkışık mı bilgisi.

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, cikti, dosya, not, ok, sikisik)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_upx_unpack`

UPX açma.

- Girdi alanları:
  - `out` (string, zorunlu)
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, cikti, dosya, log, ok)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `rea_wasm_decode`

WASM/WAT çözümleme (wabt).

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `rea_wasm_exports`

WAT export listesi (offline).

- Girdi alanları:
  - `wat` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_wasm_imports`

WASM import listesi.

- Girdi alanları:
  - `b64` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_wasm_sections`

WASM section tablosu.

- Girdi alanları:
  - `b64` (string, zorunlu)
- outputSchema: var (alanlar: details, ok, summary, tool)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `rea_wasm_validate`

WASM doğrulama (wasm-validate).

- Girdi alanları:
  - `path` (string, zorunlu)
- outputSchema: var (alanlar: arac, detay, ok, ozet)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `session_close`

Drop an application session and its event buffer.

- Girdi alanları:
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: closed, session_id)
- annotations: var (destructiveHint=true, openWorldHint=true, readOnlyHint=false)

### `session_list`

List application sessions held in this process.

- Girdi alanları: yok
- outputSchema: var (alanlar: sessions)
- annotations: var (destructiveHint=false, idempotentHint=true, openWorldHint=false, readOnlyHint=true)

### `session_open`

Open an application session for an engine. Returns session_id for later tool arguments.

- Girdi alanları:
  - `engine` (enum, zorunlu)
- outputSchema: var (alanlar: createdAt, engine, session_id)
- annotations: var (destructiveHint=false, idempotentHint=false, openWorldHint=false, readOnlyHint=false)

### `static_info`

Report radare2 static-engine capabilities, r2 availability, and the open target (if any).

- Girdi alanları:
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: capabilities, engine, r2, session_id, target)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `strings`

Strings found in the binary (address, section, length, text).

- Girdi alanları:
  - `limit` (integer, opsiyonel) — Max strings returned (default 200).
  - `min_length` (integer, opsiyonel) — Keep strings with length >= this (default 0).
  - `offset` (integer, opsiyonel) — Skip this many matches (default 0).
  - `section` (string, opsiyonel) — Only strings from this section, e.g. ".rodata".
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: offset, session_id, strings, total)
- annotations: var (openWorldHint=true, readOnlyHint=false)

### `xrefs`

Cross-references to and/or from an address (code and data).

- Girdi alanları:
  - `address` (string | number, zorunlu) — Target address as hex ("0x400200"), decimal, or flag name ("entry0").
  - `direction` (enum, opsiyonel)
  - `session_id` (string, zorunlu) — Application session id. Not an MCP protocol session.
- outputSchema: var (alanlar: address, from, session_id, to)
- annotations: var (openWorldHint=true, readOnlyHint=false)

## Resources

- `rea-plus://capabilities-safety` — ad: `capabilities-safety` — mimeType: `application/json` — Statik yetenek ve guvenlik kurallari ozeti (salt-okunur).
- `rea-plus://server-info` — ad: `server-info` — mimeType: `application/json` — Statik sunucu kimligi ve yuzey ozeti (salt-okunur).

## Prompts

- `android-triage` — argümanlar: `focus` (opsiyonel), `path` (zorunlu) — APK icin jadx tabanli statik triage akisi (yan etkisiz prompt).
- `dotnet-malware-triage` — argümanlar: `focus` (opsiyonel), `path` (zorunlu) — .NET ornegi icin statik zararli-yazilim triage akisi (yan etkisiz prompt).
- `packer-triage` — argümanlar: `focus` (opsiyonel), `path` (zorunlu) — Packer/koruma tespiti icin sirali, statik-oncelikli rea akisi (yan etkisiz prompt).
