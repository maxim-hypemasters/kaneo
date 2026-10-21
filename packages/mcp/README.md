# Kaneo MCP server

[`@kaneo/mcp`](https://www.npmjs.com/package/@kaneo/mcp) is the official MCP (Model Context Protocol) server for [Kaneo](https://kaneo.app), the open source project management platform. It is maintained in the [usekaneo/kaneo](https://github.com/usekaneo/kaneo) monorepo and published to npm by the Kaneo team.

It runs over stdio, signs in with Kaneo's device flow, and then calls the Kaneo API with a bearer token. The package lives in `packages/mcp` in this monorepo and exposes the `kaneo-mcp` CLI.

> **Tip:** Every Kaneo instance also ships a built-in HTTP MCP endpoint at `/api/mcp`. If your MCP client supports Streamable HTTP transport (e.g. Claude Code), you can connect directly without this package. See the [MCP docs](https://kaneo.app/docs/core/integrations/mcp) for details.

## Prerequisites

- Node.js 24+
- A running Kaneo API (for example `http://localhost:1337`) and web app (for device approval UI).

Kaneo allows `kaneo-cli` and `kaneo-mcp` by default, so you usually do not need extra server configuration.

If you want to run this server with a different client ID, allow it on the Kaneo server:

```bash
DEVICE_AUTH_CLIENT_IDS=kaneo-cli,kaneo-mcp,your-client-id
```

## Environment

| Variable | Description |
|----------|-------------|
| `KANEO_API_URL` | Kaneo API origin (default `http://localhost:1337`). Do not include `/api`. |
| `KANEO_MCP_CLIENT_ID` | Device-flow client id (default `kaneo-mcp`). Must match `DEVICE_AUTH_CLIENT_IDS` on the server. |
| `KANEO_API_KEY` | **Optional.** A Kaneo API key (create one under Settings → Account → Developer). When set, the server authenticates with it as a Bearer token and skips the interactive device flow. Use this for headless/Docker setups. |

## Install

**Recommended (no global install):** run the interactive installer with npx:

```bash
npx @kaneo/mcp
```

npm downloads the package, then an **interactive menu** (arrow keys + Enter) asks **where** to register the server (Cursor user-wide, Cursor project, Claude Desktop, or a custom JSON path). It then merges a `mcpServers` entry that points at this package’s `dist/index.js` with your current Node binary.

In a normal terminal, `npx @kaneo/mcp` and `kaneo-mcp` with no subcommand both start the installer. When the process is **not** attached to a TTY (for example when Cursor launches the MCP server with a pipe), the same entry runs the stdio MCP server instead.

To run the server manually from a shell (for example to debug stdio), use:

```bash
npx @kaneo/mcp serve
```

If you prefer a global install:

```bash
npm install -g @kaneo/mcp
kaneo-mcp
```

(`kaneo-mcp install` is the same installer with an explicit subcommand.)

Non-interactive example (Cursor user config, skip overwrite prompts):

```bash
kaneo-mcp install --target cursor-user -y
```

Point at a self-hosted API when generating the config:

```bash
kaneo-mcp install --target cursor-user -y --api-url https://kaneo.example.com
```

See all options:

```bash
kaneo-mcp install --help
```

If you are currently inside the local `packages/mcp` package directory, npm may resolve the local workspace package instead of the published one and fail to expose the bin. In that case, either run `npx` from outside `packages/mcp`, or use a local build:

```bash
node dist/index.js
```

The published package includes `dist/`. `prepublishOnly` runs the build before publish.

## Develop from source

From the repo root:

```bash
pnpm install
pnpm --filter @kaneo/mcp run build
pnpm --filter @kaneo/mcp run start
pnpm --filter @kaneo/mcp run test
```

Or run it from the package directory:

```bash
pnpm -C packages/mcp run build
```

The CLI entry points to `./dist/index.js`. Use `npx @kaneo/mcp` or `kaneo-mcp` after a global install so your IDE config points at the resolved path.

## Authentication

On the first tool call that needs Kaneo, the server:

1. Requests a device code from `POST /api/auth/device/code`
2. Prints the verification URL and user code to `stderr`
3. Tries to open the browser
4. Polls `POST /api/auth/device/token` until approved
5. Stores the access token at `~/.config/kaneo-mcp/credentials.json` with mode `0600`

### Non-interactive (API key)

For headless or sandboxed environments where opening a browser is impractical, set `KANEO_API_KEY` to a key created under Settings → Account → Developer. The server sends it as a Bearer token on every request and skips the device flow entirely, so no token is cached to disk.

## Tools

- Session: `whoami`, `list_workspaces`, `list_workspace_members`, `list_notifications`
- Search: `search`
- Projects: `list_projects`, `get_project`, `create_project`, `update_project`, `list_project_columns`
- Tasks: `list_tasks`, `get_task`, `get_task_by_ticket_id`, `create_task`, `duplicate_task`, `update_task`, `delete_task`, `move_task`, `update_task_status`, `update_task_assignee`, `update_task_due_date`, `list_task_activity`
- Features: `list_features`, `archive_feature`, `set_task_feature`; Task/Bug conversion: `set_task_type`
- Milestones: `list_project_milestones`, `list_milestones`, `get_milestone`, `create_milestone`, `update_milestone`, `delete_milestone`, `reorder_milestones`, `set_task_milestone`
- Releases: `list_releases`, `get_release`, `create_release`, `update_release`, `delete_release`, `set_task_release`, `move_unfinished_release_items`
- Time entries: `list_task_time_entries`, `get_time_entry`, `create_time_entry`, `update_time_entry`
- Comments: `list_task_comments`, `create_task_comment`, `update_task_comment`, `delete_task_comment`
- Labels: `list_workspace_labels`, `create_label`, `attach_label_to_task`, `detach_label_from_task`, `delete_label`
- Task relations: `create_task_relation`, `get_task_relations`, `delete_task_relation`

Call `list_project_columns` before setting a status: the column slugs it
returns are the values `create_task` and `update_task_status` accept.
Call `get_task_by_ticket_id` with a key such as `KAN-12` to retrieve one task
without listing a project. If the same key identifies multiple accessible tasks,
pass `workspaceId` or `projectId` to select one.
`list_workspace_members` resolves the user IDs the assignee tools expect.
Time entries have no delete endpoint on the API, so there is no
`delete_time_entry` tool.

A Feature retains its task-resource identity with `type: "feature"`, and is a
knowledge record containing documentation, resources, milestones and implementation
history. Its status, priority, assignee, dates and release are null. Create one
with `create_task` and `type: "feature"`, omitting planning fields. Browse active or
archived Features with `list_features`; `archive_feature` changes only the
Feature's archive state. `set_task_feature` assigns Tasks/Bugs to a same-project
Feature or clears membership with null. `set_task_type` converts only Task ↔ Bug.
`update_task` can edit Feature knowledge fields without supplying planning values.

`type: "bug"` creates or classifies a Bug, with the same workflow, Feature and
release behavior as a Task. `create_task` accepts Task, Bug and Feature. `set_task_type` converts Task and Bug into each other; Features cannot be converted.
`list_tasks` accepts an exact `type` filter, so `type: "task"` excludes Bugs.
Reads retain the item's explicit type. Creating or converting Bugs requires a
server that supports them; ordinary `update_task` calls preserve the type.

A milestone belongs to one Feature and has a title, optional description, read-only start/end dates, Milestone Lead (`leadId`), read-only derived `status`, `priority`, nullable `releaseId`, manual ordering, and automatic `{total, started, completed}` progress. Status is Done when all nonarchived linked work is Done and at least one item exists, In Progress when any work is active or completed, and To Do otherwise. Activity follows the project workflow’s nonfinal-column order and Done flags. Mixed Done/To Do work is In Progress because completed work counts as started. Progress keeps its existing inclusion of archived work. `list_project_milestones` provides bounded paginated summaries including Feature titles. `list_milestones` takes `featureId`. `create_milestone` appends to that Feature and optionally accepts unique `taskIds` to atomically link existing Tasks/Bugs already in it, reassigning previous milestones. Invalid selections create nothing; `update_milestone` changes only provided fields, with null clearing optional fields. The `YYYY-MM-DD` dates are derived from nonarchived linked Tasks/Bugs, using one day for work with only one date and null for no dated work. They span releases and ignore display filters; progress still includes archived work. Milestone tools returning metadata accept optional `timeZone`, defaulting to UTC. Create/update tools do not accept status, column or date inputs. `reorder_milestones` takes the complete ordered `milestoneIds` array; duplicate and stale lists are rejected.

`create_task` accepts `milestoneId` with `featureId`, and `set_task_milestone` assigns a Task/Bug to a milestone of its existing Feature or clears it with null. Assignment never moves Feature membership. `list_tasks` accepts `featureId` and `milestoneId` filters before pagination, with `none` selecting unassigned items. Deleting a milestone keeps linked work in its Feature and Release. Management and assignment use task update permission; progress reads use task read permission and include archived items independently of filters.

A release is a planned delivery in one project, with a start, a code freeze and
a submission date (`YYYY-MM-DD`, in that order) and progress counts. Its phase
isn't stored: compare today with the three dates. Every task carries a
`releaseId` (or `null`). `set_task_release` sets an explicit Task/Bug release.
New work inherits its milestone's release when omitted; explicit values, including
null, win. Assigning existing work inherits a milestone release only when currently
unassigned. Changing a milestone release moves linked work whose release matches
its prior release, preserving overrides. Clearing or deleting a milestone preserves
child releases. `list_tasks` filters by `releaseId`, or `none`.
`move_unfinished_release_items` moves the items that aren't done to another
release, or out of every release. Creating and updating releases needs
permission to update the project, and deleting one also needs permission to
edit tasks. Owners and admins have both by default.

`create_task_relation` still accepts the deprecated `subtask` relation type,
which puts the target into the source's feature, and `get_task_relations` lists
feature links as `subtask` entries. Prefer `set_task_feature` and the task's
`featureId`.

## Releasing

Bump `version` in `packages/mcp/package.json` and merge to `main`. The [publish workflow](../../.github/workflows/publish-mcp.yml) runs the package tests, publishes the new version to npm, and creates a `mcp-v<version>` GitHub release. Nothing is published while the version stays the same, so tool changes reach npm only once the version is bumped.

Publishing a GitHub release manually also works: tag it `mcp-v<version>` with the tag version matching `packages/mcp/package.json` on the tagged commit.
