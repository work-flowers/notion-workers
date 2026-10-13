# 1Password secret references (workFlowers account) — safe to commit.
# Run with:  op run --account work-flowers.1password.com --env-file=.env.tpl -- <your command>

TYPESAFE_API_KEY=op://Private/jev-notion-meeting-note-tasks/credential

# Local runs only. When a Custom Agent calls the tools, the platform supplies a
# token scoped to the agent's permissions, so don't set this on the worker.
NOTION_API_TOKEN=op://Private/notion-worker-automations/credential
