import { parse } from "csv-parse/sync";
import * as Builder from "@notionhq/workers/builder";

/**
 * Parsing and mapping for Luma "Guests" registration-export CSVs.
 *
 * A Luma export is one row per guest registration. The leading columns are
 * stable (guest_id, name, email, ...); the trailing columns are the event's
 * custom registration questions, whose header text is author-defined. We match
 * the stable columns by exact header and the known custom questions by a
 * resilient prefix so a small wording tweak upstream doesn't silently drop data.
 */

/** Exact header names for the stable Luma columns. */
const COLUMN = {
  guestId: "guest_id",
  name: "name",
  firstName: "first_name",
  lastName: "last_name",
  email: "email",
  phone: "phone_number",
  createdAt: "created_at",
  approvalStatus: "approval_status",
  checkedInAt: "checked_in_at",
  utmSource: "utm_source",
  qrCodeUrl: "qr_code_url",
  amount: "amount",
  surveyRating: "survey_response_rating",
  surveyFeedback: "survey_response_feedback",
  ticketName: "ticket_name",
} as const;

/** The bare minimum a file must contain to be treated as a Luma guest export. */
const REQUIRED_HEADERS = [COLUMN.guestId, COLUMN.email, COLUMN.approvalStatus];

export type LumaRow = Record<string, string>;

/** All Builder helpers return the same opaque value token type. */
type PropValue = ReturnType<typeof Builder.richText>;

/** Thrown when the CSV is readable but is not a Luma guest export. */
export class LumaFormatError extends Error {}

/**
 * Parse a Luma CSV into rows keyed by header. Uses a spec-compliant parser so
 * quoted fields containing commas, quotes, or newlines (e.g. free-text survey
 * feedback) are handled correctly.
 *
 * @throws {LumaFormatError} if the file doesn't look like a Luma guest export.
 */
export function parseLumaCsv(text: string): LumaRow[] {
  // Strip a UTF-8 BOM if present so the first header key isn't "﻿guest_id".
  const clean = text.replace(/^﻿/, "");

  let rows: LumaRow[];
  try {
    rows = parse(clean, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: false,
    });
  } catch (err) {
    throw new LumaFormatError(`CSV could not be parsed: ${(err as Error).message}`);
  }

  if (rows.length === 0) return rows;

  const headers = Object.keys(rows[0]);
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new LumaFormatError(
      `Not a Luma guest export — missing column(s): ${missing.join(", ")}`,
    );
  }
  return rows;
}

/**
 * Rank a filename or modified-time for "latest" selection. Prefers the
 * export timestamp embedded in Luma filenames (…- Guests - YYYY-MM-DD-HH-MM-SS.csv),
 * which reflects when the export was generated, and falls back to modified time.
 */
export function exportRank(name: string, modifiedTime?: string): number {
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) return t;
  }
  const mod = modifiedTime ? Date.parse(modifiedTime) : NaN;
  return Number.isNaN(mod) ? 0 : mod;
}

// --- value coercion helpers -------------------------------------------------

const val = (row: LumaRow, key: string): string => (row[key] ?? "").trim();

/** Find a custom-question column by exact name, or by a prefix fallback. */
function question(row: LumaRow, exact: string, prefix?: string): string {
  if (exact in row) return (row[exact] ?? "").trim();
  if (prefix) {
    const key = Object.keys(row).find((k) => k.startsWith(prefix));
    if (key) return (row[key] ?? "").trim();
  }
  return "";
}

function emailOrNull(v: string): string | null {
  const s = v.trim();
  return s.includes("@") ? s : null; // guard junk like "Na"
}

function urlOrNull(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return `https://${s}`;
  return null; // not URL-like (e.g. a bare "Singapore") → leave blank
}

