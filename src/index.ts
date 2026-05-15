import { Worker } from "@notionhq/workers";
import * as Schema from "@notionhq/workers/schema";
import * as Builder from "@notionhq/workers/builder";

const worker = new Worker();
export default worker;

const CURRENCIES = ["USD", "SGD", "JPY", "AUD"] as const;
type Currency = (typeof CURRENCIES)[number];

const fxRates = worker.database("fxRates", {
	type: "managed",
	initialTitle: "FX Rates",
	primaryKeyProperty: "Currency",
	schema: {
		properties: {
			Currency: Schema.title(),
			"Rate to USD": Schema.number("number"),
			"Rate to SGD": Schema.number("number"),
			"Rate Date": Schema.date(),
			"Last Synced": Schema.date(),
		},
	},
});

worker.sync("fxRatesSync", {
	database: fxRates,
	mode: "replace",
	schedule: "1d",
	execute: async () => {
		const targets = CURRENCIES.filter((c) => c !== "USD").join(",");
		const res = await fetch(
			`https://api.frankfurter.app/latest?from=USD&to=${targets}`,
		);
		if (!res.ok) {
			throw new Error(`Frankfurter request failed: ${res.status}`);
		}
		const { date, rates } = (await res.json()) as {
			date: string;
			rates: Record<string, number>;
		};

		const usdRates: Record<Currency, number> = {
			USD: 1,
			SGD: rates.SGD,
			JPY: rates.JPY,
			AUD: rates.AUD,
		};
		const now = new Date().toISOString();

		return {
			changes: CURRENCIES.map((c) => ({
				type: "upsert" as const,
				key: c,
				properties: {
					Currency: Builder.title(c),
					"Rate to USD": Builder.number(1 / usdRates[c]),
					"Rate to SGD": Builder.number(usdRates.SGD / usdRates[c]),
					"Rate Date": Builder.date(date),
					"Last Synced": Builder.dateTime(now),
				},
			})),
			hasMore: false,
		};
	},
});
