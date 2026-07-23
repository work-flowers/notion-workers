import { Worker } from "@notionhq/workers";
import { createZapierSdk } from "@zapier/zapier-sdk";
import { handlePageCreated } from "./handler.js";

const worker = new Worker();
export default worker;

worker.webhook("onEmailCreated", {
	title: "Email created",
	description:
		"Populate a new Emails page with metadata parsed from its mail block, plus resolved Contacts and internal recipients.",
	execute: async (events, { notion }) => {
		const clientId = process.env.ZAPIER_CLIENT_ID;
		const clientSecret = process.env.ZAPIER_CLIENT_SECRET;
		if (!clientId || !clientSecret) {
			throw new Error(
				"ZAPIER_CLIENT_ID / ZAPIER_CLIENT_SECRET are not configured.",
			);
		}
		const zapier = createZapierSdk({
			credentials: { clientId, clientSecret },
		});

		for (const event of events) {
			try {
				await handlePageCreated(event.body, { notion, zapier });
			} catch (err) {
				console.error(
					`Failed to process delivery ${event.deliveryId}:`,
					(err as Error)?.stack ?? err,
				);
				throw err;
			}
		}
	},
});
