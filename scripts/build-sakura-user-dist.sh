#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
workspace_root="$(cd "$script_dir/.." && pwd -P)"
source "$script_dir/toolchain-env.sh"
skip_install=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace-root) workspace_root="$(cd "$2" && pwd -P)"; shift 2 ;;
    --skip-install) skip_install=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

dash_root="$workspace_root/upstream/nezha-dash-v2"
frontend_dist="$dash_root/dist"
target_dist="$workspace_root/upstream/nezha/cmd/dashboard/sakura-user-dist"
[[ -d "$dash_root" ]] || { echo "Frontend source not found: $dash_root" >&2; exit 1; }

cd "$dash_root"
$skip_install || pnpm install --frozen-lockfile
pnpm run build
[[ -f "$frontend_dist/index.html" ]] || { echo "Frontend build output not found." >&2; exit 1; }

case "$target_dist" in "$workspace_root"/*) ;; *) echo "Unsafe target: $target_dist" >&2; exit 1 ;; esac
mkdir -p "$target_dist"
find "$target_dist" -mindepth 1 -depth -delete
rsync -a "$frontend_dist/" "$target_dist/"
echo "Built Sakura frontend template: $target_dist"
