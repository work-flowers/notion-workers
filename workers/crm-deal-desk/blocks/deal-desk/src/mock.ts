/**
 * A mirror of the **workFlowers CRM Template** — entirely fictional data.
 *
 * Deliberately not the live CRM. This block is a proof of concept meant to be
 * screen-recorded and shown to people outside the company, so no real client,
 * contact or deal value appears anywhere in it. The template it mirrors lives at
 * `workFlowers CRM Template` in Notion and is populated with the same rows, so
 * the local `?mock` demo and the deployed block look alike.
 *
 * Ids here are synthetic slugs (`co-marina`, `ct-priya-raman`) rather than the
 * template's Notion page ids. Nothing round-trips to a real page, so a readable
 * id is worth more than a faithful one — and it keeps the diff legible when the
 * fixture changes. Uniqueness is the only real constraint: duplicate ids make
 * React reuse DOM and stack rows on top of each other, which reads as a layout
 * bug rather than a data one.
 *
 * The data is shaped to exercise the states that matter, not to look tidy:
 *
 * - **Contact counts vary a lot** (Marina Freight 18, Saffron & Salt 1, Bluefin
 *   and Pelican Bay zero). A picker that narrows 125 contacts to 18 makes the
 *   point; one that narrows 5 to 2 does not.
 * - **Two companies have nobody on record**, which is the only way to reach the
 *   "no contacts at this company" branch.
 * - **Several deals are in states the rules forbid**, including two whose
 *   contact works at a different company. Those are the "Needs attention" list.
 *   `test/rules.test.ts` asserts the exact counts.
 */

import type { Company, Contact, Deal, Stage } from "./rules.ts"

// [slug, name]
const COMPANY_ROWS: [string, string][] = [
	// The five rows the template ships with.
	["co-crispy-coco", "Crispy Coco Pte Ltd"],
	["co-orchid-labs", "Orchid Labs Pte Ltd"],
	["co-tan-cleaning", "Tan Cleaning Company"],
	["co-river", "River & Co"],
	["co-juniper", "Juniper Health"],
	// Added to give the pickers something to narrow.
	["co-kopi", "Kopi Culture Roasters"],
	["co-marina", "Marina Freight Solutions"],
	["co-bluefin", "Bluefin Analytics"],
	["co-pandan", "Pandan Bakehouse"],
	["co-northwind", "Northwind Legal LLP"],
	["co-sable", "Sable & Stone Interiors"],
	["co-harbourline", "Harbourline Capital"],
	["co-verdant", "Verdant Facilities Group"],
	["co-lantern", "Little Lantern Preschool"],
	["co-cobalt", "Cobalt Pathology"],
	["co-sunda", "Sunda Straits Trading"],
	["co-aster", "Aster Recruitment"],
	["co-copperleaf", "Copperleaf Studios"],
	["co-meridian", "Meridian Dental Group"],
	["co-foxglove", "Foxglove Apparel"],
	["co-trellis", "Trellis Property Management"],
	["co-nimbus", "Nimbus Cloudworks"],
	["co-saffron", "Saffron & Salt Catering"],
	["co-ridgeway", "Ridgeway Engineering"],
	["co-pelican", "Pelican Bay Resorts"],
]

