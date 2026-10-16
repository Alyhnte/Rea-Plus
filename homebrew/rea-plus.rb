# homebrew/rea-plus.rb — ReaPlus Homebrew formulu (hazirlik; tap yayini YOK).
# Surum kaynagi: package.json (0.10.2).
# sha256: yerel `npm pack` ciktisinin gercek olcumu (sbom.json kok hash'i ile ayni).
# Registry tarball'i `npm publish` sonrasi farkli olabilir; siseleme oncesi guncelleyin.
# Uydurma hash YOK.
class ReaPlus < Formula
  desc "Conduit live-debug core + Rea static domains over MCP stdio/HTTP"
  homepage "https://github.com/Alyhnte/ReaPlus"
  url "https://registry.npmjs.org/rea-plus/-/rea-plus-0.10.2.tgz"
  version "0.10.2"
  sha256 "349fb2395dcaf7d2669d6a94035c1c363ce912b2dde6b10fa953d389668a2c32"
  license "MIT"

  depends_on "node"

  def install
    libexec.install Dir["*"]
    bin.write_exec_script libexec/"dist/cli/index.js", "rea-plus-cli"
    bin.write_exec_script libexec/"dist/server.js", "rea-plus"
  end

  test do
    assert_match "0.10.2", shell_output("#{bin}/rea-plus-cli --version")
  end
end
