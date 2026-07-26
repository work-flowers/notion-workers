/**
 * Notion-flavored Markdown fix-ups for GitHub READMEs.
 *
 * Empirically tested against Notion's server-side converter on 2026-07-26
 * (see docs/zapier-durables-docs-worker.md). Almost everything passes through
 * correctly and needs no help:
 *
 * - Mermaid fences are verbatim — `<br/>` and `<br>` both survive untouched.
 * - GitHub pipe tables convert to real Notion tables.
 * - Code spans, bold, and links inside table cells become real annotations.
 *
 * The one thing that genuinely breaks is an escaped pipe inside a table cell:
 * `\|` splits the cell and silently drops the rest of it, shifting every later
 * column in that row. Every README in work-flowers/zapier-sdk that has a table
 * contains exactly one, so this is not a theoretical concern.
 *
 * The fix is to re-emit *only the affected tables* in Notion's native
 * `<table><tr><td>` form, where a literal `|` needs no escaping and survives as
 * a real pipe. Two rejected alternatives, both tested:
 *
 * - `&#124;` — Notion does not decode HTML entities (`&amp;` round-trips
 *   unchanged), so the reader would literally see "&#124;".
 * - A lookalike glyph (U+2502, U+FF5C) — survives, but silently swaps the
 *   character the README author wrote.
 *
 * Clean pipe tables are deliberately left as pipe tables: they already convert
 * correctly, and rewriting them would be risk for no gain.
 */

/** A line that is part of a GitHub pipe table: starts (after indent) with `|`. */
function isTableLine(line: string): boolean {
	return /^[ \t]*\|/.test(line);
}

/** The `|---|:--:|` separator under a pipe table's header row. */
function isDelimiterRow(line: string): boolean {
	return /^[ \t]*\|[\s|:-]*\|[ \s|:-]*$/.test(line) && line.includes("-");
}

/**
 * Split a pipe-table row into cells on unescaped pipes, then unescape.
 *
 * The leading and trailing pipes that delimit the row produce empty leading and
 * trailing fields, which are dropped — a genuinely empty first or last cell is
 * written `| |` and survives as a whitespace field.
 */
function splitRow(line: string): string[] {
	const trimmed = line.trim();
	const cells: string[] = [];
	let current = "";

	for (let i = 0; i < trimmed.length; i++) {
		const char = trimmed[i];
		if (char === "\\" && trimmed[i + 1] === "|") {
			current += "|"; // unescape: the XML form needs no escape
			i++;
		} else if (char === "|") {
			cells.push(current);
			current = "";
		} else {
			current += char;
		}
	}
	cells.push(current);

	if (cells.length && cells[0].trim() === "") cells.shift();
	if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
	return cells.map((cell) => cell.trim());
}

/**
 * `<` and `&` would be read as markup inside a `<td>`. Notion does not decode
 * entities, so anything escaped here would be *shown* escaped — only escape
 * when the character would otherwise change the parse.
 */
function escapeCell(cell: string): string {
	return cell.replace(/</g, "&lt;");
}

/** Re-emit a captured pipe table as Notion's native table XML. */
function toTableXml(rows: string[][]): string {
	const width = Math.max(...rows.map((row) => row.length));
	const body = rows
		.map((row) => {
			const cells = Array.from({ length: width }, (_, i) => escapeCell(row[i] ?? ""));
			return ["<tr>", ...cells.map((cell) => `<td>${cell}</td>`), "</tr>"].join("\n");
		})
		.join("\n");
	return `<table header-row="true">\n${body}\n</table>`;
}

/**
 * Rewrite any pipe table containing an escaped pipe into table XML.
 * Everything else in the segment is passed through byte-for-byte.
 */
function fixTables(text: string): string {
	const lines = text.split("\n");
	const out: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		if (!isTableLine(lines[i])) {
			out.push(lines[i]);
			continue;
		}

		// Capture the full run of table lines.
		let end = i;
		while (end + 1 < lines.length && isTableLine(lines[end + 1])) end++;
		const block = lines.slice(i, end + 1);

		// Only a real pipe table (header + delimiter) that actually contains an
		// escaped pipe needs rewriting.
		const isTable = block.length >= 2 && isDelimiterRow(block[1]);
		if (!isTable || !block.some((line) => line.includes("\\|"))) {
			out.push(...block);
		} else {
			const rows = block.filter((line) => !isDelimiterRow(line)).map(splitRow);
			out.push(toTableXml(rows));
		}
		i = end;
	}

	return out.join("\n");
}

/**
 * Split markdown into fenced-code and non-code segments.
 *
 * Fences are verbatim to Notion, so no fix-up may touch their contents —
 * rewriting a table-looking line inside a code sample would corrupt the sample.
 */
