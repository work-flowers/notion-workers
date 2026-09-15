import { notionCustomBlock } from "@notionhq/custom-blocks/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
	// Pinned rather than inherited from the working directory: inside an npm
	// workspace `npx` runs from the *package* root (workers/crm-deal-desk), so a
	// cwd-relative root looks for index.html one level too high and fails with
	// UNRESOLVED_ENTRY. Notion's deploy sandbox builds from this directory,
	// where the two agree anyway. See docs/custom-blocks.md.
	root: import.meta.dirname,
	plugins: [react(), notionCustomBlock()],
})
