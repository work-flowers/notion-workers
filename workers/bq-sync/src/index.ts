import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import { createZapierSdk } from "@zapier/zapier-sdk";
import { EFFECTIVE_RATE_QUERY } from "./query.js";

const worker = new Worker();
export default worker;

const BIGQUERY_PROJECT_ID = "workflowers-analytics";
const BIGQUERY_LOCATION = "asia-southeast1";

interface ReportRow {
	company_name: string;
	revenue_sgd: string;
	invoice_count: string;
	total_hours: string;
	billable_hours: string;
	effective_hourly_rate_sgd: string;
}

const effectiveRates = worker.database("effectiveRates", {
	type: "managed",
	initialTitle: "Effective Hourly Rate by Client (YTD)",
	primaryKeyProperty: "Client",
	schema: {
		properties: {
			Client: Schema.title(),
			"Revenue (SGD)": Schema.number("dollar"),
			Invoices: Schema.number(),
			"Total Hours": Schema.number("number_with_commas"),
			"Billable Hours": Schema.number("number_with_commas"),
			"Effective Rate (SGD/hr)": Schema.number("dollar"),
			"Last Synced": Schema.date(),
		},
	},
});

worker.sync("effectiveRatesSync", {
	database: effectiveRates,
	mode: "replace",
	schedule: "manual",
	execute: async () => {
		const rows = await runReportQuery();
		const syncedAt = new Date().toISOString();

		return {
			changes: rows.map((row) => ({
				type: "upsert" as const,
				key: row.company_name,
				properties: {
					Client: Builder.title(row.company_name),
					"Revenue (SGD)": Builder.number(Number(row.revenue_sgd)),
					Invoices: Builder.number(Number(row.invoice_count)),
					"Total Hours": Builder.number(Number(row.total_hours)),
					"Billable Hours": Builder.number(Number(row.billable_hours)),
					"Effective Rate (SGD/hr)": Builder.number(
						Number(row.effective_hourly_rate_sgd),
					),
					"Last Synced": Builder.dateTime(syncedAt),
				},
			})),
			hasMore: false,
		};
	},
});

async function runReportQuery(): Promise<ReportRow[]> {
	const clientId = process.env.ZAPIER_CLIENT_ID;
	const clientSecret = process.env.ZAPIER_CLIENT_SECRET;
	const connection = process.env.ZAPIER_BIGQUERY_CONNECTION_ID;
	if (!clientId || !clientSecret || !connection) {
		throw new Error(
			"Missing ZAPIER_CLIENT_ID, ZAPIER_CLIENT_SECRET, or ZAPIER_BIGQUERY_CONNECTION_ID",
		);
	}

	const zapier = createZapierSdk({
		credentials: { clientId, clientSecret },
	});

	const { data } = await zapier.runAction({
		app: "google-bigquery",
		actionType: "write",
		action: "query",
		connection,
		inputs: {
			project_id: BIGQUERY_PROJECT_ID,
			location: BIGQUERY_LOCATION,
			sql_query: EFFECTIVE_RATE_QUERY,
		},
	});

	const result = (data as Array<{ jobComplete: boolean; rows?: ReportRow[] }>)[0];
	if (!result?.jobComplete) {
		throw new Error("BigQuery job did not complete");
	}
	return result.rows ?? [];
}
