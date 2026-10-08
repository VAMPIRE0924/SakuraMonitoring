#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
workspace_root="$(cd "$script_dir/.." && pwd -P)"
source "$script_dir/toolchain-env.sh"
force=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace-root) workspace_root="$(cd "$2" && pwd -P)"; shift 2 ;;
    --force) force=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

backend_root="$workspace_root/upstream/nezha"
registry="$backend_root/service/singleton/frontend-templates.yaml"
[[ -f "$registry" ]] || { echo "Frontend template registry not found: $registry" >&2; exit 1; }
"$script_dir/enforce-theme-boundary.sh" --workspace-root "$workspace_root" --require-sakura
for command_name in node curl unzip rsync; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "Missing command: $command_name" >&2; exit 1; }
done

for template_path in admin-dist user-dist; do
  download_url="$(node "$script_dir/sakura-maintenance.mjs" template-url "$backend_root" "$template_path")"
  target="$backend_root/cmd/dashboard/$template_path"
  marker="$target/.sakura-source"
  mkdir -p "$target"
  if ! $force && [[ -f "$target/index.html" && -f "$marker" ]] &&
    [[ "$(tr -d '\r\n' < "$marker")" == "$download_url" ]]; then
    echo "Keeping current $template_path from $download_url"
    continue
  fi

  temp_root="$(mktemp -d "${TMPDIR:-/tmp}/sakura-official-dist.XXXXXX")"
  curl -fL --retry 3 "$download_url" -o "$temp_root/$template_path.zip"
  mkdir -p "$temp_root/extract"
  unzip -q "$temp_root/$template_path.zip" -d "$temp_root/extract"
  source_dist="$temp_root/extract/dist"
  [[ -f "$source_dist/index.html" ]] || {
    find "$temp_root" -depth -delete
    echo "$template_path release index not found." >&2
    exit 1
  }

  case "$target" in "$workspace_root"/*) ;; *) echo "Unsafe target: $target" >&2; exit 1 ;; esac
  find "$target" -mindepth 1 ! -name .gitkeep -depth -delete
  rsync -a "$source_dist/" "$target/"
  printf '%s\n' "$download_url" > "$marker"
  find "$temp_root" -depth -delete
  echo "Prepared $template_path from $download_url"
done
