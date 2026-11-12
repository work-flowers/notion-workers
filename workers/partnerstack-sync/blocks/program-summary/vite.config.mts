import { notionCustomBlock } from "@notionhq/custom-blocks/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// `.mts` because this block lives in a CommonJS sync worker; a plain
// `vite.config.ts` would be `require`d and fail on the ESM-only plugin.
// `root` is pinned because npm workspaces run vite from the package root.
// Both are explained in docs/custom-blocks.md.
export default defineConfig({
	root: import.meta.dirname,
	plugins: [react(), notionCustomBlock()],
})
