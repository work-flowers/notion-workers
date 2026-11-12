/**
 * Real PartnerStack snapshot (2026-11-12) for `?mock`, shaped as the block's rows.
 * Ids are PartnerStack keys rather than Notion page ids, which is fine because
 * the block only compares ids to each other. Customer keys are left out.
 * Imported dynamically, so it is code-split out of the bundle Notion serves.
 */
import type { PayoutRow, ProgramRow, RewardRow } from "./aggregate.ts"

export const MOCK_TODAY = "2026-11-12"

export const MOCK_PROGRAMS: ProgramRow[] = [
	{
		"id": "co_tZWC7exiHarpRd",
		"name": "Notion Consultants"
	},
	{
		"id": "co_nGPWJluChgP4Ty",
		"name": "Notion Setup Sessions"
	},
	{
		"id": "co_BwqdQNxHQ9VCGW",
		"name": "Xero"
	},
	{
		"id": "co_F3ykHPjXYLjrOd",
		"name": "Notion"
	}
]

export const MOCK_REWARDS: RewardRow[] = [
	{
		"id": "rwrd_R0HHVyuqOzZKUf",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 30.0,
		"status": "pending",
		"paymentDate": "2026-12-14",
		"created": "2026-11-07"
	},
	{
		"id": "rwrd_03PdjTbqXqSMEL",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 30.0,
		"status": "pending",
		"paymentDate": "2026-12-14",
		"created": "2026-11-07"
	},
	{
		"id": "rwrd_ddjVltp4jbwryz",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 0.0,
		"status": "pending",
		"paymentDate": "2026-12-14",
		"created": "2026-11-05"
	},
	{
		"id": "rwrd_MsOEZgW9fPg4KT",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 0.0,
		"status": "pending",
		"paymentDate": "2026-12-14",
		"created": "2026-11-05"
	},
	{
		"id": "rwrd_8Z70HVMOYPrlw7",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 30.0,
		"status": "approved",
		"paymentDate": "2026-11-13",
		"created": "2026-10-26"
	},
	{
		"id": "rwrd_pXWtjTtlKF6vE5",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 30.0,
		"status": "approved",
		"paymentDate": "2026-11-13",
		"created": "2026-10-24"
	},
	{
		"id": "rwrd_QUpUFyVLneXEXc",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 30.0,
		"status": "approved",
		"paymentDate": "2026-11-13",
		"created": "2026-10-24"
	},
	{
		"id": "rwrd_5IMYgY7XSmhMTf",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 30.0,
		"status": "approved",
		"paymentDate": "2026-11-13",
		"created": "2026-10-24"
	},
	{
		"id": "rwrd_z4hJY1immBmzeX",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 30.0,
		"status": "approved",
		"paymentDate": "2026-11-13",
		"created": "2026-10-23"
	},
	{
		"id": "rwrd_hTGlktbmqVaGU5",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 0.0,
		"status": "approved",
		"paymentDate": "2026-11-13",
		"created": "2026-10-20"
	},
	{
		"id": "rwrd_YnMb0QHaQBvntw",
		"name": "PartnerStack Payout: work.flowers (Sep 1 - 30 2026)",
		"programIds": [
			"co_nGPWJluChgP4Ty"
		],
		"payoutIds": [
			"pay_FiuOZqJIVw3hmI"
		],
		"amount": 830.0,
		"status": "paid",
		"paymentDate": "2026-10-09",
		"created": "2026-10-09"
	},
	{
		"id": "rwrd_1qvWeLXuJrFceO",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 0.0,
		"status": "approved",
		"paymentDate": "2026-11-13",
		"created": "2026-10-08"
	},
	{
		"id": "rwrd_1WQPqwXracb3wm",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 0.0,
		"status": "approved",
		"paymentDate": "2026-11-13",
		"created": "2026-10-08"
	},
	{
		"id": "rwrd_VNVVciQkwCL9xm",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_pgGc95EW0o4zcm"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-10-15",
		"created": "2026-09-26"
	},
	{
		"id": "rwrd_oZaMiKYsqzCHSI",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_pgGc95EW0o4zcm"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-10-15",
		"created": "2026-09-24"
	},
	{
		"id": "rwrd_wJlSImxLB5MyGq",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_pgGc95EW0o4zcm"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-10-15",
		"created": "2026-09-24"
	},
	{
		"id": "rwrd_5M1mIhOCUEWuos",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_pgGc95EW0o4zcm"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-10-15",
		"created": "2026-09-24"
	},
	{
		"id": "rwrd_yxjsf22Jd80CSr",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_pgGc95EW0o4zcm"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-10-15",
		"created": "2026-09-23"
	},
	{
		"id": "rwrd_8BKOPEMKZIR4Jl",
		"name": "PartnerStack Payout: work.flowers (Aug 1 - 31 2026)",
		"programIds": [
			"co_nGPWJluChgP4Ty"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 1750.0,
		"status": "paid",
		"paymentDate": "2026-09-14",
		"created": "2026-09-14"
	},
	{
		"id": "rwrd_tai4s9MHrELxSe",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_pgGc95EW0o4zcm"
		],
		"amount": 30.0,
		"status": "paid",
		"paymentDate": "2026-10-15",
		"created": "2026-09-04"
	},
	{
		"id": "rwrd_EzGrqGQOYsViiT",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 30.0,
		"status": "declined",
		"paymentDate": null,
		"created": "2026-08-22"
	},
	{
		"id": "rwrd_HWddM8aRafHUiC",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 30.0,
		"status": "declined",
		"paymentDate": null,
		"created": "2026-08-17"
	},
	{
		"id": "rwrd_0zCWsRd1BNAmXy",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 30.0,
		"status": "declined",
		"paymentDate": null,
		"created": "2026-08-17"
	},
	{
		"id": "rwrd_R6fgTlOcp6Tk6P",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 30.0,
		"status": "declined",
		"paymentDate": null,
		"created": "2026-08-17"
	},
	{
		"id": "rwrd_ZE1T4gXCaRoWzf",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [],
		"amount": 30.0,
		"status": "declined",
		"paymentDate": null,
		"created": "2026-08-15"
	},
	{
		"id": "rwrd_0jruyb05ZZdw5f",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 30.0,
		"status": "paid",
		"paymentDate": "2026-09-14",
		"created": "2026-08-15"
	},
	{
		"id": "rwrd_aEvzhr0sy7FxcB",
		"name": "PartnerStack Payout: Work.Flowers (July 2026)",
		"programIds": [
			"co_nGPWJluChgP4Ty"
		],
		"payoutIds": [
			"pay_e71guTHnM8nL5C"
		],
		"amount": 820.0,
		"status": "paid",
		"paymentDate": "2026-08-10",
		"created": "2026-08-10"
	},
	{
		"id": "rwrd_0rCN37rg0xRc7p",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 30.0,
		"status": "paid",
		"paymentDate": "2026-09-14",
		"created": "2026-08-07"
	},
	{
		"id": "rwrd_h5vH3kHrwfAoC3",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-09-14",
		"created": "2026-08-05"
	},
	{
		"id": "rwrd_6yDZciqTYM1eEE",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 30.0,
		"status": "paid",
		"paymentDate": "2026-09-14",
		"created": "2026-08-05"
	},
	{
		"id": "rwrd_ZQFv2aWQg5o43x",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-08-13",
		"created": "2026-07-25"
	},
	{
		"id": "rwrd_pyoSH5BEm60w3B",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 30.0,
		"status": "paid",
		"paymentDate": "2026-08-13",
		"created": "2026-07-24"
	},
	{
		"id": "rwrd_IPDtprYGhynh6D",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-08-13",
		"created": "2026-07-20"
	},
	{
		"id": "rwrd_OANTaj2lSln3Na",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-08-13",
		"created": "2026-07-20"
	},
	{
		"id": "rwrd_ArlhLivXK7qNa1",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-08-13",
		"created": "2026-07-20"
	},
	{
		"id": "rwrd_NDU84nr9GwbF9S",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-08-13",
		"created": "2026-07-18"
	},
	{
		"id": "rwrd_nq3ZwNGo2SF0lK",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-08-13",
		"created": "2026-07-18"
	},
	{
		"id": "rwrd_xUXsAFf6O6iMmm",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 30.0,
		"status": "paid",
		"paymentDate": "2026-08-13",
		"created": "2026-07-11"
	},
	{
		"id": "rwrd_f7kSU6q1rUvyMN",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-08-13",
		"created": "2026-07-10"
	},
	{
		"id": "rwrd_aVVXxZi7P2MHIp",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-08-13",
		"created": "2026-07-08"
	},
	{
		"id": "rwrd_O5ULi6jD6ZObG3",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 30.0,
		"status": "paid",
		"paymentDate": "2026-08-13",
		"created": "2026-07-08"
	},
	{
		"id": "rwrd_iITODXX7I7RaNj",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_cF0o4nPnvMlyzi"
		],
		"amount": 30.0,
		"status": "paid",
		"paymentDate": "2026-08-13",
		"created": "2026-07-03"
	},
	{
		"id": "rwrd_qaKIekjaXEvOj4",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_e71guTHnM8nL5C"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-07-14",
		"created": "2026-06-26"
	},
	{
		"id": "rwrd_H7VNOQ3WJRXRuM",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_e71guTHnM8nL5C"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-07-14",
		"created": "2026-06-13"
	},
	{
		"id": "rwrd_d0cin7M9l4DSrx",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_e71guTHnM8nL5C"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-07-14",
		"created": "2026-06-10"
	},
	{
		"id": "rwrd_vamuG6Bo2mVrPA",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_e71guTHnM8nL5C"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-07-14",
		"created": "2026-06-05"
	},
	{
		"id": "rwrd_9m45HeJhlynurQ",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_khGCJpV6VGUEAj"
		],
		"amount": 30.0,
		"status": "paid",
		"paymentDate": "2026-06-12",
		"created": "2026-05-22"
	},
	{
		"id": "rwrd_niR9Ywms0NyZM1",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_khGCJpV6VGUEAj"
		],
		"amount": 30.0,
		"status": "paid",
		"paymentDate": "2026-06-12",
		"created": "2026-05-16"
	},
	{
		"id": "rwrd_Bdyg9RkSNK20D7",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_khGCJpV6VGUEAj"
		],
		"amount": 30.0,
		"status": "paid",
		"paymentDate": "2026-06-12",
		"created": "2026-05-12"
	},
	{
		"id": "rwrd_392teVCt64Ig80",
		"name": "Earn $30 when your referral has had their Startup trial application approved [existing Notion workspace]",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_khGCJpV6VGUEAj"
		],
		"amount": 30.0,
		"status": "paid",
		"paymentDate": "2026-06-12",
		"created": "2026-05-01"
	},
	{
		"id": "rwrd_tuJLzqNVLoOuFw",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_khGCJpV6VGUEAj"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-05-14",
		"created": "2026-04-25"
	},
	{
		"id": "rwrd_6bbxoF8cL2jt2V",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_khGCJpV6VGUEAj"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-05-14",
		"created": "2026-04-18"
	},
	{
		"id": "rwrd_WE9n65Tphd1G2L",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_khGCJpV6VGUEAj"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-05-14",
		"created": "2026-04-14"
	},
	{
		"id": "rwrd_M9U2QMaNVOygIO",
		"name": "Referred Customer Has Submitted an Application for a Startup Trial",
		"programIds": [
			"co_F3ykHPjXYLjrOd"
		],
		"payoutIds": [
			"pay_khGCJpV6VGUEAj"
		],
		"amount": 0.0,
		"status": "paid",
		"paymentDate": "2026-05-14",
		"created": "2026-04-03"
	}
]

