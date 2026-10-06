import assert from "node:assert/strict";
import { test } from "node:test";
import {
	MIN_TYPE_PROBABILITY,
	TYPE_CRITERIA,
	meetingState,
	readTypeAnswer,
} from "./classifyMeetingType";

const answer = (choice: unknown, p: number) => ({
	model: "jev-1.13.0",
	answers: { meeting_type: { choice, probabilities: { [String(choice)]: p } } },
});

test("a confident answer sets the type", () => {
	const r = readTypeAnswer(answer("Client", 0.82));
	assert.equal(r?.type, "Client");
	assert.equal(r?.model, "jev-1.13.0");
});

test("an answer under the threshold keeps the pick but writes nothing", () => {
	const r = readTypeAnswer(answer("Coffee", MIN_TYPE_PROBABILITY - 0.01));
	assert.equal(r?.type, null);
	assert.equal(r?.top, "Coffee");
});

test("the threshold itself is inclusive", () => {
	assert.equal(readTypeAnswer(answer("Team", MIN_TYPE_PROBABILITY))?.type, "Team");
});

test("an option not in the criteria is never written", () => {
	assert.equal(readTypeAnswer(answer("Sales", 0.99)), null);
});

test("malformed bodies are no answer, not a throw", () => {
	for (const body of [null, {}, { answers: {} }, answer(undefined, 0.9), answer(3, 0.9)]) {
		assert.equal(readTypeAnswer(body), null);
	}
});

test("a missing probability reads as zero, so nothing is written", () => {
	const r = readTypeAnswer({ answers: { meeting_type: { choice: "Client" } } });
	assert.equal(r?.type, null);
});

test("every criteria key is one of the Meeting Notes Type options", () => {
	assert.deepEqual(
		Object.keys(TYPE_CRITERIA).sort(),
		[
			"1:1", "Client", "Coffee", "Community", "Discovery", "Event", "Legal",
			"Notion Setup Session", "Onboarding", "Partner", "Product Demo", "Project",
			"Prospect", "Team", "Training", "Vendor", "Webinar", "Zapier Solution Partners",
		].sort(),
	);
});

test("state marks absent context explicitly and caps the description", () => {
	const s = meetingState({
		title: "Weekly Team Meeting",
		description: "x".repeat(5000),
		internalAttendeeCount: 4,
		externalAttendees: [],
		companyNames: [],
		openDealNames: [],
	}) as any;
	assert.equal(s.meeting.description.length, 1500);
	assert.equal(s.meeting.external_attendees, "(none)");
	assert.equal(s.meeting.linked_open_deals, "(none)");
});