// [slug, name, jobTitle, companySlug]
const CONTACT_ROWS: [string, string, string | null, string | null][] = [
	// Template originals. Two have no company — that is why `contactMismatch`
	// treats a null company as unknown rather than wrong.
	["ct-bobby-john", "Bobby John", null, null],
	["ct-dennis", "Dennis Chiuten", "Founder", null],
	["ct-ravi-menon", "Ravi Menon", "Marketing Analyst", "co-river"],
	["ct-mei-lin", "Mei Lin", "Head of Sales", "co-juniper"],
	["ct-aisha-tan", "Aisha Tan", "Ops Manager", "co-orchid-labs"],

	// Marina Freight Solutions — 18, the widest roster.
	["ct-priya-raman", "Priya Raman", "Head of Operations", "co-marina"],
	["ct-daniel-ooi", "Daniel Ooi", "Fleet Manager", "co-marina"],
	["ct-hafiz-rahman", "Hafiz Rahman", "Warehouse Supervisor", "co-marina"],
	["ct-cheryl-ng", "Cheryl Ng", "Customer Service Lead", "co-marina"],
	["ct-ibrahim-yusof", "Ibrahim Yusof", "Route Planner", "co-marina"],
	["ct-michelle-koh", "Michelle Koh", "Finance Manager", "co-marina"],
	["ct-arjun-nair", "Arjun Nair", "Data Analyst", "co-marina"],
	["ct-serene-wong", "Serene Wong", "HR Business Partner", "co-marina"],
	["ct-marcus-teo", "Marcus Teo", "Head of Compliance", "co-marina"],
	["ct-nurul-aziz", "Nurul Aziz", "Documentation Officer", "co-marina"],
	["ct-kelvin-chua", "Kelvin Chua", "Systems Administrator", "co-marina"],
	["ct-farah-idris", "Farah Idris", "Procurement Officer", "co-marina"],
	["ct-desmond-lau", "Desmond Lau", "Regional Sales Manager", "co-marina"],
	["ct-alicia-fernandez", "Alicia Fernandez", "Key Account Manager", "co-marina"],
	["ct-ryan-goh", "Ryan Goh", "Operations Analyst", "co-marina"],
	["ct-suriya-kumar", "Suriya Kumar", "Depot Manager", "co-marina"],
	["ct-joanne-tan", "Joanne Tan", "Executive Assistant", "co-marina"],
	["ct-weisheng-lim", "Wei Sheng Lim", "Chief Operating Officer", "co-marina"],

	// Verdant Facilities Group — 15.
	["ct-terence-yap", "Terence Yap", "General Manager", "co-verdant"],
	["ct-rohana-salleh", "Rohana Salleh", "Contracts Manager", "co-verdant"],
	["ct-benjamin-choo", "Benjamin Choo", "Site Supervisor", "co-verdant"],
	["ct-divya-pillai", "Divya Pillai", "Safety Officer", "co-verdant"],
	["ct-andrew-sim", "Andrew Sim", "Head of Maintenance", "co-verdant"],
	["ct-lena-ho", "Lena Ho", "Client Relations Manager", "co-verdant"],
	["ct-zulkifli-hassan", "Zulkifli Hassan", "Technician Lead", "co-verdant"],
	["ct-christina-loh", "Christina Loh", "Payroll Officer", "co-verdant"],
	["ct-paul-nathan", "Paul Nathan", "Business Development Manager", "co-verdant"],
	["ct-yuki-tanaka", "Yuki Tanaka", "Sustainability Consultant", "co-verdant"],
	["ct-samuel-ang", "Samuel Ang", "Procurement Lead", "co-verdant"],
	["ct-hazel-ong", "Hazel Ong", "Quality Assurance Manager", "co-verdant"],
	["ct-ganesh-raj", "Ganesh Raj", "Facilities Engineer", "co-verdant"],
	["ct-melissa-chin", "Melissa Chin", "Finance Controller", "co-verdant"],
	["ct-jonathan-wee", "Jonathan Wee", "Managing Director", "co-verdant"],

	// Harbourline Capital — 12.
	["ct-olivia-bennett", "Olivia Bennett", "Investment Director", "co-harbourline"],
	["ct-rajesh-iyer", "Rajesh Iyer", "Portfolio Manager", "co-harbourline"],
	["ct-clara-voss", "Clara Voss", "Head of Investor Relations", "co-harbourline"],
	["ct-weiming-tan", "Tan Wei Ming", "Senior Analyst", "co-harbourline"],
	["ct-sophie-marchand", "Sophie Marchand", "Compliance Officer", "co-harbourline"],
	["ct-nathan-brooks", "Nathan Brooks", "Chief Investment Officer", "co-harbourline"],
	["ct-amira-shah", "Amira Shah", "ESG Lead", "co-harbourline"],
	["ct-lucas-reyes", "Lucas Reyes", "Associate", "co-harbourline"],
	["ct-charlotte-wu", "Charlotte Wu", "Head of Legal", "co-harbourline"],
	["ct-ethan-park", "Ethan Park", "Operations Manager", "co-harbourline"],
	["ct-isabelle-fontaine", "Isabelle Fontaine", "Fund Accountant", "co-harbourline"],
	["ct-vikram-desai", "Vikram Desai", "Managing Partner", "co-harbourline"],

	// Nimbus Cloudworks — 11.
	["ct-aaron-blake", "Aaron Blake", "VP Engineering", "co-nimbus"],
	["ct-sunita-kapoor", "Sunita Kapoor", "Product Manager", "co-nimbus"],
	["ct-felix-nakamura", "Felix Nakamura", "Staff Engineer", "co-nimbus"],
	["ct-bianca-rossi", "Bianca Rossi", "Head of Design", "co-nimbus"],
	["ct-omar-haddad", "Omar Haddad", "DevOps Lead", "co-nimbus"],
	["ct-chloe-zhang", "Chloe Zhang", "Data Engineer", "co-nimbus"],
	["ct-patrick-doyle", "Patrick Doyle", "Solutions Architect", "co-nimbus"],
	["ct-rina-sharma", "Rina Sharma", "Engineering Manager", "co-nimbus"],
	["ct-tobias-frank", "Tobias Frank", "Security Engineer", "co-nimbus"],
	["ct-jasmine-lee", "Jasmine Lee", "Chief Technology Officer", "co-nimbus"],
	["ct-nathaniel-cruz", "Nathaniel Cruz", "Support Lead", "co-nimbus"],

	// Kopi Culture Roasters — 9.
	["ct-siti-bakar", "Siti Nurhaliza Bakar", "Café Operations Manager", "co-kopi"],
	["ct-gavin-toh", "Gavin Toh", "Head Roaster", "co-kopi"],
	["ct-priscilla-yeo", "Priscilla Yeo", "Marketing Manager", "co-kopi"],
	["ct-danish-kamal", "Danish Kamal", "Supply Chain Lead", "co-kopi"],
	["ct-rachel-ang", "Rachel Ang", "Store Manager", "co-kopi"],
	["ct-kenneth-foo", "Kenneth Foo", "Finance Executive", "co-kopi"],
	["ct-amanda-ling", "Amanda Ling", "Brand Partnerships", "co-kopi"],
	["ct-haziq-osman", "Haziq Osman", "Barista Trainer", "co-kopi"],
	["ct-evelyn-soh", "Evelyn Soh", "Founder", "co-kopi"],

	// Cobalt Pathology — 8.
	["ct-helen-quek", "Dr. Helen Quek", "Laboratory Director", "co-cobalt"],
	["ct-ravindran-segar", "Ravindran Segar", "Chief Scientific Officer", "co-cobalt"],
	["ct-tricia-lam", "Tricia Lam", "Quality Manager", "co-cobalt"],
	["ct-wilson-ng", "Wilson Ng", "Lab Operations Lead", "co-cobalt"],
	["ct-fadhilah-omar", "Fadhilah Omar", "Compliance Manager", "co-cobalt"],
	["ct-justin-neo", "Justin Neo", "Head of IT", "co-cobalt"],
	["ct-carmen-sim", "Carmen Sim", "Client Services Manager", "co-cobalt"],
	["ct-alvin-yong", "Dr. Alvin Yong", "Managing Director", "co-cobalt"],

	// Northwind Legal LLP — 8.
	["ct-grace-lim", "Grace Lim", "Managing Partner", "co-northwind"],
	["ct-adrian-poh", "Adrian Poh", "Senior Associate", "co-northwind"],
	["ct-nadia-rahim", "Nadia Rahim", "Paralegal", "co-northwind"],
	["ct-colin-baxter", "Colin Baxter", "Partner, Corporate", "co-northwind"],
	["ct-meera-krishnan", "Meera Krishnan", "Practice Manager", "co-northwind"],
	["ct-jerome-tan", "Jerome Tan", "IT Manager", "co-northwind"],
	["ct-beatrice-ho", "Beatrice Ho", "Billing Coordinator", "co-northwind"],
	["ct-samir-bhatt", "Samir Bhatt", "Knowledge Manager", "co-northwind"],

	// Sunda Straits Trading — 7.
	["ct-lucy-halim", "Lucy Halim", "Trade Operations Manager", "co-sunda"],
	["ct-ronald-kwek", "Ronald Kwek", "Commodities Trader", "co-sunda"],
	["ct-indira-bakri", "Indira Bakri", "Logistics Coordinator", "co-sunda"],
	["ct-peter-lindqvist", "Peter Lindqvist", "Head of Risk", "co-sunda"],
	["ct-yvonne-chia", "Yvonne Chia", "Treasury Manager", "co-sunda"],
	["ct-hendra-wijaya", "Hendra Wijaya", "Country Manager, Indonesia", "co-sunda"],
	["ct-grace-abernathy", "Grace Abernathy", "Chief Executive Officer", "co-sunda"],

	// Meridian Dental Group — 6.
	["ct-priyanka-menon", "Dr. Priyanka Menon", "Principal Dentist", "co-meridian"],
	["ct-sharon-yeo", "Sharon Yeo", "Clinic Manager", "co-meridian"],
	["ct-marcus-wan", "Dr. Marcus Wan", "Orthodontist", "co-meridian"],
	["ct-nurhayati-salim", "Nurhayati Salim", "Front Desk Lead", "co-meridian"],
	["ct-clement-boey", "Clement Boey", "Group Operations Director", "co-meridian"],
	["ct-rebecca-toh", "Rebecca Toh", "Patient Experience Lead", "co-meridian"],

	// Trellis Property Management — 5.
	["ct-gerald-ping", "Gerald Ping", "Portfolio Director", "co-trellis"],
	["ct-anita-suparman", "Anita Suparman", "Leasing Manager", "co-trellis"],
	["ct-bryan-cheong", "Bryan Cheong", "Building Manager", "co-trellis"],
	["ct-sylvia-mak", "Sylvia Mak", "Accounts Manager", "co-trellis"],
	["ct-theo-karlsson", "Theo Karlsson", "Managing Director", "co-trellis"],

	// Copperleaf Studios — 4.
	["ct-lydia-fong", "Lydia Fong", "Creative Director", "co-copperleaf"],
	["ct-idris-kamaruddin", "Idris Kamaruddin", "Executive Producer", "co-copperleaf"],
	["ct-nina-petrova", "Nina Petrova", "Studio Manager", "co-copperleaf"],
	["ct-junwei-lau", "Jun Wei Lau", "Post-Production Lead", "co-copperleaf"],

	// Aster Recruitment — 4.
	["ct-fiona-delacroix", "Fiona Delacroix", "Managing Consultant", "co-aster"],
	["ct-kumar-selvaraj", "Kumar Selvaraj", "Principal Consultant", "co-aster"],
	["ct-tessa-bright", "Tessa Bright", "Research Associate", "co-aster"],
	["ct-hugo-almeida", "Hugo Almeida", "Head of Talent", "co-aster"],

	// Smaller rosters.
	["ct-ian-frobisher", "Ian Frobisher", "Principal Engineer", "co-ridgeway"],
	["ct-sarala-devi", "Sarala Devi", "Project Engineer", "co-ridgeway"],
	["ct-kahmeng-wong", "Wong Kah Meng", "Operations Director", "co-ridgeway"],
	["ct-charmaine-lee", "Charmaine Lee", "Centre Principal", "co-lantern"],
	["ct-nur-adilah", "Nur Adilah", "Curriculum Lead", "co-lantern"],
	["ct-douglas-ler", "Douglas Ler", "Group Administrator", "co-lantern"],
	["ct-melvin-kwa", "Melvin Kwa", "Owner", "co-pandan"],
	["ct-roslinda-jaafar", "Roslinda Jaafar", "Production Manager", "co-pandan"],
	["ct-estelle-moreau", "Estelle Moreau", "Principal Designer", "co-sable"],
	["ct-harold-teng", "Harold Teng", "Project Director", "co-sable"],
	["ct-camille-ashworth", "Camille Ashworth", "Head of Merchandising", "co-foxglove"],
	["ct-raymond-ee", "Raymond Ee", "E-commerce Manager", "co-foxglove"],
	["ct-zoe-mendoza", "Zoe Mendoza", "Events Director", "co-saffron"],

	// Bluefin Analytics and Pelican Bay Resorts deliberately have nobody.
]

