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

# Every worker in this repo belongs to the work.flowers workspace. The ntn CLI
# keeps a single global login with no per-repo binding, so a deploy silently
# targets whichever workspace was last authenticated. Client workspaces are
# worked on in the same sessions, and a worker has already been deployed into
# the wrong workspace this way. Refuse unless the active session matches.
WF_WORKSPACE_ID="9607e18f-5d82-4842-8b96-ca0d32e66011"
uuid_re='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

# Read the *resolved* workspace from `ntn doctor`, which accounts for the config
# default, workers.json and env overrides. Deliberately not `ntn whoami`: that
# hits /v1/users/me, which 403s for sessions whose token lacks user-read
# capability, so it reports nothing even when auth is fine. `ntn doctor` writes
# its report to stderr, hence 2>&1. The `|| true` guards matter: without them a
# no-match makes the pipeline non-zero and `set -e` aborts the script silently
# from inside the substitution, before any message below can print.
doctor_report="$(ntn doctor 2>&1 | sed $'s/\033\\[[0-9;]*m//g' || true)"
active_workspace="$(
	printf '%s\n' "$doctor_report" \
		| grep -i 'resolved workspace' \
		| grep -oE "$uuid_re" \
		| head -1 || true
)"
if [ -z "$active_workspace" ] && [ -f "$HOME/.config/notion/config.json" ]; then
	active_workspace="$(node -e "
	  const c = require('$HOME/.config/notion/config.json');
	  console.log(c.defaultWorkspaceIds?.prod ?? '');
	" 2>/dev/null || true)"
fi
if [ -z "$active_workspace" ]; then
	echo "Could not determine the active ntn workspace. Run 'ntn login' and retry." >&2
	echo "(Check 'ntn doctor' -- deploys must target work.flowers: $WF_WORKSPACE_ID)" >&2
	exit 1
fi
if [ "$active_workspace" != "$WF_WORKSPACE_ID" ]; then
	active_name="$(
		printf '%s\n' "$doctor_report" | grep -i 'resolved workspace' \
			| sed -E 's/.*✔[[:space:]]*//; s/[[:space:]]*\(.*//' | head -1 || true
	)"
	cat >&2 <<EOF
Refusing to deploy: the ntn CLI is logged into the wrong workspace.

  active:   ${active_name:-unknown} ($active_workspace)
  expected: work.flowers ($WF_WORKSPACE_ID)

Every worker in this repo must be deployed to work.flowers. Run
'ntn logout && ntn login' and pick it, then retry. Remember to switch back
before deploying from a client repo.
EOF
	exit 1
fi

# Guard against a workers.json created against a different workspace.
if [ -f "$worker/workers.json" ]; then
	configured="$(node -e "console.log(require('$worker/workers.json').workspaceId ?? '')" 2>/dev/null || true)"
	if [ -n "$configured" ] && [ "$configured" != "$WF_WORKSPACE_ID" ]; then
		echo "workers/$name/workers.json points at workspace $configured, not work.flowers." >&2
		echo "It was created against the wrong workspace -- delete it and redeploy with --name." >&2
		exit 1
	fi
fi

uses_shared=$(node -e "
  const p = require('$worker/package.json');
  console.log(p.dependencies?.['@work-flowers/notion-worker-shared'] ? 'yes' : 'no');
")

if [ "$uses_shared" = "no" ]; then
	cd "$worker"
	exec ntn workers deploy "$@"
fi

echo "Vendoring @work-flowers/notion-worker-shared for cloud build..."
rm -rf "$worker/vendor"
mkdir -p "$worker/vendor"
(cd "$root/packages/shared" && npm run build >/dev/null && npm pack --pack-destination "$worker/vendor" >/dev/null)
tgz="$(basename "$(ls "$worker/vendor"/*.tgz)")"

# Restore package.json from a byte-for-byte copy, never from git.
#
# This used to be `git checkout -- workers/$name/package.json`, which restores
# from the index and therefore discards *every* uncommitted change to the file,
# not just the one dependency line rewritten below. Deploying with work in
# progress silently reverted it — new dependencies, new scripts, all of it. The
# deploy itself still succeeded, because the upload happens before this trap
# fires, so the worker in Notion was fine and only the working tree was wrong.
# That is what made it hard to spot: nothing failed. Hit on 2026-08-01 and
# again on 2026-08-03, the second time eating a whole block's dependencies.
#
# A copy also round-trips the original formatting, which `npm pkg set` can
# otherwise normalise even when it isn't asked to.
backup="$(mktemp)"
cp "$worker/package.json" "$backup"

restore() {
	cp "$backup" "$worker/package.json"
	rm -f "$backup"
	rm -rf "$worker/vendor"
}
trap restore EXIT INT TERM

cd "$worker"
npm pkg set "dependencies.@work-flowers/notion-worker-shared=file:vendor/$tgz"
ntn workers deploy --no-git "$@"
