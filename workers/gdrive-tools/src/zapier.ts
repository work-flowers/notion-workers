import { createZapierSdk } from "@zapier/zapier-sdk";

/**
 * A Worker runs headless in Notion's sandbox, so there is no browser for the
 * usual Zapier OAuth login. We authenticate with client credentials generated
 * via `npx zapier-sdk create-client-credentials` and stored as Worker secrets.
 */
export type Zapier = ReturnType<typeof createZapierSdk>;

let sdk: Zapier | undefined;

export function getZapier(): Zapier {
	const clientId = process.env.ZAPIER_CLIENT_ID;
	const clientSecret = process.env.ZAPIER_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		throw new Error(
			"Zapier client credentials are not configured. Set ZAPIER_CLIENT_ID and ZAPIER_CLIENT_SECRET as Worker secrets.",
		);
	}
	sdk ??= createZapierSdk({ credentials: { clientId, clientSecret } });
	return sdk;
}

export const GOOGLE_DRIVE_APP = "google-drive";

/**
 * Resolve the Google Drive connection id once and cache it. An explicit
 * ZAPIER_GOOGLE_DRIVE_CONNECTION_ID secret takes precedence; otherwise we look
 * up the first Google Drive connection on the account.
 */
let connectionIdPromise: Promise<string> | undefined;

export function resolveDriveConnectionId(zapier: Zapier): Promise<string> {
	const override = process.env.ZAPIER_GOOGLE_DRIVE_CONNECTION_ID;
	if (override) return Promise.resolve(override);

	const pending =
		connectionIdPromise ??
		zapier
			.findFirstConnection({ app: GOOGLE_DRIVE_APP, owner: "me" })
			.then((res: { data?: { id?: string } }) => {
				const id = res.data?.id;
				if (!id) {
					throw new Error(
						"No Google Drive connection found in Zapier. Connect Google Drive at https://zapier.com/app/connections.",
					);
				}
				return id;
			})
			.catch((err: unknown) => {
				// Don't cache failures — allow the next call to retry.
				connectionIdPromise = undefined;
				throw err;
			});

	connectionIdPromise = pending;
	return pending;
}
