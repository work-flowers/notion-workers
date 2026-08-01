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
		.map((segment) =>
			segment.code ? segment.text : joinSoftWraps(fixBlockquotes(fixTables(segment.text))),
		)
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
// So a whole quote is collapsed onto **one `>` line**, with its internal
// structure carried by `<br>`: single break between logical lines, double
// between paragraphs. That yields one quote block instead of a stack of them.
//
// `<br>` is a genuine line break, not literal text. Confirmed by the escaping
// tell: the serializer round-trips literal markup escaped (`\<br\>`,
// `&lt;br&gt;`) and parsed markup bare, and a bare `<br>` survives bare. Two
// rejected alternatives, both tested: two trailing spaces collapse back to
// separate lines, and a backslash line break is escaped to literal text.
//
// Fenced code is lifted out of the quote to top level, where it survives
// intact. That is a structural change, but Notion cannot nest a code block in
// a quote and destroys it otherwise.

/** A line inside a quote that begins a list item. */
function isListItem(line: string): boolean {
	return /^\s*(?:[-*+]\s|\d+[.)]\s)/.test(line);
}

type QuoteSegment =
	/** Paragraphs of logical lines; joined onto a single `>` line when emitted. */
	| { kind: "quote"; paragraphs: string[][] }
	| { kind: "code"; lines: string[] };

/** Group a quote's inner lines into quote runs and lifted code fences. */
function segmentQuote(inner: string[]): QuoteSegment[] {
	const segments: QuoteSegment[] = [];
	let paragraphs: string[][] = [];
	let paragraph: string[] = [];
	let fence: string[] | undefined;
	let fenceMarker = "";

	const endParagraph = () => {
		if (paragraph.length) paragraphs.push(paragraph);
		paragraph = [];
	};
	const flushParagraph = () => {
		endParagraph();
		if (paragraphs.length) segments.push({ kind: "quote", paragraphs });
		paragraphs = [];
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
			// Bare `>` — a paragraph break, not content. Becomes a double <br>
			// rather than an "Empty quote" block.
			endParagraph();
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
			if (segment.kind === "code") {
				out.push(...segment.lines);
			} else {
				// One quote block: <br> between lines, <br><br> between paragraphs.
				out.push(`> ${segment.paragraphs.map((p) => p.join("<br>")).join("<br><br>")}`);
			}
		});

		i = end;
	}

	return out.join("\n");
}

// -- Soft line wraps --------------------------------------------------------
//
// Notion makes **one block per source line** outside code fences, so a
// hard-wrapped README paragraph arrives as a stack of one-line paragraphs and
// the blank line between two paragraphs is lost entirely. Tested 2026-07-26.
//
// Standard Markdown says a single newline inside a paragraph is a soft wrap, so
// the fix is to reflow: join a paragraph's source lines back into one line, and
// join a list item's continuation lines onto the item.
//
// Structural lines are never joined — headings, rules, quotes (already
// collapsed by fixBlockquotes), table markup, and raw HTML each stay on their
// own line, and an indented block that follows a blank line is treated as
// indented code rather than a continuation.

/**
 * An HTML block tag opening a line — `<table …>`, `<tr>`, `</td>`, `<!-- … -->`.
 *
 * Deliberately *not* a Markdown autolink (`<https://…>`, `<mailto:…>`): the tag
 * name may not contain a colon, so a URI scheme fails to match. Treating an
 * autolink as structural strands it on its own line and splits the paragraph
 * around it into three blocks — `workers/harvest-sync/README.md` has one
 * mid-paragraph, which is how this was found.
 */
function isHtmlBlockLine(line: string): boolean {
	return /^<!--/.test(line) || /^<\/?[a-zA-Z][a-zA-Z0-9-]*(?:[\s/>]|$)/.test(line);
}

/** A line that must keep its own line and terminates any paragraph in progress. */
function isStructuralLine(line: string): boolean {
	const t = line.trim();
	return (
		/^#{1,6}\s/.test(t) || // heading
		/^(?:[-*_]\s*){3,}$/.test(t) || // horizontal rule
		t.startsWith(">") || // quote (already one line each)
		t.startsWith("|") || // pipe table row
		isHtmlBlockLine(t) // table XML or raw HTML, but not an autolink
	);
}

/**
 * Reflow soft-wrapped paragraphs and list continuations onto single lines.
 *
 * Tracks fences itself rather than relying on `splitOnFences`, because
 * `fixBlockquotes` lifts fences *out* of quotes after that split has already
 * run — those lines are code and must not be reflowed.
 */
function joinSoftWraps(text: string): string {
	const out: string[] = [];
	// Whether the last emitted line can absorb a continuation.
	let openLine = false;
	let fenceMarker: string | undefined;

	for (const line of text.split("\n")) {
		const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
		if (fenceMarker) {
			out.push(line);
			if (fenceMatch && fenceMatch[1][0] === fenceMarker[0]) fenceMarker = undefined;
			continue;
		}
		if (fenceMatch) {
			out.push(line);
			fenceMarker = fenceMatch[1];
			openLine = false;
			continue;
		}

		if (!line.trim()) {
			out.push(line);
			openLine = false;
			continue;
		}

		if (isStructuralLine(line)) {
			out.push(line);
			openLine = false;
			continue;
		}

		// An indented line that does not continue anything is indented code.
		const indented = /^(?: {4,}|\t)/.test(line);
		if (indented && !openLine) {
			out.push(line);
			continue;
		}

		if (isListItem(line)) {
			out.push(line);
			openLine = true;
			continue;
		}

		if (openLine) {
			out[out.length - 1] = `${out[out.length - 1]} ${line.trim()}`;
		} else {
			out.push(line);
			openLine = true;
		}
	}

	return out.join("\n");
}
