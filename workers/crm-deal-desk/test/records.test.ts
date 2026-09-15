import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { MOCK_COMPANIES, MOCK_CONTACTS } from "../blocks/crm-desk/src/mock.ts"
import {
	bareCompany,
	bareContact,
	companyRequirements,
	contactRequirements,
	deriveContactName,
	duplicateCompanies,
	duplicateContacts,
	emptyCompanyDraft,
	emptyContactDraft,
	mergeById,
	normalizeCompanyDraft,
	normalizeCompanyName,
	normalizeContactDraft,
	normalizeWebsite,
	searchCompanies,
	searchContacts,
	unmetRecordRequirements,
	websiteDomain,
} from "../blocks/crm-desk/src/records.ts"
import { byId } from "../blocks/crm-desk/src/rules.ts"

const unmet = (reqs: ReturnType<typeof contactRequirements>) =>
	unmetRecordRequirements(reqs).map((r) => r.key)

describe("contactRequirements", () => {
	it("needs a name, but accepts first + last in its place", () => {
		assert.deepEqual(unmet(contactRequirements(emptyContactDraft())), ["name"])
		const split = { ...emptyContactDraft(), firstName: "Priya", lastName: "Raman" }
		assert.deepEqual(unmet(contactRequirements(split)), [])
		assert.equal(deriveContactName(split), "Priya Raman")
	})

	it("prefers an explicit name over the derived one", () => {
		const d = { ...emptyContactDraft(), name: "Dr. Helen Quek", firstName: "Helen", lastName: "Quek" }
		assert.equal(deriveContactName(d), "Dr. Helen Quek")
	})

	it("only checks the email and LinkedIn when they are given", () => {
		const base = { ...emptyContactDraft(), name: "Someone" }
		assert.deepEqual(unmet(contactRequirements({ ...base, email: "not-an-email" })), ["email"])
		assert.deepEqual(unmet(contactRequirements({ ...base, email: "a@b.co" })), [])
		assert.deepEqual(unmet(contactRequirements({ ...base, linkedin: "linkedin.com/in/x" })), [])
		assert.deepEqual(unmet(contactRequirements({ ...base, linkedin: "not a url" })), ["linkedin"])
	})
})

describe("companyRequirements", () => {
	it("needs a name and, if given, a URL-shaped website", () => {
		assert.deepEqual(unmet(companyRequirements(emptyCompanyDraft()) as never), ["name"])
		const named = { ...emptyCompanyDraft(), name: "Marina Freight" }
		assert.deepEqual(unmet(companyRequirements(named) as never), [])
		assert.deepEqual(unmet(companyRequirements({ ...named, website: "marinafreight.example" }) as never), [])
		assert.deepEqual(unmet(companyRequirements({ ...named, website: "not a url" }) as never), ["website"])
	})
})

describe("normalizeWebsite", () => {
	it("adds https:// to a bare domain and leaves a schemed URL alone", () => {
		assert.equal(normalizeWebsite("example.com"), "https://example.com")
		assert.equal(normalizeWebsite("http://example.com/x"), "http://example.com/x")
		assert.equal(normalizeWebsite("   "), null)
		assert.equal(normalizeWebsite(null), null)
	})

	it("extracts the domain without www", () => {
		assert.equal(websiteDomain("https://www.Example.com/path"), "example.com")
		assert.equal(websiteDomain("example.com"), "example.com")
		assert.equal(websiteDomain(null), null)
	})
})

describe("normalize*Draft", () => {
	it("trims, collapses blanks to null, lower-cases email and schemes the LinkedIn URL", () => {
		const clean = normalizeContactDraft({
			...emptyContactDraft("co-x"),
			name: "",
			firstName: " Wei Ming ",
			lastName: "Tan",
			jobTitle: "   ",
			email: "Wei.Ming@Example.com",
			linkedin: "linkedin.com/in/weiming",
		})
		assert.equal(clean.name, "Wei Ming Tan")
		assert.equal(clean.firstName, "Wei Ming")
		assert.equal(clean.jobTitle, null)
		assert.equal(clean.email, "wei.ming@example.com")
		assert.equal(clean.linkedin, "https://linkedin.com/in/weiming")
		assert.equal(clean.companyId, "co-x")
	})

	it("trims the company name and schemes the website", () => {
		const clean = normalizeCompanyDraft({ ...emptyCompanyDraft(), name: " Acme ", website: "acme.example" })
		assert.equal(clean.name, "Acme")
		assert.equal(clean.website, "https://acme.example")
	})
})

