import { createZapierSdk } from "@zapier/zapier-sdk";
import {
	createZapierSdk as createExperimentalSdk,
	createZapierApi,
	ZAPIER_BASE_URL,
} from "@zapier/zapier-sdk/experimental";

/**
 * Two Zapier clients, both off the same client-credentials pair.
 *
 * - `sdk()` is the stable surface. Used only for `fetch`, which proxies an
 *   arbitrary HTTP request through a stored connection so we never hold a
 *   Notion token or a GitHub PAT ourselves.
 * - `experimentalSdk()` is the Code Workflows surface (`listWorkflows` and
 *   friends). It exists **only** on `@zapier/zapier-sdk@0.9x` — the workflow
 *   methods are absent from 0.53.x, and 1.x drops the `./experimental` subpath
 *   from its exports map altogether. See package.json for the pin.
 * - `zapierApi()` is the authenticated client those methods call internally,
 *   for the one endpoint whose SDK response schema is stricter than the API
 *   (see `listRunsPage`).
 */

function credentials() {
	const clientId = process.env.ZAPIER_CLIENT_ID;
	const clientSecret = process.env.ZAPIER_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		throw new Error("ZAPIER_CLIENT_ID and ZAPIER_CLIENT_SECRET must be set");
	}
	return { clientId, clientSecret };
}

let stable: ReturnType<typeof createZapierSdk> | undefined;
let experimental: ReturnType<typeof createExperimentalSdk> | undefined;

export function sdk() {
	stable ??= createZapierSdk({ credentials: credentials() });
	return stable;
}

export function experimentalSdk() {
	experimental ??= createExperimentalSdk({ credentials: credentials() });
	return experimental;
}

let api: ReturnType<typeof createZapierApi> | undefined;

export function zapierApi() {
	api ??= createZapierApi({ baseUrl: ZAPIER_BASE_URL, credentials: credentials() });
	return api;
}

/** Anything with an awaitable `wait()` — satisfied by `worker.pacer(...)`. */
export type Pacer = { wait: () => Promise<void> };

export function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} must be set`);
	return value;
}
