/**
 * Fictional fixture for `?mock` and the tests, shaped like the real data:
 * one program paid as a monthly lump sum, one paid per referral with $0
 * "submitted" events, a declined pair, rewards awaiting payment, and a payout
 * that combines two programs. Every amount, date and id is made up. This repo
 * is public, so never replace it with a real snapshot.
 * Imported dynamically, so it is code-split out of the bundle Notion serves.
 */
import type { PayoutRow, ProgramRow, RewardRow } from "./aggregate.ts"

export const MOCK_PROGRAMS: ProgramRow[] = [
	{
		"id": "prog_setup",
		"name": "Notion Setup Sessions"
	},
	{
		"id": "prog_affiliate",
		"name": "Notion"
	},
	{
		"id": "prog_consultants",
		"name": "Notion Consultants"
	},
	{
		"id": "prog_xero",
		"name": "Xero"
	}
]

export const MOCK_REWARDS: RewardRow[] = [
	{
		"id": "rwd_01",
		"name": "Setup Sessions payout (July 2026)",
		"programIds": [
			"prog_setup"
		],
		"payoutIds": [
			"po_2"
		],
		"amount": 500,
		"status": "paid",
		"paymentDate": "2026-08-10",
		"created": "2026-08-10"
	},
	{
		"id": "rwd_02",
		"name": "Setup Sessions payout (August 2026)",
		"programIds": [
			"prog_setup"
		],
		"payoutIds": [
			"po_3"
		],
		"amount": 1200,
		"status": "paid",
		"paymentDate": "2026-09-14",
		"created": "2026-09-14"
	},
	{
		"id": "rwd_03",
		"name": "Setup Sessions payout (September 2026)",
		"programIds": [
			"prog_setup"
		],
		"payoutIds": [
			"po_4"
		],
		"amount": 650,
		"status": "paid",
		"paymentDate": "2026-10-09",
		"created": "2026-10-09"
	},
	{
		"id": "rwd_04",
		"name": "Referral's startup trial application approved",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [
			"po_1"
		],
		"amount": 25,
		"status": "paid",
		"paymentDate": "2026-06-12",
		"created": "2026-05-02"
	},
	{
		"id": "rwd_05",
		"name": "Referral's startup trial application approved",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [
			"po_1"
		],
		"amount": 25,
		"status": "paid",
		"paymentDate": "2026-06-12",
		"created": "2026-05-20"
	},
	{
		"id": "rwd_06",
		"name": "Referral submitted a startup trial application",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [
			"po_1"
		],
		"amount": 0,
		"status": "paid",
		"paymentDate": "2026-06-12",
		"created": "2026-04-11"
	},
	{
		"id": "rwd_07",
		"name": "Referral submitted a startup trial application",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [
			"po_1"
		],
		"amount": 0,
		"status": "paid",
		"paymentDate": "2026-06-12",
		"created": "2026-04-25"
	},
	{
		"id": "rwd_08",
		"name": "Referral submitted a startup trial application",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [
			"po_2"
		],
		"amount": 0,
		"status": "paid",
		"paymentDate": "2026-07-14",
		"created": "2026-06-20"
	},
	{
		"id": "rwd_09",
		"name": "Referral's startup trial application approved",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [
			"po_3"
		],
		"amount": 25,
		"status": "paid",
		"paymentDate": "2026-09-14",
		"created": "2026-08-03"
	},
	{
		"id": "rwd_10",
		"name": "Referral's startup trial application approved",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [
			"po_3"
		],
		"amount": 25,
		"status": "paid",
		"paymentDate": "2026-09-14",
		"created": "2026-08-19"
	},
	{
		"id": "rwd_11",
		"name": "Referral submitted a startup trial application",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [
			"po_3"
		],
		"amount": 0,
		"status": "paid",
		"paymentDate": "2026-09-14",
		"created": "2026-07-30"
	},
	{
		"id": "rwd_12",
		"name": "Referral's startup trial application approved",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [
			"po_5"
		],
		"amount": 25,
		"status": "paid",
		"paymentDate": "2026-10-15",
		"created": "2026-09-05"
	},
	{
		"id": "rwd_13",
		"name": "Referral's startup trial application approved",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [],
		"amount": 25,
		"status": "approved",
		"paymentDate": "2026-11-13",
		"created": "2026-10-08"
	},
	{
		"id": "rwd_14",
		"name": "Referral's startup trial application approved",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [],
		"amount": 25,
		"status": "approved",
		"paymentDate": "2026-11-13",
		"created": "2026-10-22"
	},
	{
		"id": "rwd_15",
		"name": "Referral's startup trial application approved",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [],
		"amount": 25,
		"status": "approved",
		"paymentDate": "2026-11-13",
		"created": "2026-10-26"
	},
	{
		"id": "rwd_16",
		"name": "Referral submitted a startup trial application",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [],
		"amount": 0,
		"status": "approved",
		"paymentDate": "2026-11-13",
		"created": "2026-10-08"
	},
	{
		"id": "rwd_17",
		"name": "Referral's startup trial application approved",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [],
		"amount": 25,
		"status": "pending",
		"paymentDate": "2026-12-14",
		"created": "2026-11-03"
	},
	{
		"id": "rwd_18",
		"name": "Referral's startup trial application approved",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [],
		"amount": 25,
		"status": "pending",
		"paymentDate": "2026-12-14",
		"created": "2026-11-07"
	},
	{
		"id": "rwd_19",
		"name": "Referral submitted a startup trial application",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [],
		"amount": 0,
		"status": "pending",
		"paymentDate": "2026-12-14",
		"created": "2026-11-05"
	},
	{
		"id": "rwd_20",
		"name": "Referral's startup trial application approved",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [],
		"amount": 25,
		"status": "declined",
		"paymentDate": null,
		"created": "2026-08-15"
	},
	{
		"id": "rwd_21",
		"name": "Referral's startup trial application approved",
		"programIds": [
			"prog_affiliate"
		],
		"payoutIds": [],
		"amount": 25,
		"status": "declined",
		"paymentDate": null,
		"created": "2026-08-17"
	}
]

export const MOCK_PAYOUTS: PayoutRow[] = [
	{
		"id": "po_1",
		"name": "Payout 2026-06-20 \u00b7 $49.00",
		"amount": 49,
		"status": "successful",
		"fee": 1,
		"date": "2026-06-20"
	},
	{
		"id": "po_2",
		"name": "Payout 2026-08-12 \u00b7 $499.00",
		"amount": 499,
		"status": "successful",
		"fee": 1,
		"date": "2026-08-12"
	},
	{
		"id": "po_3",
		"name": "Payout 2026-09-16 \u00b7 $1247.50",
		"amount": 1247.5,
		"status": "successful",
		"fee": 2.5,
		"date": "2026-09-16"
	},
	{
		"id": "po_4",
		"name": "Payout 2026-10-11 \u00b7 $649.00",
		"amount": 649,
		"status": "successful",
		"fee": 1,
		"date": "2026-10-11"
	},
	{
		"id": "po_5",
		"name": "Payout 2026-10-16 \u00b7 $24.00",
		"amount": 24,
		"status": "new",
		"fee": 1,
		"date": "2026-10-16"
	}
]
