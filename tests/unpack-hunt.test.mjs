// unpack-hunt testleri (node:test). Gerçek upx + CoreLib üstünde.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rea_unpack_hunt } from "../dist/rea-domains/unpack/UnpackHunt.js";

const ELF = "C:/Users/kngal/AppData/Local/Temp/opencode/conduit/examples/target/mini_branch.elf";

test("upx sıkışık değilse dotnet/dump yoluna gider", () => {
  const r = rea_unpack_hunt(ELF);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(["dotnet", "dump"].includes(r.karar));
  assert.ok(r.adimlar.length >= 1);
});

test("yok ve boş kapıları", () => {
  assert.equal(rea_unpack_hunt("").ok, false);
  assert.equal(rea_unpack_hunt("C:/yok/değil.exe").ok, false);
});

test("dump reçetesi 4 adımlı", () => {
  const r = rea_unpack_hunt(ELF);
  assert.equal(r.ok, true);
  if (!r.ok || r.karar !== "dump") return;
  assert.equal(r.adimlar.length, 4);
  assert.equal(r.adimlar[0]?.tool, "debug_open");
});
