#!/usr/bin/env bash
set -euo pipefail

workspace_root=${1:?workspace root is required}
version=${2:?semantic version is required}
goarch=${3:-amd64}
[[ $version =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid version' >&2; exit 1; }
case "$goarch" in amd64|arm64) ;; *) echo 'Unsupported architecture' >&2; exit 1 ;; esac
backend_root="$workspace_root/upstream/nezha"
geoip_path="$backend_root/pkg/geoip/geoip.db"
geoip_tool="$workspace_root/scripts/geoip-db-tool.go"
resource_tmp=$(mktemp -d)
trap 'rm -rf "$resource_tmp"' EXIT
cd "$backend_root"

if [[ -n ${GEOIP_DB_PATH:-} ]]; then
  if [[ "$GEOIP_DB_PATH" != "$geoip_path" ]]; then
    cp "$GEOIP_DB_PATH" "$geoip_path"
  fi
elif [[ -n ${IPINFO_TOKEN:-} ]]; then
  curl --fail --location --retry 3 \
    "https://ipinfo.io/data/free/country.mmdb?token=$IPINFO_TOKEN" --output "$geoip_path"
else
  official_zip="$resource_tmp/dashboard-linux-$goarch.zip"
  official_dir="$resource_tmp/official"
  curl --fail --location --retry 3 \
    "https://github.com/nezhahq/nezha/releases/download/$version/dashboard-linux-$goarch.zip" \
    --output "$official_zip"
  unzip -q "$official_zip" -d "$official_dir"
  go run "$geoip_tool" extract "$official_dir/dashboard-linux-$goarch" "$geoip_path"
fi
go run "$geoip_tool" validate "$geoip_path"

if [[ ! -f cmd/dashboard/docs/docs.go ]]; then
  go run github.com/swaggo/swag/cmd/swag@v1.16.6 \
    init -g cmd/dashboard/main.go -o cmd/dashboard/docs --parseDependency --parseInternal
fi
