import { Worker } from "@notionhq/workers";
import * as Schema from "@notionhq/workers/schema";
import { openDrive, type DriveFile } from "./drive.js";
import { exportRank, guestKey, guestToProperties, parseLumaCsv } from "./luma.js";

const worker = new Worker();
export default worker;

/** Rows mapped to Notion per sync-execute call. Keep near ~100 for the timeout. */
const BATCH_SIZE = 100;

/**
 * Managed database mirroring the latest Luma guest export. `Guest ID` is the
 * primary key, so re-syncing the same export updates rows in place. In replace
 * mode, guests absent from the newest export are removed on the sweep.
 */
const guests = worker.database("guests", {
  type: "managed",
  initialTitle: "Luma Event Guests",
  primaryKeyProperty: "Guest ID",
  schema: {
    properties: {
      Name: Schema.title(),
      "Guest ID": Schema.richText(),
      Email: Schema.email(),
      "First Name": Schema.richText(),
      "Last Name": Schema.richText(),
      Phone: Schema.phoneNumber(),
      Company: Schema.richText(),
      "Job Title": Schema.richText(),
      LinkedIn: Schema.url(),
      "Approval Status": Schema.select([
        { name: "approved", color: "green" },
        { name: "pending_approval", color: "yellow" },
        { name: "waitlist", color: "blue" },
        { name: "declined", color: "red" },
        { name: "invited", color: "gray" },
      ]),
      "Registered At": Schema.date(),
      "Checked In At": Schema.date(),
      "Ticket Name": Schema.select([{ name: "Standard" }]),
      Amount: Schema.number("dollar"),
      "UTM Source": Schema.select([
        { name: "customer.io" },
        { name: "Iterable" },
      ]),
      "Notion Usage": Schema.select([
        { name: "Exploring / just getting started" },
        { name: "Personal use only" },
        { name: "Startup (founder or early team)" },
        { name: "Growing team / scale-up" },
        { name: "Enterprise / large organisation" },
      ]),
      "Used Zapier Before": Schema.select([
        { name: "New to Zapier" },
        { name: "Not yet but I'd love to try" },
        { name: "Advanced Zapier user" },
      ]),
      "Work Email": Schema.email(),
      "Mailing List Opt-In": Schema.checkbox(),
      "Survey Rating": Schema.number(),
      "Survey Feedback": Schema.richText(),
      "QR Check-In URL": Schema.url(),
    },
  },
});

interface SyncState {
  /** Row offset within the chosen CSV for the current cycle. */
  offset?: number;
  /** Drive file id locked in for the current cycle so pagination is stable. */
  fileId?: string;
}

/** Pick the newest Luma CSV, preferring the export timestamp in the filename. */
function selectLatestCsv(files: DriveFile[]): DriveFile | null {
  const csvs = files.filter(
    (f) => f.name.toLowerCase().endsWith(".csv") || f.mimeType === "text/csv",
  );
  if (csvs.length === 0) return null;
  return [...csvs].sort(
    (a, b) => exportRank(b.name, b.modifiedTime) - exportRank(a.name, a.modifiedTime),
  )[0];
}

worker.sync("lumaGuestSync", {
  database: guests,
  mode: "replace",
  schedule: "1h",
  execute: async (rawState) => {
    const state = (rawState ?? {}) as SyncState;
    const offset = state.offset ?? 0;

    const folderId = process.env.GDRIVE_FOLDER_ID;
    if (!folderId) throw new Error("GDRIVE_FOLDER_ID is not configured");

    // On failure we THROW: the real SyncExecutionResult has no error channel, and
    // in replace mode an errored cycle skips the mark-and-sweep — so a transient
    // Drive/Zapier failure fails visibly instead of silently wiping the database.
    const drive = await openDrive();

    // Lock a single file per cycle: choose the latest on the first page,
    // then reuse its id across paginated pages.
    let fileId = state.fileId;
    if (!fileId) {
      const files = await drive.listCsvFiles(folderId);
      const latest = selectLatestCsv(files);
      if (!latest) {
        throw new Error(`No CSV files found in Google Drive folder ${folderId} (${files.length} file(s) returned)`);
      }
      console.log(`Luma sync: selected "${latest.name}" (${latest.id}) from ${files.length} candidate(s)`);
      fileId = latest.id;
    }

    const rows = parseLumaCsv(await drive.downloadFile(fileId));
    if (rows.length === 0) throw new Error("CSV had no data rows; refusing to sweep the database");

    const changes = rows
      .slice(offset, offset + BATCH_SIZE)
      // The SDK's `properties` mapped type requires every schema key; a partial
      // upsert is valid at runtime (unset columns stay blank), so cast at the boundary.
      .map((row) => ({ type: "upsert" as const, key: guestKey(row), properties: guestToProperties(row) as any }))
      .filter((c) => c.key.length > 0);

    const nextOffset = offset + BATCH_SIZE;
    const hasMore = nextOffset < rows.length;
    console.log(`Luma sync: offset=${offset} → ${changes.length} upserts, hasMore=${hasMore} (rows=${rows.length})`);
    return { changes, hasMore, nextState: hasMore ? { offset: nextOffset, fileId } : undefined };
  },
});