// [name, stage, dealType, value, probability, expectedClose, actualClose, companySlug, contactSlug, lostReason]
type DealRow = [
	string,
	Stage,
	string | null,
	number | null,
	number | null,
	string | null,
	string | null,
	string | null,
	string | null,
	string | null,
]

const DEAL_ROWS: DealRow[] = [
	// --- The five rows the template ships with ------------------------------
	// Mostly incomplete, which is exactly why they're worth keeping.
	["Crispy coco - AI Ops Retainer", "Lead", null, null, null, null, null, null, null, null],
	["Cleaning Company Automation Project", "Closed Won", null, null, null, null, null, "co-tan-cleaning", "ct-bobby-john", null],
	["Orchid Labs — CRM setup", "Closed Won", null, 12000, null, null, null, "co-orchid-labs", "ct-aisha-tan", null],
	["Juniper Health — Notion CRM pilot", "Closed Won", null, 8000, null, null, null, "co-juniper", "ct-mei-lin", null],
	["River & Co — Automation retainer", "In signing", null, 30000, null, null, null, "co-river", "ct-ravi-menon", null],

	// --- Well-formed deals --------------------------------------------------
	["Kopi Culture — Order Ops Automation", "Proposal", "Project", 14000, 0.4, "2026-09-30", null, "co-kopi", "ct-evelyn-soh", null],
	["Marina Freight — Notion Logistics Hub", "Negotiation", "Project", 42000, 0.6, "2026-09-15", null, "co-marina", "ct-weisheng-lim", null],
	["Harbourline Capital — Deal Flow CRM", "In signing", "Project", 38000, 0.85, "2026-08-29", null, "co-harbourline", "ct-vikram-desai", null],
	["Verdant Facilities — Work Order Automation", "Proposal", "Project", 26000, 0.35, "2026-10-15", null, "co-verdant", "ct-jonathan-wee", null],
	["Nimbus Cloudworks — AI Ops Retainer", "Negotiation", "Full Retainer", 60000, 0.55, "2026-09-01", null, "co-nimbus", "ct-jasmine-lee", null],
	["Cobalt Pathology — Lab Intake Workflow", "Proposal", "Project", 18500, 0.3, "2026-09-22", null, "co-cobalt", "ct-alvin-yong", null],
	["Northwind Legal — Matter Management Build", "In signing", "Project", 31000, 0.9, "2026-08-20", null, "co-northwind", "ct-grace-lim", null],
	["Meridian Dental — Patient Recall Automation", "Closed Won", "Project", 9500, null, "2026-05-30", "2026-06-02", "co-meridian", "ct-clement-boey", null],
	["Sunda Straits — Trade Docs Digitisation", "Closed Won", "Project", 22000, null, "2026-04-30", "2026-05-06", "co-sunda", "ct-grace-abernathy", null],
	["Aster Recruitment — Candidate Pipeline CRM", "Closed Won", "Project", 12500, null, "2026-03-31", "2026-04-04", "co-aster", "ct-fiona-delacroix", null],
	["Copperleaf Studios — Production Tracker", "Closed Won", "Workshop", 4500, null, "2026-02-28", "2026-03-05", "co-copperleaf", "ct-lydia-fong", null],
	["Trellis Property — Tenant Portal Pilot", "Closed Lost", "Project", 16000, null, "2026-04-15", "2026-04-28", "co-trellis", "ct-theo-karlsson", "Price / Budget"],
	["Foxglove Apparel — Inventory Sync", "Closed Lost", "Project", 8000, null, "2026-03-20", "2026-04-02", "co-foxglove", "ct-camille-ashworth", "Chose competitor"],
	["Saffron & Salt — Event Ops Automation", "Closed Won", "Project", 6800, null, "2026-06-15", "2026-06-18", "co-saffron", "ct-zoe-mendoza", null],
	["Ridgeway Engineering — Site Reporting App", "Closed Lost", "Project", 21000, null, "2026-05-31", "2026-06-10", "co-ridgeway", "ct-kahmeng-wong", "Timing / Not now"],
	["Little Lantern — Enrolment Workflow", "Proposal", "Project", 7500, 0.5, "2026-10-01", null, "co-lantern", "ct-charmaine-lee", null],
	["Pandan Bakehouse — Wholesale Order Forms", "Closed Won", "Project", 3200, null, "2026-01-31", "2026-02-07", "co-pandan", "ct-melvin-kwa", null],
	["Sable & Stone — Project Handover Docs", "Closed Won", "Workshop", 3800, null, "2026-07-10", "2026-07-15", "co-sable", "ct-estelle-moreau", null],
	["Marina Freight — Driver App Discovery", "Lead", "Project", 5000, null, null, null, "co-marina", "ct-priya-raman", null],
	["Nimbus Cloudworks — Support Deflection Bot", "Lead", "Project", 15000, null, null, null, "co-nimbus", "ct-sunita-kapoor", null],

	// --- Deliberately bad states -------------------------------------------
	// Each one is reachable through Notion's own database UI and blocked by this
	// block. They populate the "Needs attention" tab.

	// Proposal at a company with nobody on record: no contact, and no type.
	["Bluefin Analytics — Data Warehouse Review", "Proposal", null, 11000, null, "2026-09-10", null, "co-bluefin", null, null],
	// Negotiation with no value and no contact.
	["Pelican Bay Resorts — Guest CRM Scoping", "Negotiation", "Project", null, null, "2026-09-05", null, "co-pelican", null, null],
	// Lost, with no reason recorded — the most common real-world omission.
	["Verdant Facilities — Compliance Register", "Closed Lost", "Project", 13000, null, null, "2026-06-20", "co-verdant", "ct-lena-ho", null],
	["Kopi Culture — POS Integration", "Closed Lost", "Project", 9000, null, null, "2026-05-25", "co-kopi", "ct-priscilla-yeo", null],
	["Cobalt Pathology — Courier Tracking", "Closed Lost", null, 7000, null, null, "2026-07-02", "co-cobalt", "ct-justin-neo", null],
	// Won with no value — the figure the business reports on, missing.
	["Harbourline Capital — LP Reporting Pack", "Closed Won", "Project", null, null, null, "2026-07-20", "co-harbourline", "ct-olivia-bennett", null],
	["Northwind Legal — Intake Triage", "Closed Won", null, 5400, null, null, "2026-06-28", "co-northwind", "ct-colin-baxter", null],
	// Negotiation with no forecast date.
	["Sunda Straits — Vendor Portal", "Negotiation", "Project", 19000, 0.45, null, null, "co-sunda", "ct-grace-abernathy", null],
	// A deal with a contact but no company at all.
	["Trellis Property — Maintenance SLA Dashboard", "Proposal", "Project", 12000, null, "2026-09-18", null, null, "ct-theo-karlsson", null],
	// Lost, reason recorded, but never dated.
	["Aster Recruitment — Client Portal", "Closed Lost", "Project", 9800, null, null, null, "co-aster", "ct-hugo-almeida", "Went silent / No response"],
	// In signing with no value.
	["Copperleaf Studios — Brand Asset Library", "In signing", "Project", null, null, "2026-08-25", null, "co-copperleaf", "ct-lydia-fong", null],

	// The two cross-company contacts. Ravi Menon works at River & Co and Mei Lin
	// at Juniper Health; neither belongs on these deals. Notion's relation cell
	// offers every contact in the database, so this is trivially easy to do by
	// hand and invisible afterwards.
	["Meridian Dental — Multi-clinic Rollout", "Proposal", "Project", 24000, 0.4, "2026-10-20", null, "co-meridian", "ct-ravi-menon", null],
	["Nimbus Cloudworks — Onboarding Revamp", "Proposal", "Project", 16000, 0.35, "2026-09-28", null, "co-nimbus", "ct-mei-lin", null],
]

