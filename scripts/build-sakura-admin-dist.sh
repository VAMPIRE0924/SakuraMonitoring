#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "$script_dir/toolchain-env.sh"
cd "$script_dir/../upstream/sakura-admin"
pnpm install --frozen-lockfile
pnpm run build
rsync -a --delete dist/ ../nezha/cmd/dashboard/sakura-admin-dist/
