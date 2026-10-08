#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
project_root="$(cd "$script_dir/.." && pwd -P)"
install_go=false
install_node=false

for arg in "$@"; do
  case "$arg" in
    --install-go) install_go=true ;;
    --install-node) install_node=true ;;
    --install-all) install_node=true; install_go=true ;;
    *) echo "Usage: $0 [--install-node] [--install-go] [--install-all]" >&2; exit 2 ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This bootstrap script is intended for macOS." >&2
  exit 1
fi

go_version="$(sed -nE 's/^[[:space:]]*"go":[[:space:]]*"([^"]+)".*/\1/p' "$project_root/upstreams.lock.json")"
node_major="$(sed -nE 's/^[[:space:]]*"node":[[:space:]]*"([^"]+)".*/\1/p' "$project_root/upstreams.lock.json")"
pnpm_version="$(sed -nE 's/^[[:space:]]*"pnpm":[[:space:]]*"([^"]+)".*/\1/p' "$project_root/upstreams.lock.json")"
case "$(uname -m)" in
  arm64) go_arch=arm64 ;;
  x86_64) go_arch=amd64 ;;
  *) echo "Unsupported macOS architecture: $(uname -m)" >&2; exit 1 ;;
esac

tools_root="$project_root/.tools"
mkdir -p "$tools_root"
if $install_node; then
  node_arch="$go_arch"
  node_base_url="https://nodejs.org/dist/latest-v${node_major}.x"
  temp_root="$(mktemp -d "${TMPDIR:-/tmp}/sakura-node.XXXXXX")"
  trap 'find "$temp_root" -depth -delete 2>/dev/null || true' EXIT
  curl -fsSL "$node_base_url/SHASUMS256.txt" -o "$temp_root/SHASUMS256.txt"
  archive_name="$(awk -v arch="$node_arch" '$2 ~ ("node-v[0-9.]+-darwin-" arch "\\.tar\\.gz$") {print $2; exit}' "$temp_root/SHASUMS256.txt")"
  expected_sha="$(awk -v name="$archive_name" '$2 == name {print $1; exit}' "$temp_root/SHASUMS256.txt")"
  [[ -n "$archive_name" && -n "$expected_sha" ]] || { echo "Unable to resolve Node.js archive." >&2; exit 1; }
  curl -fL --retry 3 "$node_base_url/$archive_name" -o "$temp_root/$archive_name"
  actual_sha="$(shasum -a 256 "$temp_root/$archive_name" | awk '{print $1}')"
  [[ "$actual_sha" == "$expected_sha" ]] || { echo "Node.js archive checksum mismatch." >&2; exit 1; }
  [[ ! -e "$tools_root/node" ]] || find "$tools_root/node" -depth -delete
  mkdir -p "$tools_root/node"
  tar -xzf "$temp_root/$archive_name" --strip-components=1 -C "$tools_root/node"
  [[ ! -e "$tools_root/pnpm" ]] || find "$tools_root/pnpm" -depth -delete
  "$tools_root/node/bin/npm" install --global --prefix "$tools_root/pnpm" "pnpm@$pnpm_version"
  find "$temp_root" -depth -delete
  trap - EXIT
  echo "Installed project-local Node.js and pnpm."
fi

if $install_go; then
  archive_name="go${go_version}.darwin-${go_arch}.tar.gz"
  metadata_url="https://go.dev/dl/?mode=json&include=all"
  download_url="https://go.dev/dl/$archive_name"
  temp_root="$(mktemp -d "${TMPDIR:-/tmp}/sakura-go.XXXXXX")"
  trap 'find "$temp_root" -depth -delete 2>/dev/null || true' EXIT

  curl -fsSL "$metadata_url" -o "$temp_root/releases.json"
  expected_sha="$(
    node - "$temp_root/releases.json" "$go_version" "$archive_name" <<'NODE'
const fs = require("node:fs");
const [metadataPath, version, filename] = process.argv.slice(2);
const release = JSON.parse(fs.readFileSync(metadataPath, "utf8")).find((item) => item.version === `go${version}`);
const archive = release?.files.find((item) => item.filename === filename);
if (!archive?.sha256) process.exit(1);
process.stdout.write(archive.sha256);
NODE
  )"
  curl -fL --retry 3 "$download_url" -o "$temp_root/$archive_name"
  actual_sha="$(shasum -a 256 "$temp_root/$archive_name" | awk '{print $1}')"
  if [[ "$actual_sha" != "$expected_sha" ]]; then
    echo "Go archive checksum mismatch." >&2
    exit 1
  fi

  mkdir -p "$tools_root"
  if [[ -e "$tools_root/go" ]]; then
    find "$tools_root/go" -depth -delete
  fi
  tar -xzf "$temp_root/$archive_name" -C "$tools_root"
  echo "Installed project-local Go $go_version: $tools_root/go"
fi

source "$script_dir/toolchain-env.sh"
for command_name in node pnpm; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "$command_name is missing. Run $0 --install-node" >&2
    exit 1
  }
done
echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version)"
if command -v go >/dev/null 2>&1; then
  echo "Go: $(go version)"
else
  echo "Go: missing (run $0 --install-go)"
fi
if xcode-select -p >/dev/null 2>&1; then
  echo "Xcode Command Line Tools: $(xcode-select -p)"
else
  echo "Xcode Command Line Tools: missing"
  echo "Run 'xcode-select --install' in Terminal and complete the macOS dialog."
fi

cd "$project_root/upstream/nezha-dash-v2"
pnpm install --frozen-lockfile
echo "macOS bootstrap completed."
