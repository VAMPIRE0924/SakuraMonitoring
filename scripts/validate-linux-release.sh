#!/usr/bin/env bash
set -euo pipefail

binary=${1:?Linux dashboard binary is required}
expected_version=${2:-}
expected_arch=${3:-amd64}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
workspace_root=$(dirname "$script_dir")
backend_root="$workspace_root/upstream/nezha"
release_tmp=$(mktemp -d)
smoke_root="$release_tmp/smoke"
embedded_geoip="$release_tmp/geoip.mmdb"
dashboard_pid=''
cleanup() {
  if [[ -n $dashboard_pid ]] && kill -0 "$dashboard_pid" 2>/dev/null; then
    kill -TERM "$dashboard_pid" 2>/dev/null || true
    wait "$dashboard_pid" 2>/dev/null || true
  fi
  rm -rf "$release_tmp"
}
trap cleanup EXIT

command -v file >/dev/null
command -v readelf >/dev/null
command -v strings >/dev/null
command -v curl >/dev/null
command -v realpath >/dev/null

binary=$(realpath "$binary")

if [[ ! -x $binary ]]; then
  chmod +x "$binary"
fi

file_output=$(file "$binary")
echo "$file_output"
case "$expected_arch" in
  amd64) arch_pattern='x86-64' ;;
  arm64) arch_pattern='ARM aarch64' ;;
  *)
    echo "Unsupported release validation architecture: $expected_arch" >&2
    exit 1
    ;;
esac
if [[ $file_output != *"ELF 64-bit"* || $file_output != *"$arch_pattern"* ]]; then
  echo "Release is not a Linux $expected_arch ELF binary." >&2
  exit 1
fi

binary_runner=("$binary")
host_arch=$(uname -m)
if [[ $expected_arch == arm64 && $host_arch != aarch64 && $host_arch != arm64 ]]; then
  command -v qemu-aarch64-static >/dev/null
  binary_runner=(qemu-aarch64-static "$binary")
fi

if readelf -l "$binary" | grep -Fq 'INTERP'; then
  echo "Release has a dynamic ELF interpreter and cannot run in the official busybox:musl image." >&2
  exit 1
fi
echo "ELF interpreter: absent (static release)"
build_info=$(go version -m "$binary")
printf '%s\n' "$build_info" > "$release_tmp/build-info.txt"
printf '%s\n' "$build_info" | sed -n '1,12p'
expected_go=$(node -p "require(process.argv[1]).toolchain.go" "$workspace_root/upstreams.lock.json")
actual_go=$(printf '%s\n' "$build_info" | head -n 1 | awk '{print $NF}')
if [[ "$actual_go" != "go$expected_go" ]]; then
  echo "Release used $actual_go, expected official-aligned go$expected_go." >&2
  exit 1
fi
for setting in 'CGO_ENABLED=1' 'GOOS=linux' "GOARCH=$expected_arch" '-tags=go_json'; do
  if ! grep -Fq -- "$setting" "$release_tmp/build-info.txt"; then
    echo "Release build metadata is missing $setting." >&2
    exit 1
  fi
done
strings "$binary" > "$release_tmp/binary-strings.txt"

if grep -Fq 'go-sqlite3 requires cgo' "$release_tmp/binary-strings.txt"; then
  echo "The binary contains the go-sqlite3 CGO stub." >&2
  exit 1
fi
echo "CGO stub string: absent"

for forbidden_theme in 'Nazhua' 'Aobobo' 'Nezha-ASCII' 'Nezha-Pixel'; do
  if grep -Fq "$forbidden_theme" "$release_tmp/binary-strings.txt"; then
    echo "Release contains unsupported frontend theme: $forbidden_theme" >&2
    exit 1
  fi
done
echo "Embedded theme boundary: Official and Sakura only"

(
  cd "$backend_root"
  go run "$script_dir/geoip-db-tool.go" extract "$binary" "$embedded_geoip"
  go run "$script_dir/geoip-db-tool.go" validate "$embedded_geoip"
)

version_output=$("${binary_runner[@]}" -v 2>&1)
echo "$version_output"
if [[ -n $expected_version && $version_output != *"$expected_version"* ]]; then
  echo "Expected version $expected_version was not reported." >&2
  exit 1
fi

mkdir -p "$smoke_root"

cat > "$smoke_root/config.yaml" <<'EOF'
debug: false
listen_host: 127.0.0.1
listen_port: 18080
language: zh_CN
site_name: Sakura smoke test
agent_secret_key: sakura-release-agent-smoke-only
custom_code: '<style>/* sakura-public-smoke */</style>'
custom_code_dashboard: '<style>/* sakura-dashboard-appearance-smoke */</style>'
user_template: sakura-user-dist
admin_template: admin-dist
tsdb:
  data_path: tsdb
EOF

(
  cd "$smoke_root"
  NZ_JWTSECRETKEY=sakura-release-smoke-test-only-0123456789abcdef0123456789abcdef \
    "${binary_runner[@]}" -c "$smoke_root/config.yaml" -db "$smoke_root/sqlite.db" \
    > "$smoke_root/dashboard.log" 2>&1
) &
dashboard_pid=$!

ready=false
for _ in $(seq 1 40); do
  if curl --fail --silent \
    http://127.0.0.1:18080/api/v1/setting > "$smoke_root/setting.json" 2>/dev/null; then
    ready=true
    break
  fi
  if ! kill -0 "$dashboard_pid" 2>/dev/null; then
    break
  fi
  sleep 0.25
done

if [[ $ready != true ]]; then
  cat "$smoke_root/dashboard.log" >&2
  echo "Dashboard startup smoke test failed." >&2
  exit 1
fi

if grep -Fq 'go-sqlite3 requires cgo' "$smoke_root/dashboard.log"; then
  cat "$smoke_root/dashboard.log" >&2
  echo "Dashboard startup reached the go-sqlite3 CGO stub." >&2
  exit 1
fi

if ! grep -Fq 'sakura-dashboard-appearance-smoke' "$smoke_root/setting.json"; then
  echo "Anonymous setting response lost dashboard/login customization." >&2
  exit 1
fi
if ! grep -Fq 'sakura-public-smoke' "$smoke_root/setting.json"; then
  echo "Anonymous setting response lost public frontend customization." >&2
  exit 1
fi

echo "Startup smoke test: /api/v1/setting responded"

node "$script_dir/check-h2c-liveness.mjs" http://127.0.0.1:18080
(
  cd "$backend_root"
  SAKURA_SMOKE_AGENT_SECRET=sakura-release-agent-smoke-only \
    go run "$script_dir/check-agent-stream.go" 127.0.0.1:18080
)
