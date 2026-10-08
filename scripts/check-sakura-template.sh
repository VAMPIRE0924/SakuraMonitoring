#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
workspace_root="$(cd "$script_dir/.." && pwd -P)"
source "$script_dir/toolchain-env.sh"
if [[ ${1:-} == "--workspace-root" && -n ${2:-} ]]; then
  workspace_root="$(cd "$2" && pwd -P)"
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--workspace-root PATH]" >&2
  exit 2
fi
node "$script_dir/sakura-maintenance.mjs" check-template "$workspace_root"