describe("duplicate hints", () => {
	it("matches company names regardless of suffix and punctuation", () => {
		assert.equal(normalizeCompanyName("Marina Freight Solutions Pte. Ltd."), "marina freight solutions")
		assert.equal(normalizeCompanyName("River & Co"), "river and")
		const dupes = duplicateCompanies(
			{ name: "marina freight solutions pte ltd", website: null },
			MOCK_COMPANIES,
		)
		assert.deepEqual(dupes.map((c) => c.id), ["co-marina"])
	})

	it("matches companies by website domain", () => {
		const dupes = duplicateCompanies(
			{ name: "Something Else", website: "www.marinafreight.example" },
			MOCK_COMPANIES,
		)
		assert.deepEqual(dupes.map((c) => c.id), ["co-marina"])
	})

	it("does not report the record being edited as its own duplicate", () => {
		const marina = MOCK_COMPANIES.find((c) => c.id === "co-marina")!
		assert.deepEqual(duplicateCompanies(marina, MOCK_COMPANIES, marina.id), [])
	})

	it("matches contacts by email, or by full name at the same company", () => {
		const priya = MOCK_CONTACTS.find((c) => c.id === "ct-priya-raman")!
		assert.deepEqual(
			duplicateContacts({ ...emptyContactDraft(), email: priya.email!.toUpperCase() }, MOCK_CONTACTS).map((c) => c.id),
			["ct-priya-raman"],
		)
		assert.deepEqual(
			duplicateContacts(
				{ ...emptyContactDraft("co-marina"), firstName: "Priya", lastName: "Raman" },
				MOCK_CONTACTS,
			).map((c) => c.id),
			["ct-priya-raman"],
		)
		// Same name, different company: not a duplicate.
		assert.deepEqual(
			duplicateContacts(
				{ ...emptyContactDraft("co-kopi"), firstName: "Priya", lastName: "Raman" },
				MOCK_CONTACTS,
			),
			[],
		)
	})
})

describe("search", () => {
	const companiesById = byId(MOCK_COMPANIES)

	it("matches contacts on name, email, title and company name", () => {
		const byCompany = searchContacts("marina", MOCK_CONTACTS, companiesById)
		assert.equal(byCompany.length, 18)
		const byTitle = searchContacts("fleet manager", MOCK_CONTACTS, companiesById)
		assert.deepEqual(byTitle.map((c) => c.id), ["ct-daniel-ooi"])
		const byEmail = searchContacts("priya.raman@", MOCK_CONTACTS, companiesById)
		assert.deepEqual(byEmail.map((c) => c.id), ["ct-priya-raman"])
	})

	it("returns everyone, sorted, for a blank query", () => {
		const all = searchContacts("", MOCK_CONTACTS, companiesById)
		assert.equal(all.length, MOCK_CONTACTS.length)
		assert.deepEqual(all.map((c) => c.name), [...all.map((c) => c.name)].sort((a, b) => a.localeCompare(b)))
	})

	it("matches companies on name, domain and industry", () => {
		assert.deepEqual(searchCompanies("marinafreight", MOCK_COMPANIES).map((c) => c.id), ["co-marina"])
		assert(searchCompanies("healthcare", MOCK_COMPANIES).length >= 2)
	})

	it("merges local and remote results without duplicates, local first", () => {
		const a = bareContact("1", "A")
		const b = bareContact("2", "B")
		const merged = mergeById([a, b], [bareContact("2", "B again"), bareContact("3", "C")])
		assert.deepEqual(merged.map((c) => c.id), ["1", "2", "3"])
		assert.equal(merged[1]!.name, "B")
	})
})

describe("bare builders", () => {
	it("produce complete records", () => {
		const company = bareCompany("x", "X")
		assert.equal(company.website, null)
		assert.deepEqual(company.contactIds, [])
		const contact = bareContact("y", "Y", { companyId: "x" })
		assert.equal(contact.companyId, "x")
		assert.deepEqual(contact.emailIds, [])
	})
})
