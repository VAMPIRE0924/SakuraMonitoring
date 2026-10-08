#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
workspace_input="${1:-$(cd "$script_dir/.." && pwd -P)}"
destination_input="${2:-$HOME/Projects/SakuraMonitoring}"

workspace="$(cd "$workspace_input" && pwd -P)"
"$workspace/scripts/enforce-theme-boundary.sh" --workspace-root "$workspace" --require-sakura
destination_parent_input="$(dirname "$destination_input")"
mkdir -p "$destination_parent_input"
destination_parent="$(cd "$destination_parent_input" && pwd -P)"
destination="$destination_parent/$(basename "$destination_input")"
staging="${destination}.__staging"

if [[ "$destination" == "$workspace" || "$destination" == "/" || -z "$destination" ]]; then
  echo "Unsafe GitHub mirror destination: $destination" >&2
  exit 1
fi

registry="$workspace/upstream/nezha/service/singleton/frontend-templates.yaml"
theme_paths="$(sed -nE 's/^[[:space:]]*-[[:space:]]+path:[[:space:]]*"([^"]+)".*/\1/p' "$registry" | sort -u)"
expected_paths="$(printf '%s\n' admin-dist sakura-user-dist user-dist | sort)"
if [[ "$theme_paths" != "$expected_paths" ]]; then
  echo "Theme boundary failed; refusing to generate the public mirror." >&2
  printf '%s\n' "$theme_paths" >&2
  exit 1
fi

rm -rf "$staging"
mkdir -p "$staging/scripts" "$staging/upstream"
trap 'rm -rf "$staging"' EXIT

for name in .gitattributes LICENSE NOTICE README.md upstreams.lock.json; do
  cp "$workspace/$name" "$staging/$name"
done
rsync -a "$workspace/.github/" "$staging/.github/"

release_scripts=(
  bootstrap-macos.sh
  build-linux-backend.sh
  build-sakura-release.sh
  build-sakura-user-dist.sh
  check-sakura-template.sh
  enforce-theme-boundary.sh
  geoip-db-tool.go
  mac-verify.sh
  prepare-official-frontend-dists.sh
  sakura-maintenance.mjs
  sakura-maintenance.test.mjs
  sync-github-macos.sh
  toolchain-env.sh
  update-upstreams.sh
  validate-linux-release.sh
  verify-environment.sh
)
for name in "${release_scripts[@]}"; do
  cp "$workspace/scripts/$name" "$staging/scripts/$name"
done

rsync -a \
  --exclude node_modules/ \
  --exclude dist/ \
  --exclude coverage/ \
  --exclude .cert/ \
  --exclude .git/ \
  --exclude .github/ \
  --exclude '*.log' \
  "$workspace/upstream/nezha-dash-v2/" \
  "$staging/upstream/nezha-dash-v2/"

rsync -a \
  --exclude .git/ \
  --exclude .github/ \
  --exclude admin-dist/ \
  --exclude user-dist/ \
  --exclude sakura-user-dist/ \
  --exclude data/ \
  --exclude docs/ \
  --exclude geoip.db \
  --exclude '*.log' \
  "$workspace/upstream/nezha/" \
  "$staging/upstream/nezha/"

find "$staging/upstream" -type f \( -iname '*.md' -o -iname '*.markdown' \) -delete

cat >"$staging/.gitignore" <<'EOF'
/dist/
/.upstream-review/
/upstream/nezha-dash-v2/node_modules/
/upstream/nezha-dash-v2/dist/
/upstream/nezha-dash-v2/coverage/
/upstream/nezha-dash-v2/.cert/
/upstream/nezha/cmd/dashboard/*-dist/*
!/upstream/nezha/cmd/dashboard/admin-dist/.gitkeep
!/upstream/nezha/cmd/dashboard/user-dist/.gitkeep
/upstream/nezha/cmd/dashboard/docs/
/upstream/nezha/cmd/dashboard/data/
*.log
.DS_Store
.idea/
.vscode/
Thumbs.db
*.pem
*.key
EOF

mkdir -p "$destination"
rsync -a --delete --exclude .git/ "$staging/" "$destination/"

markdown_count="$(find "$destination" -type f \( -iname '*.md' -o -iname '*.markdown' \) | wc -l | tr -d ' ')"
if [[ "$markdown_count" != "1" || ! -f "$destination/README.md" ]]; then
  echo "GitHub mirror documentation boundary check failed." >&2
  exit 1
fi

echo "GitHub mirror refreshed: $destination"
echo "Review git status before committing or pushing."
