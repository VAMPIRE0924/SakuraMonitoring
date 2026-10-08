#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
workspace_root="$(cd "$script_dir/.." && pwd -P)"
run_go_tests=false
run_frontend_smoke=false
require_go=false

for arg in "$@"; do
  case "$arg" in
    --run-go-tests) run_go_tests=true ;;
    --run-frontend-smoke) run_frontend_smoke=true ;;
    --require-go) require_go=true ;;
    *) echo "Usage: $0 [--require-go] [--run-go-tests] [--run-frontend-smoke]" >&2; exit 2 ;;
  esac
done

source "$script_dir/toolchain-env.sh"
for command_name in node pnpm git; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Missing required command: $command_name" >&2
    exit 1
  }
done

expected_go="$(node -e 'const x=require(process.argv[1]);process.stdout.write(x.toolchain.go)' "$workspace_root/upstreams.lock.json")"
expected_node="$(node -e 'const x=require(process.argv[1]);process.stdout.write(x.toolchain.node)' "$workspace_root/upstreams.lock.json")"
expected_pnpm="$(node -e 'const x=require(process.argv[1]);process.stdout.write(x.toolchain.pnpm)' "$workspace_root/upstreams.lock.json")"
actual_node="$(node --version | sed 's/^v//' | cut -d. -f1)"
actual_pnpm="$(pnpm --version)"
echo "node: $(node --version)"
echo "pnpm: $(pnpm --version)"
echo "git: $(git --version)"
[[ "$actual_node" == "$expected_node" ]] || { echo "Expected Node $expected_node.x, found $actual_node.x." >&2; exit 1; }
[[ "$actual_pnpm" == "$expected_pnpm" ]] || { echo "Expected pnpm $expected_pnpm, found $actual_pnpm." >&2; exit 1; }

if command -v go >/dev/null 2>&1; then
  actual_go="$(go env GOVERSION | sed 's/^go//')"
  echo "go: $(go version)"
  if [[ "$actual_go" != "$expected_go" ]]; then
    echo "Expected Go $expected_go, found $actual_go." >&2
    exit 1
  fi
elif $run_go_tests || $require_go; then
  echo "Go $expected_go is required. Run ./scripts/bootstrap-macos.sh --install-go" >&2
  exit 1
else
  echo "go: missing (required only for backend checks)"
fi

if $run_frontend_smoke; then
  (cd "$workspace_root/upstream/nezha-dash-v2" && pnpm run typecheck)
fi
if $run_go_tests; then
  if ! xcode-select -p >/dev/null 2>&1; then
    echo "Xcode Command Line Tools are required for CGO tests. Run: xcode-select --install" >&2
    exit 1
  fi
  cache_root="${XDG_CACHE_HOME:-$HOME/Library/Caches}/SakuraMonitoring"
  mkdir -p "$cache_root/go-build" "$cache_root/go-mod"
  (
    export CGO_ENABLED=1
    export GOCACHE="$cache_root/go-build"
    export GOMODCACHE="$cache_root/go-mod"
    cd "$workspace_root/upstream/nezha"
    go test ./model ./service/singleton ./cmd/dashboard/controller
  )
fi
echo "Environment verification passed."
