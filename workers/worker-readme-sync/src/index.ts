import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";

const worker = new Worker();
export default worker;

const GITHUB_OWNER = "work-flowers";
const GITHUB_REPO = "notion-workers";
const GITHUB_BRANCH = "main";
const API_BASE = "https://api.github.com/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO;
const WEB_BASE = "https://github.com/" + GITHUB_OWNER + "/" + GITHUB_REPO;

interface DeploymentMetadata {
	workerId: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	updatedByName: string;
	capabilities: string[];
}

interface GitHubDirEntry {
	name: string;
	path: string;
	type: string;
}

interface GitHubFileResponse {
	content: string;
	encoding: string;
}

const db = worker.database("workers", {
	type: "managed",
	initialTitle: "Notion Workers",
	primaryKeyProperty: "Worker Name",
	schema: {
		databaseIcon: Builder.emojiIcon("🔧"),
		properties: {
			"Worker Name": Schema.title(),
			"Worker ID": Schema.richText(),
			"GitHub URL": Schema.url(),
			"Created": Schema.date(),
			"Last Updated": Schema.date(),
			"Updated By": Schema.people(),
			"Capabilities": Schema.multiSelect([
				{ name: "sync", color: "blue" },
				{ name: "tool", color: "green" },
				{ name: "webhook", color: "orange" },
			]),
			"Deployed": Schema.checkbox(),
		},
	},
});

const githubPacer = worker.pacer("github", {
	allowedRequests: 30,
	intervalMs: 60000,
});

function githubHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (process.env.GITHUB_TOKEN) {
		headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
	}
	return headers;
}

function parseDeploymentMetadata(): Record<string, DeploymentMetadata> {
	const map: Record<string, DeploymentMetadata> = {};
	try {
		const raw = process.env.WORKERS_METADATA || "[]";
		const list = JSON.parse(raw) as DeploymentMetadata[];
		for (const w of list) {
			map[w.name] = w;
		}
	} catch (e) {
		console.log("Failed to parse WORKERS_METADATA:", e);
	}
	return map;
}

const EMAIL_MAP: Record<string, string> = {
	"Dennis": "dennis@work.flowers",
};

worker.sync("readmeSync", {
	database: db,
	mode: "replace",
	schedule: "12h",
	execute: async () => {
		const deploymentData = parseDeploymentMetadata();

		// Fetch worker directories from GitHub
		await githubPacer.wait();
		const dirUrl = API_BASE + "/contents/workers?ref=" + GITHUB_BRANCH;
		const dirResponse = await fetch(dirUrl, { headers: githubHeaders() });
		if (!dirResponse.ok) {
			throw new Error("GitHub API error listing workers: " + dirResponse.status + " " + dirResponse.statusText);
		}
		const dirs = (await dirResponse.json()) as GitHubDirEntry[];
		const workerDirs = dirs.filter((d) => d.type === "dir");

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const changes: any[] = [];

		for (const dir of workerDirs) {
			await githubPacer.wait();
			const readmeUrl = API_BASE + "/contents/" + dir.path + "/README.md?ref=" + GITHUB_BRANCH;
			const readmeResponse = await fetch(readmeUrl, { headers: githubHeaders() });

			let readmeContent = "";
			if (readmeResponse.ok) {
				const readmeData = (await readmeResponse.json()) as GitHubFileResponse;
				if (readmeData.encoding === "base64") {
					readmeContent = Buffer.from(readmeData.content, "base64").toString("utf-8");
				}
			} else {
				console.log("No README.md found for " + dir.name + " (" + readmeResponse.status + ")");
			}

			const deployed = deploymentData[dir.name];
			const githubUrl = WEB_BASE + "/tree/" + GITHUB_BRANCH + "/" + dir.path;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const properties: any = {
				"Worker Name": Builder.title(dir.name),
				"Worker ID": Builder.richText(deployed?.workerId || ""),
				"GitHub URL": Builder.url(githubUrl),
				"Deployed": Builder.checkbox(Boolean(deployed)),
			};

			if (deployed?.createdAt) {
				properties["Created"] = Builder.dateTime(deployed.createdAt);
			}

			if (deployed?.updatedAt) {
				properties["Last Updated"] = Builder.dateTime(deployed.updatedAt);
			}

			if (deployed?.updatedByName && EMAIL_MAP[deployed.updatedByName]) {
				properties["Updated By"] = Builder.people(EMAIL_MAP[deployed.updatedByName]);
			}

			if (deployed?.capabilities && deployed.capabilities.length > 0) {
				properties["Capabilities"] = Builder.multiSelect(...deployed.capabilities);
			}

			changes.push({
				type: "upsert" as const,
				key: dir.name,
				properties,
				pageContentMarkdown: readmeContent || undefined,
				upstreamUpdatedAt: deployed?.updatedAt,
			});
		}

		return {
			changes,
			hasMore: false,
		};
	},
});
