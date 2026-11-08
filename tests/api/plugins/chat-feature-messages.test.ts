import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import * as discord from "../../../apps/api/src/plugins/discord/events";
import * as mattermost from "../../../apps/api/src/plugins/mattermost/events";
import * as slack from "../../../apps/api/src/plugins/slack/events";
import * as telegram from "../../../apps/api/src/plugins/telegram/events";

const m = vi.hoisted(() => ({
  select: vi.fn(),
  slack: vi.fn(),
  discord: vi.fn(),
  telegram: vi.fn(),
  mattermost: vi.fn(),
}));
vi.mock("../../../apps/api/src/database", () => ({
  default: { select: m.select },
}));
vi.mock("../../../apps/api/src/plugins/slack/client", () => ({
  postToSlack: m.slack,
}));
vi.mock("../../../apps/api/src/plugins/discord/client", async (original) => ({
  ...(await original<object>()),
  postToDiscord: m.discord,
}));
vi.mock("../../../apps/api/src/plugins/telegram/client", () => ({
  postToTelegram: m.telegram,
}));
vi.mock("../../../apps/api/src/plugins/mattermost/client", () => ({
  postToMattermost: m.mattermost,
}));

function chain(rows: unknown[]) {
  const value = {
    from: () => value,
    innerJoin: () => value,
    leftJoin: () => value,
    where: () => value,
    limit: async () => rows,
  };
  return value;
}

function item(type: "task" | "bug" | "feature") {
  const workflow = type !== "feature";
  m.select
    .mockReturnValueOnce(
      chain([
        {
          title: "Checkout",
          type,
          number: 12,
          status: workflow ? "in-progress" : null,
          priority: workflow ? "high" : null,
          columnName: workflow ? "In Progress" : null,
          projectName: "Web",
          projectId: "project",
          workspaceId: "workspace",
        },
      ]),
    )
    .mockReturnValueOnce(chain([{ name: "Mira" }]));
}

const created = {
  taskId: "item",
  projectId: "project",
  userId: "user",
  title: "Checkout",
  description: null,
  priority: null,
  status: "",
  number: 12,
};
const renamed = {
  taskId: "item",
  projectId: "project",
  userId: "user",
  oldTitle: "Checkout",
  newTitle: "Checkout v2",
};
const comment = {
  taskId: "item",
  projectId: "project",
  userId: "user",
  comment: "Ledger first",
};
const context = (events: Record<string, boolean>) => ({
  integrationId: "integration",
  projectId: "project",
  config: {
    webhookUrl: "https://chat.example.com/hooks/kaneo",
    botToken: `12345678:${"x".repeat(35)}`,
    chatId: "chat",
    events,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("chat messages for Features", () => {
  it("Slack says feature and drops Status and Priority", async () => {
    item("feature");
    await slack.handleTaskCreated(created, context({ taskCreated: true }));
    const message = m.slack.mock.calls[0]?.[1];
    expect(message.text).toBe("New feature created: Checkout");
    const text = JSON.stringify(message.blocks);
    expect(text).toContain("A new feature was added");
    expect(text).toContain("*Feature*");
    expect(text).not.toContain("*Status*");
    expect(text).not.toContain("*Priority*");
  });

  it("Slack keeps the task wording and workflow fields for a Bug", async () => {
    item("bug");
    await slack.handleTaskCreated(created, context({ taskCreated: true }));
    const message = m.slack.mock.calls[0]?.[1];
    expect(message.text).toBe("New task created: Checkout");
    const text = JSON.stringify(message.blocks);
    expect(text).toContain("*Task*");
    expect(text).toContain("*Status*\\nIn Progress");
    expect(text).toContain("*Priority*\\nHigh");
  });

  it("Discord names a renamed Feature without workflow fields", async () => {
    item("feature");
    await discord.handleTaskTitleChanged(
      renamed,
      context({ taskTitleChanged: true }),
    );
    const [embed] = m.discord.mock.calls[0]?.[1].embeds ?? [];
    expect(embed.title).toBe("Feature title changed");
    expect(embed.description).toContain("Feature renamed from **Checkout**");
    expect(embed.fields.map((field: { name: string }) => field.name)).toEqual([
      "Feature",
      "Project",
    ]);
  });

  it("Discord keeps Status and Priority for a Task", async () => {
    item("task");
    await discord.handleTaskCreated(created, context({ taskCreated: true }));
    const [embed] = m.discord.mock.calls[0]?.[1].embeds ?? [];
    expect(embed.title).toBe("New task created");
    expect(embed.fields.map((field: { name: string }) => field.name)).toEqual([
      "Task",
      "Project",
      "Status",
      "Priority",
    ]);
  });

  it("Telegram announces a Feature comment", async () => {
    item("feature");
    await telegram.handleTaskCommentCreated(
      comment,
      context({ taskCommentCreated: true }),
    );
    const text: string = m.telegram.mock.calls[0]?.[1].text;
    expect(text).toContain("<b>New feature comment</b>");
    expect(text).toContain("<b>Feature:</b>");
    expect(text).not.toContain("<b>Status:</b>");
    expect(text).not.toContain("<b>Priority:</b>");
  });

  it("Mattermost describes a Feature description change", async () => {
    item("feature");
    await mattermost.handleTaskDescriptionChanged(
      {
        taskId: "item",
        projectId: "project",
        userId: "user",
        oldDescription: null,
        newDescription: "Ledger first",
      },
      context({ taskDescriptionChanged: true }),
    );
    const message = m.mattermost.mock.calls[0]?.[1];
    expect(message.text).toBe("Feature description changed: Checkout");
    const [attachment] = message.attachments;
    expect(attachment.text).toContain("The feature description was updated");
    expect(
      attachment.fields.map((field: { title: string }) => field.title),
    ).toEqual(["Project", "Triggered by"]);
  });
});
