# Deployment and history continuity

The review branch has not been merged or deployed. `render.yaml` retains automatic deployment on main, so merging may change the hosted application.

Before a hosted update:

1. Download raw browser history, including backups, from every hosted origin and browser profile used for paper trading. Preserve exact strings even when malformed. A development-origin export does not back up hosted accounts: localStorage is scoped to origin and profile.
2. Check cash, holdings and closed history against exports. Never reset an unreadable account to make an update work. Inspect a copy while retaining the original.
3. Identify the hosted `STOCK_DATA_DIR`, take a verified backup and establish persistence across restart/redeploy. Ephemeral storage does not provide durable learning history. No hosted disk or plan was provisioned or verified here.
4. Confirm the deployment commit and checks. Recheck health, listing freshness, calendar coverage, balances, exports and competing-tab read-only behaviour.

Browser histories stay local and are not uploaded by learning. HTTPS or loopback is needed for Web Locks; unsupported contexts remain read-only. Owner closure followed by reload was tested. A page restored from back/forward cache may need reload to reclaim ownership.

Server array writes use a local exclusive lock, prior-good backup, fsync and atomic rename. Unreadable history or an interrupted writer blocks writes. Stop the app, preserve the original, inspect the lock owner and compare verified backups before recovery. Never blindly delete a lock or replace history with an empty array. This is single-filesystem protection, not a distributed lock/database.

Listing snapshots, observations and private exports are excluded from Git. A code rollback does not roll back browser data; preserve history and check schema compatibility before rollback.
