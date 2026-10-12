// ornek.js: golden korpus icin kucuk require'li bundle (deterministik).
const path = require("node:path");
const fs = require("node:fs");
function selamla(ad) {
  return "merhaba " + ad + " (" + path.basename(__filename) + ")";
}
const VARSAYILAN = selamla("korpus");
module.exports = { selamla, VARSAYILAN, fs };
