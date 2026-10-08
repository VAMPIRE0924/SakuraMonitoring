#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
workspace_root="$(cd "$script_dir/.." && pwd -P)"
arch=amd64
version=""
output=""
skip_install=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch) arch="$2"; shift 2 ;;
    --version) version="$2"; shift 2 ;;
    --output) output="$2"; shift 2 ;;
    --skip-install) skip_install=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
[[ "$arch" == "amd64" || "$arch" == "arm64" ]] || { echo "Unsupported arch: $arch" >&2; exit 2; }

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Formal Linux CGO releases are built by .github/workflows/build.yml." >&2
  echo "This local release builder intentionally runs only on Linux." >&2
  exit 1
fi

source "$script_dir/toolchain-env.sh"
version="${version:-$(node -e 'const x=require(process.argv[1]);process.stdout.write(x.backend.version)' "$workspace_root/upstreams.lock.json")}"
[[ "$version" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Invalid version: $version" >&2; exit 1; }
output="${output:-$workspace_root/dist/dashboard-linux-$arch}"

"$script_dir/verify-environment.sh" --require-go
"$script_dir/enforce-theme-boundary.sh" --prune --require-sakura
"$script_dir/prepare-official-frontend-dists.sh" --force
build_args=()
$skip_install && build_args+=(--skip-install)
"$script_dir/build-sakura-user-dist.sh" "${build_args[@]}"
"$script_dir/check-sakura-template.sh"
"$script_dir/build-linux-backend.sh" "$workspace_root" "$version" "$output" "$arch"