function splitOnFences(markdown: string): Array<{ code: boolean; text: string }> {
	const segments: Array<{ code: boolean; text: string }> = [];
	// Opening fence through its matching closing fence (or end of input).
	const fence = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[^\n]*$|$(?![\s\S]))/gm;
	let last = 0;
	for (const match of markdown.matchAll(fence)) {
		const start = match.index;
		if (start > last) segments.push({ code: false, text: markdown.slice(last, start) });
		segments.push({ code: true, text: match[0] });
		last = start + match[0].length;
	}
	if (last < markdown.length) segments.push({ code: false, text: markdown.slice(last) });
	return segments;
}

/**
 * Prepare a GitHub README for `pageContentMarkdown`.
 *
 * Deliberately minimal: the tested behaviour says everything else already
 * round-trips, and each extra transform is a chance to corrupt a document that
 * would otherwise have been fine.
 */
export function toNotionMarkdown(markdown: string): string {
	return splitOnFences(markdown)
		.map((segment) => (segment.code ? segment.text : fixBlockquotes(fixTables(segment.text))))
		.join("");
}

// -- Blockquotes ------------------------------------------------------------
//
// Notion turns **every `>` line into its own quote block**. Tested 2026-07-26:
//
// - A soft-wrapped quote paragraph shatters into one block per source line.
// - A bare `>` separator becomes a visible "Empty quote" block.
// - A fenced code block inside a quote is destroyed — the ``` collapses to a
//   single escaped backtick and the code becomes quoted prose.
// - A list continuation line loses its indent and splits off on its own.
//
// So a quote is rewritten to **one `>` line per logical paragraph or list
// item**, with separators dropped, and any fenced code lifted out of the quote
// to top level, where it survives intact. Lifting is a structural change, but
// the alternative is losing the code entirely.

/** A line inside a quote that begins a list item. */
function isListItem(line: string): boolean {
	return /^\s*(?:[-*+]\s|\d+[.)]\s)/.test(line);
}

type QuoteSegment = { kind: "quote"; lines: string[] } | { kind: "code"; lines: string[] };

/** Group a quote's inner lines into quote paragraphs and lifted code fences. */
function segmentQuote(inner: string[]): QuoteSegment[] {
	const segments: QuoteSegment[] = [];
	let paragraph: string[] = [];
	let fence: string[] | undefined;
	let fenceMarker = "";

	const flushParagraph = () => {
		if (paragraph.length) segments.push({ kind: "quote", lines: paragraph });
		paragraph = [];
	};

	for (const line of inner) {
		const fenceMatch = line.match(/^\s*(`{3,}|~{3,})(.*)$/);

		if (fence) {
			fence.push(line);
			if (fenceMatch && fenceMatch[1].startsWith(fenceMarker[0]) && !fenceMatch[2].trim()) {
				segments.push({ kind: "code", lines: fence });
				fence = undefined;
			}
			continue;
		}

		if (fenceMatch) {
			flushParagraph();
			fenceMarker = fenceMatch[1];
			fence = [line];
			continue;
		}

		if (!line.trim()) {
			// Bare `>` — a paragraph break, not content. Dropped so it does not
			// render as an "Empty quote" block.
			flushParagraph();
			continue;
		}

		// Continuation of the previous logical line, unless it starts a list
		// item or the paragraph is empty.
		if (paragraph.length && !isListItem(line)) {
			paragraph[paragraph.length - 1] = `${paragraph[paragraph.length - 1]} ${line.trim()}`;
		} else {
			paragraph.push(line.trim());
		}
	}

	// An unterminated fence keeps its content rather than dropping it.
	if (fence) segments.push({ kind: "code", lines: fence });
	flushParagraph();
	return segments;
}

/** Rewrite every blockquote so Notion renders it as intended. */
function fixBlockquotes(text: string): string {
	const lines = text.split("\n");
	const out: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		if (!/^\s*>/.test(lines[i])) {
			out.push(lines[i]);
			continue;
		}

		let end = i;
		while (end + 1 < lines.length && /^\s*>/.test(lines[end + 1])) end++;

		// Strip the marker and at most one following space.
		const inner = lines.slice(i, end + 1).map((l) => l.replace(/^\s*>\s?/, ""));
		const segments = segmentQuote(inner);

		segments.forEach((segment, index) => {
			if (index > 0) out.push("");
			if (segment.kind === "code") out.push(...segment.lines);
			else out.push(...segment.lines.map((l) => `> ${l}`));
		});

		i = end;
	}

	return out.join("\n");
}
