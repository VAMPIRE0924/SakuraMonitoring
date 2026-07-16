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
go version -m "$binary" | sed -n '1,12p'

if strings "$binary" | grep -Fq 'go-sqlite3 requires cgo'; then
  echo "The binary contains the go-sqlite3 CGO stub." >&2
  exit 1
fi
echo "CGO stub string: absent"

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

if grep -Fq 'custom_code_dashboard' "$smoke_root/setting.json"; then
  cat "$smoke_root/setting.json" >&2
  echo "Anonymous setting response exposed dashboard custom code." >&2
  exit 1
fi

echo "Startup smoke test: /api/v1/setting responded"

waf_status=$(curl --silent --dump-header "$smoke_root/waf.headers" --output "$smoke_root/waf.html" \
  --write-out '%{http_code}' http://127.0.0.1:18080/_sakura/waf)
if [[ $waf_status != 403 ]]; then
  cat "$smoke_root/waf.html" >&2
  echo "WAF decoy status was $waf_status, expected 403." >&2
  exit 1
fi
if ! grep -Fq 'VAMPIRE WAF' "$smoke_root/waf.html"; then
  cat "$smoke_root/waf.html" >&2
  echo "WAF decoy does not contain the VAMPIRE WAF brand." >&2
  exit 1
fi
waf_content_type=$(tr -d '\r' < "$smoke_root/waf.headers" | awk -F ': ' 'tolower($1) == "content-type" { print $2 }')
if [[ $waf_content_type != 'text/html; charset=utf-8' ]]; then
  echo "WAF decoy Content-Type was $waf_content_type, expected HTML." >&2
  exit 1
fi
echo "Startup smoke test: VAMPIRE WAF decoy responded"
