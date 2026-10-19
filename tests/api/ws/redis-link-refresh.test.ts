import { expect, it, vi } from "vite-plus/test";
import { RedisBroadcastAdapter } from "../../../apps/api/src/ws/redis-broadcast-adapter";

const mocks = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  psubscribe: vi.fn().mockResolvedValue(undefined),
  punsubscribe: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../apps/api/src/redis", () => ({
  getRedisSub: () => mocks,
  getRedisPub: () => ({ publish: vi.fn() }),
  closeRedis: async () => {},
}));

it("retains the link-refresh flag when receiving a Redis project broadcast", async () => {
  const adapter = new RedisBroadcastAdapter();
  const receive = vi.fn();
  await adapter.subscribe(receive);
  const handle = mocks.on.mock.calls.find(
    ([event]) => event === "pmessage",
  )![1];
  handle(
    "kaneo:ws:*:broadcast",
    "kaneo:ws:project:broadcast",
    JSON.stringify({
      projectId: "project",
      message: {
        type: "PROJECT_UPDATED",
        projectId: "project",
        linksChanged: true,
        taskTitleChanged: true,
      },
    }),
  );
  expect(receive).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.objectContaining({
        linksChanged: true,
        taskTitleChanged: true,
      }),
    }),
  );
  await adapter.shutdown();
});

it("retains milestone scope when receiving a Redis project broadcast", async () => {
  mocks.on.mockClear();
  const adapter = new RedisBroadcastAdapter();
  const receive = vi.fn();
  await adapter.subscribe(receive);
  const handle = mocks.on.mock.calls.find(
    ([event]) => event === "pmessage",
  )![1];
  handle(
    "kaneo:ws:*:broadcast",
    "kaneo:ws:project:broadcast",
    JSON.stringify({
      projectId: "project",
      message: {
        type: "MILESTONES_UPDATED",
        projectId: "project",
        featureId: "feature",
        milestoneId: null,
      },
    }),
  );
  expect(receive).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.objectContaining({
        featureId: "feature",
        milestoneId: null,
      }),
    }),
  );
  await adapter.shutdown();
});
