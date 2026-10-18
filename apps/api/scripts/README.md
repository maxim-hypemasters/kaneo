# Release progress demo data

`seed-release-progress.ts` adds three labelled demo releases with six features,
30 tasks, and simulated progress history to one existing project. It requires
explicit local PostgreSQL configuration through `DATABASE_URL` or `POSTGRES_*`
environment variables and refuses remote database hosts.

Run from `apps/api` in the configured local development container:

```sh
pnpm exec tsx scripts/seed-release-progress.ts \
  --project YOUR_PROJECT_ID \
  --workspace YOUR_WORKSPACE_ID \
  --today 2026-10-18
```

- `--project` and `--today` are required. Dates are relative to the supplied
  calendar day, so choose the day the samples should represent.
- `--workspace` is optional and verifies the target project's workspace.
- The default is a dry-run: it reports the target and planned counts without
  changing records. Add `--apply` to the same command to write the samples.

The releases are named `Demo · 0.68`, `Demo · 0.70`, and `Demo · 0.71`; sample
items use `Demo ·` titles. Their descriptions identify them as **Demo data with
simulated progress history**. The past and active releases contain illustrative
history; the upcoming release has planned scope without future chart points.

Stable IDs make reruns skip each existing demo release in full, preserving later
renames, edits, and deleted tasks. Existing project items and their histories are
preserved, and new items reserve numbers through the project counter. Historical
workflow snapshots are added only when the script's guard confirms they cannot
affect earlier tracked real releases.

Reload the browser after applying: this developer script writes directly to
PostgreSQL and does not publish WebSocket cache updates.
