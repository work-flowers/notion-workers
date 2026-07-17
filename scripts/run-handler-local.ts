import { Client } from "@notionhq/client";
import { createZapierSdk } from "@zapier/zapier-sdk";
import { handlePageCreated } from "../src/handler.js";

const pageId = process.argv[2];
if (!pageId) {
	console.error("Usage: tsx scripts/run-handler-local.ts <pageId>");
	process.exit(1);
}

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
const zapier = createZapierSdk({
	credentials: {
		clientId: process.env.ZAPIER_CLIENT_ID!,
		clientSecret: process.env.ZAPIER_CLIENT_SECRET!,
	},
});

await handlePageCreated({ pageId }, { notion, zapier });
console.log("Done.");
