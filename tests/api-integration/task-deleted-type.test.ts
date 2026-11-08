import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import bulkUpdateTasks from "../../apps/api/src/task/controllers/bulk-update-tasks";
import deleteTask from "../../apps/api/src/task/controllers/delete-task";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertTask } from "./helpers/release/insert-task";

const publish = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../apps/api/src/events", () => ({ publishEvent: publish }));

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
});

async function seedItems() {
  const { user, workspace } = await createWorkspaceMember();
  const { project } = await createProjectFixture({
    workspaceId: workspace.id,
  });
  const feature = await insertTask(project.id, {
    type: "feature",
    title: "Checkout",
  });
  const bug = await insertTask(project.id, {
    type: "bug",
    title: "Retry payments",
  });
  const task = await insertTask(project.id, { title: "Copy tweaks" });
  return { user, items: [feature, bug, task] };
}

describe("task.deleted carries the deleted item's type", () => {
  it("for a single delete", async () => {
    const { user, items } = await seedItems();
    const [feature] = items;

    await deleteTask(feature.id, user.id);

    expect(publish).toHaveBeenCalledWith(
      "task.deleted",
      expect.objectContaining({ taskId: feature.id, taskType: "feature" }),
    );
  });

  it("for every item of a bulk delete", async () => {
    const { user, items } = await seedItems();

    await bulkUpdateTasks({
      taskIds: items.map((item) => item.id),
      operation: "delete",
      userId: user.id,
    });

    for (const item of items) {
      expect(publish).toHaveBeenCalledWith(
        "task.deleted",
        expect.objectContaining({
          taskId: item.id,
          title: item.title,
          taskType: item.type,
        }),
      );
    }
  });
});
