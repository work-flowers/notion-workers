/** Where the desk is looking. One union so cross-tab links are ordinary values. */
export type View =
	| { tab: "deals"; name: "pipeline" }
	| { tab: "deals"; name: "attention" }
	| { tab: "deals"; name: "closed" }
	| { tab: "deals"; name: "deal"; id: string }
	| { tab: "deals"; name: "new"; companyId?: string | null; contactId?: string | null }
	| { tab: "contacts"; id: string | null; editing?: boolean }
	| { tab: "contacts"; new: true; companyId?: string | null }
	| { tab: "companies"; id: string | null; editing?: boolean }
	| { tab: "companies"; new: true }

export type Tab = View["tab"]

export type Navigate = (view: View) => void

export const HOME: View = { tab: "deals", name: "pipeline" }
