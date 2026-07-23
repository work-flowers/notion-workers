#!/usr/bin/env bash
# Deploy a worker from the monorepo: scripts/deploy.sh <worker-dir-name> [extra ntn args]
#
# The ntn cloud build uploads only the worker directory and runs `npm install`
# in a sandbox, so it can't resolve the unpublished workspace package
# @work-flowers/notion-worker-shared. For workers that depend on it, this
# script packs the shared package into a tarball inside the worker, points the
# dependency at that tarball for the duration of the deploy, and restores
# package.json afterwards. Workers without the shared dependency deploy as-is.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
name="${1:?usage: scripts/deploy.sh <worker-dir-name> [extra ntn args]}"
shift
worker="$root/workers/$name"
[ -d "$worker" ] || { echo "No such worker: workers/$name" >&2; exit 1; }

uses_shared=$(node -e "
  const p = require('$worker/package.json');
  console.log(p.dependencies?.['@work-flowers/notion-worker-shared'] ? 'yes' : 'no');
")

if [ "$uses_shared" = "no" ]; then
	cd "$worker"
	exec ntn workers deploy "$@"
fi

echo "Vendoring @work-flowers/notion-worker-shared for cloud build..."
rm -rf "$worker/.deploy"
mkdir -p "$worker/.deploy"
(cd "$root/packages/shared" && npm run build >/dev/null && npm pack --pack-destination "$worker/.deploy" >/dev/null)
tgz="$(basename "$(ls "$worker/.deploy"/*.tgz)")"

restore() { git -C "$root" checkout --quiet -- "workers/$name/package.json"; }
trap restore EXIT

cd "$worker"
npm pkg set "dependencies.@work-flowers/notion-worker-shared=file:.deploy/$tgz"
ntn workers deploy --no-git "$@"
