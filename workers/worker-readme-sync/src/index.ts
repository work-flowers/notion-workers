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

interface GitHubDirEntry {
	name: string;
	path: string;
	type: string;
}

interface GitHubFileResponse {
	content: string;
	encoding: string;
}

interface CommitAuthor {
	name: string;
	email: string;
	date: string;
}

interface CommitInfo {
	sha: string;
	commit: {
		author: CommitAuthor;
		committer: CommitAuthor;
		message: string;
	};
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
	allowedRequests: 60,
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

async function fetchFile(path: string): Promise<string | null> {
	await githubPacer.wait();
	const url = API_BASE + "/contents/" + path + "?ref=" + GITHUB_BRANCH;
	const response = await fetch(url, { headers: githubHeaders() });
	if (response.status === 404) return null;
	if (!response.ok) {
		console.log("GitHub API error fetching " + path + ": " + response.status);
		return null;
	}
	const data = (await response.json()) as GitHubFileResponse;
	if (data.encoding === "base64") {
		return Buffer.from(data.content, "base64").toString("utf-8");
	}
	return data.content || null;
}

async function fetchCommits(path: string): Promise<CommitInfo[]> {
	await githubPacer.wait();
	const url = API_BASE + "/commits?path=" + path + "&per_page=100&sha=" + GITHUB_BRANCH;
	const response = await fetch(url, { headers: githubHeaders() });
	if (!response.ok) {
		console.log("GitHub API error fetching commits for " + path + ": " + response.status);
		return [];
	}
	return (await response.json()) as CommitInfo[];
}

function parseCapabilities(source: string): string[] {
	const caps: string[] = [];
	if (source.includes("worker.sync(")) caps.push("sync");
	if (source.includes("worker.tool(")) caps.push("tool");
	if (source.includes("worker.webhook(")) caps.push("webhook");
	return caps;
}

worker.sync("readmeSync", {
	database: db,
	mode: "replace",
	schedule: "12h",
	execute: async () => {
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
			// 1. Fetch README.md for page body
			const readmeContent = await fetchFile(dir.path + "/README.md") || "";

			// 2. Fetch workers.json for worker ID and deployment status
			const workersJsonContent = await fetchFile(dir.path + "/workers.json");
			let workerId = "";
			let deployed = false;
			if (workersJsonContent) {
				try {
					const wj = JSON.parse(workersJsonContent);
					workerId = wj.workerId || "";
					deployed = Boolean(workerId);
				} catch {
					console.log("Failed to parse workers.json for " + dir.name);
				}
			}

			// 3. Fetch src/index.ts for capabilities
			const sourceContent = await fetchFile(dir.path + "/src/index.ts") || "";
			const capabilities = parseCapabilities(sourceContent);

			// 4. Fetch commits for created/updated dates and author
			const commits = await fetchCommits(dir.path);
			let createdDate = "";
			let updatedDate = "";
			let updatedByEmail = "";
			if (commits.length > 0) {
				const latestCommit = commits[0];
				updatedDate = latestCommit.commit.author.date;
				updatedByEmail = latestCommit.commit.author.email;
				const firstCommit = commits[commits.length - 1];
				createdDate = firstCommit.commit.author.date;
			}

			const githubUrl = WEB_BASE + "/tree/" + GITHUB_BRANCH + "/" + dir.path;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const properties: any = {
				"Worker Name": Builder.title(dir.name),
				"Worker ID": Builder.richText(workerId),
				"GitHub URL": Builder.url(githubUrl),
				"Deployed": Builder.checkbox(deployed),
			};

			if (createdDate) {
				properties["Created"] = Builder.dateTime(createdDate);
			}

			if (updatedDate) {
				properties["Last Updated"] = Builder.dateTime(updatedDate);
			}

			if (updatedByEmail) {
				properties["Updated By"] = Builder.people(updatedByEmail);
			}

			if (capabilities.length > 0) {
				properties["Capabilities"] = Builder.multiSelect(...capabilities);
			}

			changes.push({
				type: "upsert" as const,
				key: dir.name,
				properties,
				pageContentMarkdown: readmeContent || undefined,
				upstreamUpdatedAt: updatedDate || undefined,
			});
		}

		return {
			changes,
			hasMore: false,
		};
	},
});
