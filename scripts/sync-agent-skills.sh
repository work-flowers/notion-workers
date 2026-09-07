#!/usr/bin/env bash
#
# Refresh Notion's vendored agent skills (`.agents/`) in every worker.
#
# `ntn workers new` downloads these from makenotion/notion-cookbook at scaffold
# time rather than shipping them inside the CLI binary, so there is no `ntn`
# command that refreshes them in place. This pulls that same directory directly.
#
# The vendored copy tracks the cookbook's default worker template, which moves
# independently of the `ntn` release. The ref we last took is recorded in
# .agents/UPSTREAM_REF so a refresh is a reviewable diff rather than a mystery.
#
# Usage: ./scripts/sync-agent-skills.sh [ref]      # branch, tag or commit SHA
#
set -euo pipefail

REF="${1:-main}"
REPO="makenotion/notion-cookbook"
UPSTREAM="workers/templates/workers-default/.agents"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
[[ -d workers && -d packages/shared ]] || {
  echo "error: not the notion-workers root ($root)" >&2
  exit 1
}

# Resolve the ref to an immutable SHA before downloading, so the stamp we record
# names the exact tree we vendored even when REF is a moving branch.
sha="$(curl -fsSL "https://api.github.com/repos/$REPO/commits/$REF" \
  | sed -n 's/^  "sha": "\([0-9a-f]*\)".*/\1/p' | head -1)"
[[ -n "$sha" ]] || { echo "error: could not resolve $REPO@$REF" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Extract the whole archive (~3MB) rather than passing a wildcard path to tar:
# pattern handling differs between BSD tar (macOS) and GNU tar (CI runners), and
# this script has to behave identically in both.
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$sha" \
  | tar xz -C "$tmp" --strip-components=1

src="$tmp/$UPSTREAM"
[[ -f "$src/INSTRUCTIONS.md" && -d "$src/skills" ]] || {
  echo "error: upstream layout changed — no INSTRUCTIONS.md or skills/ at $UPSTREAM" >&2
  exit 1
}
echo "$REPO@$sha:$UPSTREAM" > "$src/UPSTREAM_REF"

# Only `.agents/` is vendored. The upstream template also carries a package.json,
# src/ and .examples/, none of which belong in an existing worker — in particular
# its package.json would clobber the worker's own name and dependencies.
#
# The repo root gets a copy too: skill discovery is per-directory, so without it
# a session started at the root sees none of this. It deliberately gets no
# AGENTS.md — the root's own CLAUDE.md is the project's instructions, and
# pointing AGENTS.md at Notion's INSTRUCTIONS.md would shadow them for the
# agents that read it.
for dest in . workers/*/; do
  rsync -a --delete "$src/" "$dest/.agents/"
  mkdir -p "$dest/.claude"
  ln -sfn ../.agents/skills "$dest/.claude/skills"
  [[ "$dest" == "." ]] || ln -sfn .agents/INSTRUCTIONS.md "$dest/AGENTS.md"
done

echo "Vendored $REPO@${sha:0:10} into $(ls -d workers/*/ | wc -l | tr -d ' ') workers + repo root"
