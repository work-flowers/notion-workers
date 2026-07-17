import { createZapierSdk } from "@zapier/zapier-sdk";

const zapier = createZapierSdk({
	credentials: {
		clientId: process.env.ZAPIER_CLIENT_ID!,
		clientSecret: process.env.ZAPIER_CLIENT_SECRET!,
	},
});

const { data } = await (zapier as any).listConnections({ owner: "me" });
for (const c of data ?? []) {
	const label = String(c.label ?? c.title ?? "");
	if (/mcp/i.test(label) || /mcp/i.test(JSON.stringify(c))) {
		console.log(JSON.stringify(c, null, 2));
	}
}
