// investigate testleri (node:test). Gerçek mini_branch.elf + sahte APK.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_investigate } from "../dist/facade/investigate.js";

const ELF = "C:/Users/kngal/AppData/Local/Temp/opencode/conduit/examples/target/mini_branch.elf";

test("elf soruşturması radare2 planı kurar", () => {
  const r = rea_investigate(ELF, "ne yapıyor?");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.tip, "elf");
  assert.equal(r.motor, "radare2");
  assert.ok(r.skor >= 90);
  assert.ok(r.plan.length >= 3);
  assert.equal(r.plan[r.plan.length - 1]?.tool, "rea_readiness");
});

test("apk soruşturması jadx planı kurar", () => {
  const d = join(tmpdir(), `rea-inv-${Date.now().toString(36)}`);
  mkdirSync(d, { recursive: true });
  const p = join(d, "sahte.apk");
  const buf = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100)]);
  writeFileSync(p, buf);
  const r = rea_investigate(p);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.tip, "apk");
  assert.equal(r.motor, "jadx");
});

test("yok ve boş kapıları", () => {
  assert.equal(rea_investigate("").ok, false);
  assert.equal(rea_investigate("C:/yok/olmayan.bin").ok, false);
  const d = join(tmpdir(), `rea-inv2-${Date.now().toString(36)}`);
  mkdirSync(d, { recursive: true });
  const p = join(d, "duz.bin");
  writeFileSync(p, Buffer.alloc(64, 0x41));
  const r = rea_investigate(p);
  assert.equal(r.ok, false); // bilinmiyor tip
});
