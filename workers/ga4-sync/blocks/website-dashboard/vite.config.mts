import { notionCustomBlock } from "@notionhq/custom-blocks/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * `.mts`, not `.ts`, and that matters here in a way it doesn't for
 * `newsletter-dashboard`.
 *
 * Vite loads its config through Node's own resolver, which decides CJS-vs-ESM
 * from the nearest `package.json`. This block lives inside a *sync* worker whose
 * package is CommonJS (no `"type": "module"`, `module: nodenext` in tsconfig),
 * so a plain `vite.config.ts` gets `require`d and dies with
 * "@notionhq/custom-blocks/vite … is ESM only". The `.mts` extension forces ESM
 * for this one file and leaves the worker's own module system alone — the
 * alternative, adding `"type": "module"` to the worker, would change what `tsc`
 * emits for the sync that Notion actually runs.
 *
 * Vite discovers `vite.config.mts` natively, so the deploy sandbox's bare
 * `npx vite build` finds it without any extra flag.
 */
export default defineConfig({
	// Pinned rather than inherited from the working directory: inside an npm
	// workspace `npx` runs from the *package* root (workers/ga4-sync), so a
	// cwd-relative root looks for index.html one level too high and fails with
	// UNRESOLVED_ENTRY. Notion's deploy sandbox builds from this directory,
	// where the two agree anyway. See docs/custom-blocks.md.
	root: import.meta.dirname,
	plugins: [react(), notionCustomBlock()],
})
