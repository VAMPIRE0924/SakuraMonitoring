#!/usr/bin/env bash
set -euo pipefail

workspace_root=${1:?workspace root is required}
version=${2:?semantic version is required}
output_path=${3:?output path is required}
goarch=${4:-amd64}

if [[ ! $version =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Version must be a semantic release version such as v2.2.9: $version" >&2
  exit 1
fi

case "$goarch" in
  amd64|arm64) ;;
  *)
    echo "Unsupported Linux architecture: $goarch" >&2
    exit 1
    ;;
esac

backend_root="$workspace_root/upstream/nezha"
if [[ ! -f "$backend_root/go.mod" ]]; then
  echo "Nezha backend source not found: $backend_root" >&2
  exit 1
fi

command -v go >/dev/null
host_arch=$(uname -m)
case "$goarch" in
  amd64)
    if [[ $host_arch == x86_64 ]]; then cc=gcc; else cc=x86_64-linux-gnu-gcc; fi
    ;;
  arm64)
    if [[ $host_arch == aarch64 || $host_arch == arm64 ]]; then cc=gcc; else cc=aarch64-linux-gnu-gcc; fi
    ;;
  *)
    echo "Official Nezha static CGO release settings are not configured for Linux $goarch." >&2
    exit 1
    ;;
esac

command -v "$cc" >/dev/null
command -v file >/dev/null
command -v zip >/dev/null
command -v curl >/dev/null
command -v unzip >/dev/null

mkdir -p "$(dirname "$output_path")"
cd "$backend_root"

geoip_path="$backend_root/pkg/geoip/geoip.db"
geoip_backup=$(mktemp)
geoip_work=$(mktemp -d)
cp "$geoip_path" "$geoip_backup"
cleanup() {
  cp "$geoip_backup" "$geoip_path"
  rm -f "$geoip_backup"
  rm -rf "$geoip_work"
}
trap cleanup EXIT

geoip_tool="$workspace_root/scripts/geoip-db-tool.go"
if [[ -n ${GEOIP_DB_PATH:-} ]]; then
  cp "$GEOIP_DB_PATH" "$geoip_path"
elif [[ -n ${IPINFO_TOKEN:-} ]]; then
  curl --fail --location --retry 3 \
    "https://ipinfo.io/data/free/country.mmdb?token=$IPINFO_TOKEN" \
    --output "$geoip_path"
else
  official_zip="$geoip_work/dashboard-linux-$goarch.zip"
  official_dir="$geoip_work/official"
  curl --fail --location --retry 3 \
    "https://github.com/nezhahq/nezha/releases/download/$version/dashboard-linux-$goarch.zip" \
    --output "$official_zip"
  unzip -q "$official_zip" -d "$official_dir"
  go run "$geoip_tool" extract \
    "$official_dir/dashboard-linux-$goarch" "$geoip_path"
fi
go run "$geoip_tool" validate "$geoip_path"

if [[ ! -f cmd/dashboard/docs/docs.go ]]; then
  go run github.com/swaggo/swag/cmd/swag@v1.16.6 \
    init -g cmd/dashboard/main.go -o cmd/dashboard/docs \
    --parseDependency --parseInternal
fi

ldflags="-s -w -X github.com/nezhahq/nezha/service/singleton.Version=$version -extldflags '-static -fpic'"
CGO_ENABLED=1 GOOS=linux GOARCH="$goarch" CC="$cc" \
  go build -tags go_json -buildvcs=false -trimpath -ldflags "$ldflags" \
  -o "$output_path" ./cmd/dashboard

file "$output_path"
if ! file "$output_path" | grep -Fq 'statically linked'; then
  echo "Official Linux release must be statically linked for the busybox:musl runtime." >&2
  exit 1
fi
go run "$geoip_tool" extract "$output_path" "$geoip_work/embedded.mmdb"
go run "$geoip_tool" validate "$geoip_work/embedded.mmdb"
(
  cd "$(dirname "$output_path")"
  output_name=$(basename "$output_path")
  sha256sum "$output_name" | tee "$output_name.sha256"
  rm -f "$output_name.zip"
  zip -9 "$output_name.zip" "$output_name"
)
