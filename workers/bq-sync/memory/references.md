# References

## Browser automation: Safari MCP connector vs Claude in Chrome extension

Comparison of the two browser tools available in Dennis's Cowork setup (as of 2026-07-03). Note: this is cross-project info, parked here because this was the mounted folder at the time.

**Overlap**: navigation, tab management, JS execution, console logs, network inspection, screenshots, viewport resizing.

| Capability | Safari MCP (`safari-mcp-stp`) | Claude in Chrome |
|---|---|---|
| Interaction model | Semantic DOM: batched `page_interactions` by node UID or find-in-page text; returns diff of page changes | Visual: `computer` tool, coordinate-based clicks/drags/hover/zoom driven by screenshots; refs from `read_page`/`find` |
| Page reading | `get_page_content` — WebKit text extraction, formats (markdown/textTree/JSON/HTML), whole-page region, tunable filters, node UIDs | `get_page_text` (plain text, article-focused) or `read_page` (accessibility tree, 50k char cap) |
| Element finding | UID-based or text search | Natural-language `find` — no Safari equivalent |
| JS execution | `$uid(N)` element macros, iframe targeting | REPL semantics, top-level `await`; no iframe targeting |
| Network debugging | Richer: full per-request detail (headers, body, timing), filter by status/method/URL/time | Summaries only, URL substring filter |
| JS dialogs (alert/confirm/prompt) | Yes (`browser_dialogs`) | No |
| Media emulation (print CSS) | Yes | No |
| File uploads | No | Yes (`file_upload`, `upload_image` incl. drag-drop) |
| Form filling | Via type interactions | Dedicated `form_input` (checkboxes, selects) |
| GIF session recordings | No | Yes |
| Shortcuts/workflows | No | Yes |
| Multi-browser/device selection | No | Yes |
| Batching | Interactions only | Any tool sequence (`browser_batch`) |
| Screenshots | Saved to disk as PNG path; full-page option | Inline (directly visible to Claude); `zoom` regions; no full-page |

**Rule of thumb**: Safari is text-first and token-efficient — scraping, content extraction, API/network debugging, print/responsive testing. Chrome is vision-first — visually complex UIs, canvas apps, file uploads, drag-and-drop, anything requiring inline visual inspection. Chrome has per-domain permissions and tab-group isolation; Safari drives real tabs directly. Default to Safari for typical work (dashboards, pulling page data, webhook debugging); Chrome for interactive/visual/upload-heavy tasks.
