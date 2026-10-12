// jadx-full.test.mjs: JadxBridge tam kullanım testleri (node:test, jadx gerektirmez).
// Koş: node tests/jadx-full.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  JADX_TOOLS,
  rea_jadx_full,
  rea_jadx_methods,
  rea_jadx_xrefs,
  rea_jadx_read,
} from "../dist/rea-domains/android/JadxBridge.js";

// Sahte jadx çıktısı: salt dosya tarama fonksiyonları için (jadx gerektirmez).
function sahteCikti() {
  const dir = mkdtempSync(join(tmpdir(), "jadx-"));
  writeFileSync(join(dir, "MainActivity.java"), [
    "package com.ornek;",
    "",
    "public class MainActivity {",
    "    public void onCreate() {",
    "        String t = ApiClient.getToken();",
    "    }",
    "    private String gizli(String s) {",
    "        return s;",
    "    }",
    "}",
    "",
  ].join("\n"));
  mkdirSync(join(dir, "api"), { recursive: true });
  writeFileSync(join(dir, "api", "ApiClient.java"), [
    "package com.ornek.api;",
    "",
    "public class ApiClient {",
    "    protected static String getToken() {",
    "        return \"abc\";",
    "    }",
    "}",
    "",
  ].join("\n"));
  // 400 satır cap kontrolü için uzun sınıf (500+ satır).
  const uzun = ["public class BigClass {"];
  for (let i = 0; i < 499; i++) uzun.push(`    // satir ${i + 2}`);
  uzun.push("}");
  writeFileSync(join(dir, "BigClass.java"), uzun.join("\n"));
  return dir;
}

// TOOLS kataloğu 7 isme genişledi.
test("JADX_TOOLS 7 araç adı içerir", () => {
  assert.equal(JADX_TOOLS.length, 7);
  for (const ad of ["rea_jadx_manifest", "rea_jadx_classes", "rea_jadx_decompile", "rea_jadx_full", "rea_jadx_methods", "rea_jadx_xrefs", "rea_jadx_read"]) {
    assert.ok(JADX_TOOLS.includes(ad), `eksik: ${ad}`);
  }
});

// jadx kapısı veya eksik APK: capability_unsupported (ortamdan bağımsız).
test("full: apk yoksa capability_unsupported", () => {
  const r = rea_jadx_full(join(tmpdir(), "olmayan.apk"), join(tmpdir(), "jadx-cikti"));
  assert.equal(r.ok, false);
  assert.equal(r.code, "capability_unsupported");
});

// methods regex sahte .java dizininde {sinif, method} listesi çıkarır.
test("methods: sahte dizinde imzaları bulur", () => {
  const r = rea_jadx_methods(sahteCikti());
  assert.equal(r.ok, true);
  assert.ok(r.methodlar.length >= 3);
  for (const m of r.methodlar) {
    assert.ok(m.sinif.length > 0);
    assert.match(m.method, /public|private|protected/);
    assert.match(m.method, /\(.*\)/);
  }
});

// Sınıf filtresi sonuç kümesini daraltır.
test("methods: sinifFiltre daraltır", () => {
  const r = rea_jadx_methods(sahteCikti(), "ApiClient");
  assert.equal(r.ok, true);
  assert.ok(r.methodlar.length >= 1);
  assert.ok(r.methodlar.every((m) => m.sinif === "ApiClient"));
});

// Limit üst sınırı aşılmaz.
test("methods: limit aşılmaz", () => {
  const r = rea_jadx_methods(sahteCikti(), undefined, 1);
  assert.equal(r.ok, true);
  assert.ok(r.methodlar.length <= 1);
});

// xrefs terim geçen satırları dosya:satır:metin olarak bulur.
test("xrefs: terim geçen satırları bulur", () => {
  const r = rea_jadx_xrefs(sahteCikti(), "getToken");
  assert.equal(r.ok, true);
  assert.ok(r.kayitlar.length >= 2);
  for (const k of r.kayitlar) {
    assert.ok(k.dosya.endsWith(".java"));
    assert.ok(k.satir >= 1);
    assert.ok(k.metin.includes("getToken"));
  }
});

// read ilk 400 satırı döndürür (cap).
test("read: 400 satır cap uygular", () => {
  const r = rea_jadx_read(sahteCikti(), "BigClass");
  assert.equal(r.ok, true);
  assert.equal(r.satirlar.length, 400);
  assert.ok(r.toplam_satir > 400);
  assert.ok(r.dosya.endsWith("BigClass.java"));
});

// read bilinmeyen sınıfta capability_unsupported verir.
test("read: bilinmeyen sınıf capability_unsupported", () => {
  const r = rea_jadx_read(sahteCikti(), "YokBoyleSinif");
  assert.equal(r.ok, false);
  assert.equal(r.code, "capability_unsupported");
});
