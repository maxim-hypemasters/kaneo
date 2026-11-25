import { describe, expect, it } from "vite-plus/test";
import type { Notification } from "@/types/notification";
import { filterNotifications, groupNotifications } from "./group-notifications";

const now = new Date(2026, 9, 2, 15, 0);

function notification(
  id: string,
  overrides: Partial<Notification> = {},
): Notification {
  return {
    id,
    userId: "user-1",
    title: null,
    content: null,
    type: "task_comment",
    isRead: false,
    resourceId: "task-1",
    resourceType: "task",
    eventData: null,
    createdAt: new Date(2026, 9, 2, 9).toISOString(),
    ...overrides,
  } as Notification;
}

describe("filterNotifications", () => {
  const notifications = [
    notification("unread-comment"),
    notification("read-mention", { type: "task_mention", isRead: true }),
    notification("test-case-mention", {
      type: "test_case_mention",
      resourceType: "test_case",
      isRead: true,
    }),
  ];

  it("keeps everything for the all filter", () => {
    expect(filterNotifications(notifications, "all")).toHaveLength(3);
  });

  it("narrows to unread or to mentions", () => {
    expect(
      filterNotifications(notifications, "unread").map((item) => item.id),
    ).toEqual(["unread-comment"]);
    expect(
      filterNotifications(notifications, "mentions").map((item) => item.id),
    ).toEqual(["read-mention", "test-case-mention"]);
  });

  it("counts a mention in a document comment as a mention", () => {
    expect(
      filterNotifications(
        [
          ...notifications,
          notification("document-mention", { type: "document_mention" }),
          notification("document-reply", { type: "document_comment_reply" }),
        ],
        "mentions",
      ).map((item) => item.id),
    ).toEqual(["read-mention", "test-case-mention", "document-mention"]);
  });
});

describe("groupNotifications", () => {
  it("splits on the viewer's calendar day and keeps the order", () => {
    const { today, earlier } = groupNotifications(
      [
        notification("this-morning"),
        notification("just-after-midnight", {
          createdAt: new Date(2026, 9, 2, 0, 1).toISOString(),
        }),
        notification("last-night", {
          createdAt: new Date(2026, 9, 1, 23, 59).toISOString(),
        }),
      ],
      now,
    );

    expect(today.map((item) => item.id)).toEqual([
      "this-morning",
      "just-after-midnight",
    ]);
    expect(earlier.map((item) => item.id)).toEqual(["last-night"]);
  });
});
