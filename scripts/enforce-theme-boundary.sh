#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
workspace_root="$(cd "$script_dir/.." && pwd -P)"
source "$script_dir/toolchain-env.sh"
backend_root=""
options=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace-root) workspace_root="$(cd "$2" && pwd -P)"; shift 2 ;;
    --backend-root) backend_root="$(cd "$2" && pwd -P)"; shift 2 ;;
    --prune|--require-sakura) options+=("$1"); shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
backend_root="${backend_root:-$workspace_root/upstream/nezha}"
node "$script_dir/sakura-maintenance.mjs" enforce-theme-boundary "$backend_root" "${options[@]}"
