import { Worker } from "@notionhq/workers";
import { j } from "@notionhq/workers/schema-builder";
import { GOOGLE_DRIVE_APP, getZapier, resolveDriveConnectionId } from "./zapier.js";

const worker = new Worker();
export default worker;

/**
 * Google Drive's Zapier actions are not consistent about which Drive API
 * version they echo back:
 *
 * - the *search* actions return the **v2** shape — name in `title`, link in
 *   `alternateLink`
 * - `update_file_metadata` returns the **v3** shape — name in `name`, and no
 *   link field at all
 *
 * `summarise()` reads both, and synthesises a link from the id when none is
 * given so a renamed item can still be handed back to the user as a URL.
 */
type DriveFile = {
	id?: unknown;
	title?: unknown;
	name?: unknown;
	mimeType?: unknown;
	alternateLink?: unknown;
	webViewLink?: unknown;
	modifiedDate?: unknown;
	explicitlyTrashed?: unknown;
};

const FOLDER_MIME = "application/vnd.google-apps.folder";

function str(value: unknown): string | null {
	if (typeof value === "string") return value;
	if (typeof value === "number") return String(value);
	return null;
}

function summarise(file: DriveFile) {
	const mimeType = str(file.mimeType);
	const fileId = str(file.id) ?? "";
	const link = str(file.alternateLink) ?? str(file.webViewLink);
	return {
		fileId,
		name: str(file.title) ?? str(file.name) ?? "",
		mimeType,
		isFolder: mimeType === FOLDER_MIME,
		url: link ?? (fileId ? `https://drive.google.com/open?id=${fileId}` : null),
		modifiedAt: str(file.modifiedDate),
	};
}

/** Zapier returns action results as an array; unwrap to the first record. */
function firstRecord(data: unknown): Record<string, unknown> {
	const first = Array.isArray(data) ? data[0] : data;
	return (first ?? {}) as Record<string, unknown>;
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

const fileSummarySchema = j.object({
	fileId: j.string().describe("The Google Drive file or folder id."),
	name: j.string().describe("Current name of the file or folder."),
	mimeType: j.string().describe("Google Drive MIME type.").nullable(),
	isFolder: j.boolean().describe("True when this item is a folder rather than a file."),
	url: j.string().describe("Link to open the item in Google Drive.").nullable(),
	modifiedAt: j.string().describe("ISO 8601 timestamp of the last modification.").nullable(),
});

worker.tool("findDriveFiles", {
	title: "Find Google Drive Files",
	description:
		"Search Google Drive for files and folders by name and return their ids. " +
		"Use this first when the user names a file to rename but you don't have its Drive id — " +
		"then pass the chosen fileId to renameDriveFile. " +
		"If more than one result comes back, ask the user which one they mean rather than guessing.",
	schema: j.object({
		name: j
			.string()
			.describe("Text to match against file and folder names, e.g. 'Q3 forecast'."),
		exactMatch: j
			.boolean()
			.describe(
				"If true, only return items whose name matches exactly. Defaults to false (substring match).",
			)
			.nullable(),
		driveId: j
			.string()
			.describe(
				"Shared Drive id to search. Omit to search the connected account's personal My Drive.",
			)
			.nullable(),
		limit: j
			.number()
			.describe("Maximum number of results to return. Defaults to 10, capped at 50.")
			.nullable(),
	}),
	outputSchema: j.object({
		success: j.boolean().describe("Whether the search ran successfully."),
		files: j.array(fileSummarySchema).describe("Matching files and folders."),
		message: j.string().describe("Human-readable result or error description."),
	}),
	execute: async (input) => {
		const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
		const inputs: Record<string, unknown> = {
			title: input.name,
			search_type: input.exactMatch ? "exact" : "contains",
		};
		if (input.driveId) inputs.drive = input.driveId;

		try {
			const zapier = getZapier();
			const connection = await resolveDriveConnectionId(zapier);

			const { data } = await zapier.runAction({
				app: GOOGLE_DRIVE_APP,
				actionType: "search",
				action: "find_multiple_files",
				connection,
				inputs,
			});

			// `find_multiple_files` wraps its hits: [{ count, files: [...] }].
			const record = firstRecord(data);
			const raw = Array.isArray(record.files) ? (record.files as DriveFile[]) : [];
			const files = raw
				.filter((file) => file.explicitlyTrashed !== true)
				.map(summarise)
				.filter((file) => file.fileId !== "")
				.slice(0, limit);

			return {
				success: true,
				files,
				message:
					files.length === 0
						? `No Google Drive items matched "${input.name}".`
						: `Found ${files.length} item(s) matching "${input.name}".`,
			};
		} catch (err) {
			return {
				success: false,
				files: [],
				message: `Failed to search Google Drive for "${input.name}": ${errorMessage(err)}`,
			};
		}
	},
});

worker.tool("renameDriveFile", {
	title: "Rename Google Drive File",
	description:
		"Rename a file or folder in Google Drive. Requires the Drive file id — use findDriveFiles " +
		"to look one up by name first. Google Drive does not allow changing a file's extension " +
		"after creation, so keep the original extension in newName for non-Google-Workspace files. " +
		"This renames the item in place; it does not move or copy it.",
	schema: j.object({
		fileId: j
			.string()
			.describe(
				"The Google Drive id of the file or folder to rename, as returned by findDriveFiles.",
			),
		newName: j.string().describe("The new name for the file or folder."),
		driveId: j
			.string()
			.describe(
				"Shared Drive id the item lives in. Omit for the connected account's personal My Drive.",
			)
			.nullable(),
	}),
	outputSchema: j.object({
		success: j.boolean().describe("Whether the rename succeeded."),
		fileId: j.string().describe("The Google Drive id that was targeted."),
		name: j.string().describe("The item's name after the rename.").nullable(),
		url: j.string().describe("Link to open the item in Google Drive.").nullable(),
		message: j.string().describe("Human-readable result or error description."),
	}),
	execute: async (input) => {
		const { fileId, newName } = input;
		const inputs: Record<string, unknown> = { file_id: fileId, name: newName };
		if (input.driveId) inputs.drive = input.driveId;

		try {
			const zapier = getZapier();
			const connection = await resolveDriveConnectionId(zapier);

			const { data } = await zapier.runAction({
				app: GOOGLE_DRIVE_APP,
				actionType: "write",
				action: "update_file_metadata",
				connection,
				inputs,
			});

			const file = summarise(firstRecord(data) as DriveFile);

			return {
				success: true,
				fileId,
				name: file.name || newName,
				url: file.url,
				message: `Renamed Google Drive item ${fileId} to "${file.name || newName}".`,
			};
		} catch (err) {
			return {
				success: false,
				fileId,
				name: null,
				url: null,
				message: `Failed to rename Google Drive item ${fileId} to "${newName}": ${errorMessage(err)}`,
			};
		}
	},
});