function amountOrNull(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number.parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function isoOrNull(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  return Number.isNaN(Date.parse(s)) ? null : s;
}

function displayName(row: LumaRow): string {
  const name = val(row, COLUMN.name);
  if (name) return name;
  const full = `${val(row, COLUMN.firstName)} ${val(row, COLUMN.lastName)}`.trim();
  if (full) return full;
  return emailOrNull(val(row, COLUMN.email)) ?? val(row, COLUMN.guestId) ?? "(no name)";
}

/**
 * Map one Luma row to Notion property values keyed to the managed-database
 * schema in `index.ts`. Empty/invalid values are omitted so the corresponding
 * Notion cell is simply left blank rather than being cleared to an error state.
 */
export function guestToProperties(row: LumaRow): Record<string, PropValue> {
  const props: Record<string, PropValue> = {
    Name: Builder.title(displayName(row)),
    "Guest ID": Builder.richText(val(row, COLUMN.guestId)),
    "Mailing List Opt-In": Builder.checkbox(
      /^y/i.test(question(row, "Stay connected", "Stay connected")),
    ),
  };

  const set = (key: string, value: PropValue | null) => {
    if (value !== null) props[key] = value;
  };

  const email = emailOrNull(val(row, COLUMN.email));
  set("Email", email ? Builder.email(email) : null);

  set("First Name", val(row, COLUMN.firstName) ? Builder.richText(val(row, COLUMN.firstName)) : null);
  set("Last Name", val(row, COLUMN.lastName) ? Builder.richText(val(row, COLUMN.lastName)) : null);

  const phone = val(row, COLUMN.phone);
  set("Phone", phone ? Builder.phoneNumber(phone) : null);

  const registered = isoOrNull(val(row, COLUMN.createdAt));
  set("Registered At", registered ? Builder.dateTime(registered) : null);

  const checkedIn = isoOrNull(val(row, COLUMN.checkedInAt));
  set("Checked In At", checkedIn ? Builder.dateTime(checkedIn) : null);

  const status = val(row, COLUMN.approvalStatus);
  set("Approval Status", status ? Builder.select(status) : null);

  const utm = val(row, COLUMN.utmSource);
  set("UTM Source", utm ? Builder.select(utm) : null);

  const ticket = val(row, COLUMN.ticketName);
  set("Ticket Name", ticket ? Builder.select(ticket) : null);

  const amount = amountOrNull(val(row, COLUMN.amount));
  set("Amount", amount === null ? null : Builder.number(amount));

  const qr = urlOrNull(val(row, COLUMN.qrCodeUrl));
  set("QR Check-In URL", qr ? Builder.url(qr) : null);

  const rating = intOrNull(val(row, COLUMN.surveyRating));
  set("Survey Rating", rating === null ? null : Builder.number(rating));

  const feedback = val(row, COLUMN.surveyFeedback);
  set("Survey Feedback", feedback ? Builder.richText(feedback) : null);

  // Custom registration questions (matched by prefix for resilience).
  const company = question(row, "What company do you work for?", "What company");
  set("Company", company ? Builder.richText(company) : null);

  const jobTitle = question(row, "What is your job title?", "What is your job title");
  set("Job Title", jobTitle ? Builder.richText(jobTitle) : null);

  const linkedin = urlOrNull(question(row, "What is your LinkedIn profile?", "What is your LinkedIn"));
  set("LinkedIn", linkedin ? Builder.url(linkedin) : null);

  const notionUsage = question(row, "Which best describes how you use Notion today?", "Which best describes how you use Notion");
  set("Notion Usage", notionUsage ? Builder.select(notionUsage) : null);

  const usedZapier = question(row, "Have you used Zapier before?", "Have you used Zapier");
  set("Used Zapier Before", usedZapier ? Builder.select(usedZapier) : null);

  const workEmail = emailOrNull(question(row, "Work email address", "Work email"));
  set("Work Email", workEmail ? Builder.email(workEmail) : null);

  return props;
}

/** The primary-key value for a row (used as the sync change `key`). */
export function guestKey(row: LumaRow): string {
  return val(row, COLUMN.guestId);
}