export const MOCK_COMPANIES: Company[] = COMPANY_ROWS.map(([id, name]) => ({
	id,
	name,
}))

export const MOCK_CONTACTS: Contact[] = CONTACT_ROWS.map(
	([id, name, jobTitle, companyId]) => ({
		id,
		name,
		jobTitle,
		email: null,
		companyId,
	}),
)

export const MOCK_DEALS: Deal[] = DEAL_ROWS.map(
	(
		[
			name,
			stage,
			dealType,
			value,
			probability,
			expectedClose,
			actualClose,
			companyId,
			contactId,
			lostReason,
		],
		index,
	) => ({
		id: `deal-${String(index + 1).padStart(2, "0")}`,
		name,
		stage,
		dealType,
		value,
		probability,
		expectedClose,
		actualClose,
		companyId,
		contactId,
		lostReason,
		description: null,
	}),
)

/**
 * The stages the template's `Deal Stage` property actually offers.
 *
 * It has no **Declined** option, unlike the live CRM. The block reads this list
 * from the bound property's schema rather than assuming all seven, so mock mode
 * has to supply the same shape or the demo would offer a stage that fails on save.
 */
export const MOCK_STAGE_OPTIONS: Stage[] = [
	"Lead",
	"Proposal",
	"Negotiation",
	"In signing",
	"Closed Won",
	"Closed Lost",
]
