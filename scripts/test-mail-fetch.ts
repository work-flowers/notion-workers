import { createZapierSdk } from "@zapier/zapier-sdk";
import { parseMailMetadata } from "../src/mailBlock.js";

const CONNECTION_ID =
	process.env.MCP_CLIENT_CONNECTION_ID ?? "025ea818-da55-8691-b4d0-5647c50a0e59";
const PAGE_ID = process.argv[2] ?? "39f91b07-11ac-81f9-998e-c44c21cf7f21";

const zapier = createZapierSdk({
	credentials: {
		clientId: process.env.ZAPIER_CLIENT_ID!,
		clientSecret: process.env.ZAPIER_CLIENT_SECRET!,
	},
});

const { data } = await zapier.runAction({
	appKey: "App222157CLIAPI",
	actionType: "write",
	actionKey: "call_tool_as_create",
	connectionId: CONNECTION_ID,
	inputs: {
		_tool_name: "notion-fetch",
		_tool_error: true,
		_tool_parse: true,
		id: PAGE_ID,
		include_transcript: false,
		include_discussions: false,
	},
} as any);

console.log("=== result shape (keys / types, truncated) ===");
function shape(v: unknown, depth = 0): unknown {
	if (depth > 3) return "...";
	if (typeof v === "string")
		return `string(${v.length})${v.includes("<mail>") ? " [HAS <mail>]" : ""}`;
	if (Array.isArray(v)) return v.slice(0, 3).map((x) => shape(x, depth + 1));
	if (v && typeof v === "object")
		return Object.fromEntries(
			Object.entries(v).slice(0, 12).map(([k, x]) => [k, shape(x, depth + 1)]),
		);
	return v;
}
console.log(JSON.stringify(shape(data), null, 2));

// Reuse the worker's own extraction + parsing
const mod = await import("../src/mailBlock.js");
const findPageText = (mod as any).findPageText;

// findPageText isn't exported; re-implement the search inline for the test
function search(value: unknown, depth = 0): string | null {
	if (depth > 6 || value == null) return null;
	if (typeof value === "string") {
		if (value.includes("<mail>") || value.includes("<page ")) {
			try {
				const parsed = JSON.parse(value);
				return search(parsed, depth + 1) ?? value;
			} catch {
				return value;
			}
		}
		return null;
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = search(item, depth + 1);
			if (found) return found;
		}
		return null;
	}
	if (typeof value === "object") {
		for (const item of Object.values(value)) {
			const found = search(item, depth + 1);
			if (found) return found;
		}
	}
	return null;
}

const text = search(data);
console.log("\n=== page text found:", Boolean(text), "===");
if (text) {
	const meta = parseMailMetadata(text);
	console.log(JSON.stringify(meta, null, 2));
}
