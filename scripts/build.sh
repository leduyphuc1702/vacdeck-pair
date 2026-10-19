#!/bin/sh
# Builds one self-contained program per platform with Bun (no Node needed on the customer's
# computer). Output: dist/vacdeck-pair-<os>-<arch>[.exe] and dist/SHA256SUMS.
set -eu
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist

for target in windows-x64 darwin-arm64 darwin-x64 linux-x64 linux-arm64; do
  name="vacdeck-pair-${target}"
  case "$target" in
    windows-*) name="${name}.exe" ;;
  esac
  bun build src/cli.mjs --compile --minify --target="bun-${target}" --outfile "dist/${name}"
done

cd dist
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum vacdeck-pair-* > SHA256SUMS
else
  shasum -a 256 vacdeck-pair-* > SHA256SUMS
fi
cat SHA256SUMS