export const MOCK_PAYOUTS: PayoutRow[] = [
	{
		"id": "pay_pgGc95EW0o4zcm",
		"name": "Payout 2026-10-10 \u00b7 $29.00",
		"amount": 29.0,
		"status": "new",
		"fee": 1.0,
		"date": "2026-10-10"
	},
	{
		"id": "pay_FiuOZqJIVw3hmI",
		"name": "Payout 2026-09-16 \u00b7 $829.00",
		"amount": 829.0,
		"status": "successful",
		"fee": 1.0,
		"date": "2026-10-16"
	},
	{
		"id": "pay_cF0o4nPnvMlyzi",
		"name": "Payout 2026-08-11 \u00b7 $1956.50",
		"amount": 1956.5,
		"status": "successful",
		"fee": 3.5,
		"date": "2026-10-05"
	},
	{
		"id": "pay_e71guTHnM8nL5C",
		"name": "Payout 2026-06-26 \u00b7 $819.00",
		"amount": 819.0,
		"status": "successful",
		"fee": 1.0,
		"date": "2026-10-05"
	},
	{
		"id": "pay_khGCJpV6VGUEAj",
		"name": "Payout 2026-01-27 \u00b7 $119.00",
		"amount": 119.0,
		"status": "successful",
		"fee": 1.0,
		"date": "2026-10-05"
	}
]
