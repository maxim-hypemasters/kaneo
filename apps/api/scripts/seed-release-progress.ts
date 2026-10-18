import { pathToFileURL } from "node:url";
import { Pool, type PoolClient } from "pg";
import { resolveDatabaseConfig } from "../src/database/resolve-database-url";
import {
  buildDemoPlan,
  DEMO_DESCRIPTION,
  demoPrefix,
  shiftDay,
  type DemoRelease,
} from "./release-progress-demo-plan";

type SeedOptions = {
  projectId: string;
  today: string;
  apply: boolean;
  workspaceId?: string;
};
type Column = { id: string; slug: string; position: number; is_final: boolean };

function parseOptions(args: string[]): SeedOptions {
  const values = new Map<string, string>();
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]!;
    if (name === "--apply") {
      apply = true;
      continue;
    }
    if (
      !["--project", "--today", "--workspace"].includes(name) ||
      !args[index + 1] ||
      args[index + 1]!.startsWith("--")
    ) {
      throw new Error(
        "Usage: tsx scripts/seed-release-progress.ts --project ID --today YYYY-MM-DD [--workspace ID] [--apply]",
      );
    }
    if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
    values.set(name, args[++index]!);
  }
  const projectId = values.get("--project");
  const today = values.get("--today");
  if (!projectId || !today)
    throw new Error(
      "Both --project and --today are required; --apply enables writes",
    );
  shiftDay(today, 0);
  if (today > shiftDay(new Date().toISOString().slice(0, 10), 1))
    throw new Error("--today cannot be in the future");
  return { projectId, today, workspaceId: values.get("--workspace"), apply };
}

async function insertRelease(
  client: PoolClient,
  release: DemoRelease,
  projectId: string,
) {
  await client.query(
    `
    INSERT INTO "release" (id, project_id, name, description, start_date, code_freeze_date, submission_date, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz AT TIME ZONE 'UTC')
  `,
    [
      release.id,
      projectId,
      release.name,
      `${DEMO_DESCRIPTION}. ${release.phase} release sample.`,
      release.startDate,
      release.codeFreezeDate,
      release.submissionDate,
      `${release.trackingDay}T00:00:00Z`,
    ],
  );
}

async function insertItems(
  client: PoolClient,
  release: DemoRelease,
  projectId: string,
  columns: Column[],
  firstNumber: number,
  firstPosition: number,
) {
  const bySlug = new Map(columns.map((column) => [column.slug, column]));
  for (const [index, item] of release.items.entries()) {
    const createdDay = item.stages[0]?.date ?? release.trackingDay;
    const updatedDay = item.stages.at(-1)?.date ?? createdDay;
    await client.query(
      `
      INSERT INTO task (id, project_id, number, position, title, description, status, column_id, priority, type, feature_id, release_id, created_at, updated_at, due_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13::timestamptz AT TIME ZONE 'UTC', $14::timestamptz AT TIME ZONE 'UTC', $15::timestamptz AT TIME ZONE 'UTC')
    `,
      [
        item.id,
        projectId,
        firstNumber + index,
        firstPosition + index,
        item.title,
        DEMO_DESCRIPTION,
        item.status,
        bySlug.get(item.status)?.id ?? null,
        ["high", "medium", "low"][index % 3],
        item.type,
        item.featureId,
        release.id,
        `${createdDay}T12:00:00Z`,
        `${updatedDay}T12:00:00Z`,
        `${release.submissionDate}T12:00:00Z`,
      ],
    );
  }
}

async function insertSimulatedHistory(
  client: PoolClient,
  release: DemoRelease,
) {
  // Only a release inserted by this transaction reaches this function. Its
  // trigger-generated current snapshot is replaced with explicit demo history.
  await client.query(
    "DELETE FROM release_progress_event WHERE release_id = $1",
    [release.id],
  );
  await client.query(
    "INSERT INTO release_progress_event (release_id, recorded_at, status, delta) VALUES ($1, $2, NULL, 0)",
    [release.id, `${release.trackingDay}T00:00:00Z`],
  );
  for (const item of release.items) {
    let previous: string | undefined;
    for (const stage of item.stages) {
      const recordedAt = `${stage.date}T12:00:00Z`;
      if (previous) {
        await client.query(
          "INSERT INTO release_progress_event (release_id, recorded_at, status, delta) VALUES ($1, $2, $3, -1)",
          [release.id, recordedAt, previous],
        );
      }
      await client.query(
        "INSERT INTO release_progress_event (release_id, recorded_at, status, delta) VALUES ($1, $2, $3, 1)",
        [release.id, recordedAt, stage.status],
      );
      previous = stage.status;
    }
  }
}

