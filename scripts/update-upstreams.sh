#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
workspace_root="$(cd "$script_dir/.." && pwd -P)"
source "$script_dir/toolchain-env.sh"
lock_path="$workspace_root/upstreams.lock.json"
review_root="$workspace_root/.upstream-review"
prepare=false
force=false
for arg in "$@"; do
  case "$arg" in
    --prepare) prepare=true ;;
    --force) force=true ;;
    *) echo "Usage: $0 [--prepare] [--force]" >&2; exit 2 ;;
  esac
done

[[ -f "$lock_path" ]] || { echo "Missing upstream lock file: $lock_path" >&2; exit 1; }
for name in backend frontend; do
  read -r repository branch locked_commit version < <(
    node - "$lock_path" "$name" <<'NODE'
const lock = require(process.argv[2]);
const item = lock[process.argv[3]];
console.log(item.repository, item.branch, item.commit, item.version);
NODE
  )
  remote_ref="refs/heads/$branch"
  latest_commit="$(git ls-remote "$repository" "$remote_ref" | awk 'NR == 1 {print $1}')"
  [[ -n "$latest_commit" ]] || { echo "Unable to resolve $name $remote_ref" >&2; exit 1; }
  printf '\n== %s ==\nRepository: %s\nBranch: %s\nLocked: %s (%s)\nLatest: %s\n' \
    "$name" "$repository" "$branch" "$locked_commit" "$version" "$latest_commit"
  if [[ "$latest_commit" == "$locked_commit" ]]; then
    echo "State: up to date"
    continue
  fi
  echo "State: upstream update available"
  $prepare || continue

  target="$review_root/$name"
  case "$target" in "$review_root"/*) ;; *) echo "Unsafe review target: $target" >&2; exit 1 ;; esac
  if [[ -e "$target" ]]; then
    $force || { echo "Review directory exists; pass --force: $target" >&2; exit 1; }
    find "$target" -depth -delete
  fi
  mkdir -p "$review_root"
  git clone --filter=blob:none --branch "$branch" "$repository" "$target"
  git -C "$target" fetch origin "$locked_commit"
  git -C "$target" diff --binary "$locked_commit" "$latest_commit" --output="$target/upstream-changes.patch"
  git -C "$target" log --oneline "$locked_commit..$latest_commit" > "$target/upstream-commits.txt"
  if [[ "$name" == "backend" ]]; then
    "$script_dir/enforce-theme-boundary.sh" --backend-root "$target" --prune
  fi
  echo "Prepared isolated review source: $target"
done

$prepare || echo "Use --prepare to clone changed upstreams into .upstream-review."
