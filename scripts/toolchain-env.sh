#!/usr/bin/env bash

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
project_root="$(cd "$script_dir/.." && pwd -P)"
if [[ -x "$project_root/.tools/node/bin/node" ]]; then
  export PATH="$project_root/.tools/node/bin:$PATH"
fi
if [[ -x "$project_root/.tools/pnpm/bin/pnpm" ]]; then
  export PATH="$project_root/.tools/pnpm/bin:$PATH"
fi
if [[ -x "$project_root/.tools/go/bin/go" ]]; then
  export PATH="$project_root/.tools/go/bin:$PATH"
fi