export async function seedReleaseProgress(
  client: PoolClient,
  options: SeedOptions,
) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    const {
      rows: [project],
    } = await client.query<{
      id: string;
      name: string;
      workspace_id: string;
      last_task_number: number;
      archived_at: Date | null;
    }>(
      "SELECT id, name, workspace_id, last_task_number, archived_at FROM project WHERE id = $1 FOR UPDATE",
      [options.projectId],
    );
    if (!project) throw new Error("Target project was not found");
    if (project.archived_at) throw new Error("The target project is archived");
    if (options.workspaceId && project.workspace_id !== options.workspaceId)
      throw new Error("Target project is outside the expected workspace");
    const plan = buildDemoPlan(project.id, options.today);
    const existing = await client.query<{ id: string; project_id: string }>(
      'SELECT id, project_id FROM "release" WHERE id = ANY($1::text[])',
      [plan.map((release) => release.id)],
    );
    if (existing.rows.some((release) => release.project_id !== project.id))
      throw new Error("A demo ID belongs to a different project");
    const existingIds = new Set(existing.rows.map((release) => release.id));
    const additions = plan.filter((release) => !existingIds.has(release.id));
    const summary = {
      mode: options.apply ? "apply" : "dry-run",
      project: { id: project.id, name: project.name },
      today: options.today,
      create: {
        releases: additions.length,
        features: additions.length * 2,
        tasks: additions.length * 10,
      },
      skippedReleases: existingIds.size,
      simulatedHistory: true,
    };
    if (additions.length === 0) {
      await client.query("ROLLBACK");
      return summary;
    }
    const collisions = await client.query(
      'SELECT id FROM "release" WHERE project_id = $1 AND name = ANY($2::text[])',
      [project.id, additions.map((release) => release.name)],
    );
    if (collisions.rowCount)
      throw new Error(
        "A planned demo release name is already used by another release",
      );
    const existingItems = await client.query(
      "SELECT id FROM task WHERE id = ANY($1::text[])",
      [additions.flatMap((release) => release.items.map((item) => item.id))],
    );
    if (existingItems.rowCount)
      throw new Error(
        "Some demo items already exist without their release; leaving them unchanged",
      );
    const { rows: columns } = await client.query<Column>(
      'SELECT id, slug, position, is_final FROM "column" WHERE project_id = $1 ORDER BY id FOR SHARE',
      [project.id],
    );
    const bySlug = new Map(columns.map((column) => [column.slug, column]));
    const firstNonfinal = [...columns]
      .filter((column) => !column.is_final)
      .sort(
        (left, right) =>
          left.position - right.position || left.id.localeCompare(right.id),
      )[0];
    if (
      firstNonfinal?.slug !== "to-do" ||
      ["to-do", "in-progress", "in-review", "done"].some(
        (status) => !bySlug.has(status),
      ) ||
      !bySlug.get("done")?.is_final ||
      ["to-do", "in-progress", "in-review"].some(
        (status) => bySlug.get(status)?.is_final,
      )
    ) {
      throw new Error(
        "Demo data requires the standard To Do, In Progress, In Review and final Done workflow",
      );
    }
    const earliestDay = additions
      .map((release) => release.trackingDay)
      .sort()[0]!;
    const earlierWorkflow = await client.query(
      "SELECT 1 FROM project_workflow_history WHERE project_id = $1 AND recorded_at <= $2 LIMIT 1",
      [project.id, `${earliestDay}T00:00:00Z`],
    );
    const needsWorkflowBaseline = !earlierWorkflow.rowCount;
    if (needsWorkflowBaseline) {
      const realHistory = await client.query(
        `
        SELECT 1 FROM release_progress_event AS event
        JOIN "release" AS release ON release.id = event.release_id
        WHERE release.project_id = $1 AND NOT starts_with(release.id, $2)
          AND event.status IS NULL AND event.recorded_at < $3 LIMIT 1
      `,
        [project.id, demoPrefix(project.id), `${options.today}T00:00:00Z`],
      );
      if (realHistory.rowCount)
        throw new Error(
          "Earlier real release history exists; refusing to simulate shared workflow history",
        );
    }
    if (!options.apply) {
      await client.query("ROLLBACK");
      return summary;
    }
    if (needsWorkflowBaseline) {
      // These earlier snapshots only support labelled demo releases. The guard
      // above ensures no real release has tracked points in this interval.
      for (const column of columns) {
        await client.query(
          "INSERT INTO project_workflow_history (project_id, column_id, recorded_at, slug, position, is_final, present) VALUES ($1, $2, $3, $4, $5, $6, true)",
          [
            project.id,
            column.id,
            `${earliestDay}T00:00:00Z`,
            column.slug,
            column.position,
            column.is_final,
          ],
        );
      }
    }
    const {
      rows: [range],
    } = await client.query<{ last_number: number; last_position: number }>(
      "SELECT coalesce(max(number), 0)::integer AS last_number, coalesce(max(position), 0)::integer AS last_position FROM task WHERE project_id = $1",
      [project.id],
    );
    let nextNumber = Math.max(project.last_task_number, range!.last_number) + 1;
    let nextPosition = range!.last_position + 1;
    if (
      nextNumber + additions.length * 12 >= 2_147_483_647 ||
      nextPosition + additions.length * 12 >= 2_147_483_647
    )
      throw new Error(
        "The project's task numbering or positions have reached their limit",
      );
    for (const release of additions) {
      await insertRelease(client, release, project.id);
      await insertItems(
        client,
        release,
        project.id,
        columns,
        nextNumber,
        nextPosition,
      );
      await insertSimulatedHistory(client, release);
      nextNumber += release.items.length;
      nextPosition += release.items.length;
    }
    await client.query(
      "UPDATE project SET last_task_number = $2 WHERE id = $1",
      [project.id, nextNumber - 1],
    );
    await client.query("COMMIT");
    return summary;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const config = resolveDatabaseConfig();
  if (
    config.source === "LOCAL_FALLBACK" ||
    !["postgres", "localhost", "127.0.0.1", "::1", "[::1]"].includes(
      config.host,
    )
  ) {
    throw new Error(
      "Demo seeding requires explicit configuration for a local PostgreSQL instance",
    );
  }
  const pool = new Pool({ connectionString: config.connectionString });
  try {
    const client = await pool.connect();
    try {
      console.log(
        JSON.stringify(await seedReleaseProgress(client, options), null, 2),
      );
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    // PostgreSQL errors can contain connection details or inserted data.
    console.error(
      error instanceof Error && !("code" in error)
        ? error.message
        : "Demo seed failed; the transaction was rolled back",
    );
    process.exitCode = 1;
  });
}
