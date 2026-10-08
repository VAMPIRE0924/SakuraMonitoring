#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
project_root="${1:-$(cd "$script_dir/.." && pwd -P)}"
frontend_root="$project_root/upstream/nezha-dash-v2"
backend_root="$project_root/upstream/nezha"
source "$script_dir/toolchain-env.sh"

if [[ ! -d "$project_root/.git" || ! -f "$backend_root/service/singleton/frontend-templates.yaml" ]]; then
  echo "Invalid Sakura Monitoring project path: $project_root" >&2
  exit 1
fi

"$script_dir/verify-environment.sh" --require-go
"$script_dir/enforce-theme-boundary.sh" --workspace-root "$project_root" --require-sakura
node --test "$script_dir/sakura-maintenance.test.mjs"
if ! xcode-select -p >/dev/null 2>&1; then
  echo "Xcode Command Line Tools are required for backend CGO tests." >&2
  echo "Run: xcode-select --install" >&2
  exit 1
fi

cd "$frontend_root"
pnpm install --frozen-lockfile
pnpm run check
pnpm run test
pnpm run typecheck
pnpm run build

cd "$backend_root"
go test ./...

cd "$project_root"
git diff --check

echo "macOS verification passed."
