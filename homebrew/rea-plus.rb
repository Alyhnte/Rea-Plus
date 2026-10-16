# homebrew/rea-plus.rb — ReaPlus Homebrew formulu (hazirlik; tap yayini YOK).
# Surum kaynagi: package.json (0.9.0).
# sha256: yerel `npm pack` ciktisinin gercek olcumu (sbom.json kok hash'i ile ayni).
# Registry tarball'i `npm publish` sonrasi farkli olabilir; siseleme oncesi guncelleyin.
# Uydurma hash YOK.
class ReaPlus < Formula
  desc "Conduit live-debug core + Rea static domains over MCP stdio/HTTP"
  homepage "https://github.com/Alyhnte/ReaPlus"
  url "https://registry.npmjs.org/rea-plus/-/rea-plus-0.9.0.tgz"
  version "0.9.0"
  sha256 "d2ef76754e5a582f6a005f62bab20ac48aa3b8d15b930ddc99064cc3ef925fb0"
  license "MIT"

  depends_on "node"

  def install
    libexec.install Dir["*"]
    bin.write_exec_script libexec/"dist/cli/index.js", "rea-plus-cli"
    bin.write_exec_script libexec/"dist/server.js", "rea-plus"
  end

  test do
    assert_match "0.9.0", shell_output("#{bin}/rea-plus-cli --version")
  end
end
