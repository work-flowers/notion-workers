# 1Password secret references — safe to commit.
# Run with:  op run --env-file=.env.tpl -- <your command>
#
# Create the item first — see "Zapier client credentials" in CLAUDE.md.

ZAPIER_CLIENT_ID=op://Employee/zapier-gdrive-tools/client id
ZAPIER_CLIENT_SECRET=op://Employee/zapier-gdrive-tools/client secret

# Optional: pin the Zapier Google Drive connection instead of taking the first
# one on the account. Not a secret — the plain id can be set with
# `ntn workers env set ZAPIER_GOOGLE_DRIVE_CONNECTION_ID <uuid>`.
# ZAPIER_GOOGLE_DRIVE_CONNECTION_ID=02eb8724-3fc7-8edc-9b30-be83af0b327f
