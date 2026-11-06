# Deployment and history continuity

The review branch has not been merged or deployed. `render.yaml` retains automatic deployment on main, so merging may change the hosted application.

## Continuous paper worker hosting

Deploy the complete Node/Express project, not only public/index.html. Use Node 22 or 24, npm ci, npm run check, npm test and npm start. Configure a persistent private STOCK_DATA_DIR and a random PAPER_ADMIN_TOKEN of at least 24 characters in the hosting environment, not Git or a browser URL. Open SERVER PAPER, enter the token and press Start paper worker. Start only after storage is verified; enabled state persists and resumes after restart. Without a configured token it cannot run or be enabled. Pause stops all simulated monitoring, including exits.

Run one application instance with one persistent local filesystem. The worker serializes cycles and file transactions protect the ledger, but multiple workers do not provide coordinated market sampling or distributed scheduling. Background execution requires the hosting process to stay running. Hostinger plan availability, data persistence, request limits and process uptime must be checked on the actual account; no Hostinger deployment has been performed.

The operator token protects worker changes only. Status, simulated holdings, research and history exports are readable by visitors to this app, just like its existing research endpoints. Use hosting-level access protection if the research must be private. Never import real brokerage holdings or credentials into this public research application. Existing browser account histories remain browser-local.

New server paper state is us-server-paper.json under STOCK_DATA_DIR, with a prior-good .backup. No reset/delete endpoint is provided. Preserve both on backup and rollback. Do not change the fixed policy version over an existing ledger without a migration design. The Windows launcher binds only to loopback and keeps its chosen operator key in the child process environment, never in a file. It prints the owned server process ID for later shutdown; pause the worker first.

Before a hosted update:

1. Download raw browser history, including backups, from every hosted origin and browser profile used for paper trading. Preserve exact strings even when malformed. A development-origin export does not back up hosted accounts: localStorage is scoped to origin and profile.
2. Check cash, holdings and closed history against exports. Never reset an unreadable account to make an update work. Inspect a copy while retaining the original.
3. Identify the hosted `STOCK_DATA_DIR`, take a verified backup and establish persistence across restart/redeploy. Ephemeral storage does not provide durable learning history. No hosted disk or plan was provisioned or verified here.
4. Confirm the deployment commit and checks. Recheck health, listing freshness, calendar coverage, balances, exports and competing-tab read-only behaviour.

Browser histories stay local and are not uploaded by learning. HTTPS or loopback is needed for Web Locks; unsupported contexts remain read-only. Owner closure followed by reload was tested. A page restored from back/forward cache may need reload to reclaim ownership.

Server array writes use a local exclusive lock, prior-good backup, fsync and atomic rename. Unreadable history or an interrupted writer blocks writes. Stop the app, preserve the original, inspect the lock owner and compare verified backups before recovery. Never blindly delete a lock or replace history with an empty array. This is single-filesystem protection, not a distributed lock/database.

Listing snapshots, observations and private exports are excluded from Git. A code rollback does not roll back browser data; preserve history and check schema compatibility before rollback.
