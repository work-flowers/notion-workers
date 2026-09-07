Upstream `makenotion/notion-cookbook` has changed the default worker template's
`.agents/` directory. This is the mechanical re-vendor, produced by
`./scripts/sync-agent-skills.sh`.

**Review the `.md` diffs, not the `.ts` ones.** The example files churn on style
(upstream's semicolon preference has flipped before); the guidance that actually
changes how agents build syncs lives in `INSTRUCTIONS.md` and `skills/*/SKILL.md`.

Check before merging:

- Does any new guidance describe SDK surface that the version our workers
  actually resolve at build time does not have?
- No `package.json` should appear in this diff. Only `.agents/` is vendored; the
  upstream template's own package.json would clobber each worker's name and
  dependencies.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
