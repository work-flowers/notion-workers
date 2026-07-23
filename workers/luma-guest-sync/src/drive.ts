import { createZapierSdk } from "@zapier/zapier-sdk";

/**
 * Google Drive access through the Zapier SDK. Zapier holds the Google OAuth
 * connection and injects credentials on each `zapier.fetch`, so this Worker
 * never handles Google tokens directly. We call the Drive v3 REST API rather
 * than a pre-built Zapier action because we need folder listing sorted by
 * time plus a raw media download — both are cleaner as direct calls.
 *
 * The Luma exports live on a Shared Drive, so every request sets
 * supportsAllDrives / includeItemsFromAllDrives.
 */

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  mimeType: string;
}

export interface Drive {
  listCsvFiles(folderId: string): Promise<DriveFile[]>;
  downloadFile(fileId: string): Promise<string>;
}

/** Open a Drive client backed by a single Zapier SDK + connection lookup. */
export async function openDrive(): Promise<Drive> {
  const clientId = process.env.ZAPIER_CLIENT_ID;
  const clientSecret = process.env.ZAPIER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("ZAPIER_CLIENT_ID / ZAPIER_CLIENT_SECRET are not configured");
  }

  const zapier = createZapierSdk({ credentials: { clientId, clientSecret } });

  const app = process.env.ZAPIER_GDRIVE_APP ?? "google-drive";
  const { data: conn } = await zapier.findFirstConnection({ app, owner: "me" });
  if (!conn?.id) {
    throw new Error(
      `No active Zapier connection for '${app}'. Connect Google Drive at ` +
        "https://zapier.com/app/assets/connections",
    );
  }
  const connection = conn.id;

  return {
    async listCsvFiles(folderId: string): Promise<DriveFile[]> {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false and (mimeType = 'text/csv' or name contains '.csv')`,
        orderBy: "modifiedTime desc",
        fields: "files(id,name,modifiedTime,mimeType)",
        pageSize: "100",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        corpora: "allDrives",
      });
      const res = await zapier.fetch(
        `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
        { connection },
      );
      if (!res.ok) {
        throw new Error(`Drive list failed (${res.status}): ${await res.text()}`);
      }
      const json = (await res.json()) as { files?: DriveFile[] };
      return json.files ?? [];
    },

    async downloadFile(fileId: string): Promise<string> {
      const params = new URLSearchParams({
        alt: "media",
        supportsAllDrives: "true",
      });
      const res = await zapier.fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`,
        { connection },
      );
      if (!res.ok) {
        throw new Error(`Drive download failed (${res.status}): ${await res.text()}`);
      }
      return await res.text();
    },
  };
}
