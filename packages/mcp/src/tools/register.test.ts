import { describe, expect, it, vi } from "vite-plus/test";
import { registerTools } from "./register.js";

type RegisteredTool = {
  name: string;
  config: { inputSchema?: { parse: (args: unknown) => unknown } };
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
};

function createServerMock() {
  const tools = new Map<string, RegisteredTool>();

  return {
    server: {
      registerTool: vi.fn(
        (
          name: string,
          config: RegisteredTool["config"],
          handler: RegisteredTool["handler"],
        ) => {
          tools.set(name, { name, config, handler });
        },
      ),
    },
    tools,
  };
}

describe("registerTools", () => {
  it("registers the MCP tools", () => {
    const { server } = createServerMock();
    const client = { json: vi.fn() };

    registerTools(server as never, { client: client as never });

    expect(server.registerTool).toHaveBeenCalled();
    expect(server.registerTool).toHaveBeenCalledWith(
      "whoami",
      expect.any(Object),
      expect.any(Function),
    );
    expect(server.registerTool).toHaveBeenCalledWith(
      "update_task",
      expect.any(Object),
      expect.any(Function),
    );
    for (const name of ["set_task_feature", "set_task_type"]) {
      expect(server.registerTool).toHaveBeenCalledWith(
        name,
        expect.any(Object),
        expect.any(Function),
      );
    }
  });

  it("uses the API-key current-user endpoint for whoami", async () => {
    const { server, tools } = createServerMock();
    const client = {
      usingApiKey: true,
      json: vi.fn().mockResolvedValue({
        id: "user-1",
        name: "Mohiuddin",
        email: "user@example.com",
        role: "user",
        token: "unexpected-user-secret",
      }),
    };

    registerTools(server as never, { client: client as never });

    const result = await tools.get("whoami")?.handler({});

    expect(client.json).toHaveBeenCalledWith("/api/user/me", {
      method: "GET",
    });
    expect(result?.isError).toBe(false);
    expect(result?.content).toEqual([
      {
        type: "text",
        text: JSON.stringify(
          {
            id: "user-1",
            name: "Mohiuddin",
            email: "user@example.com",
            role: "user",
          },
          null,
          2,
        ),
      },
    ]);
  });

  it.each(["user", null, undefined])(
    "returns only safe user fields for whoami with session authentication and role %s",
    async (role) => {
      const { server, tools } = createServerMock();
      const client = {
        usingApiKey: false,
        json: vi.fn().mockResolvedValue({
          user: {
            id: "user-1",
            name: "Mohiuddin",
            email: "user@example.com",
            role,
            token: "unexpected-user-secret",
          },
          session: {
            id: "session-1",
            token: "live-session-secret",
            expiresAt: "2026-11-08T00:00:00.000Z",
            ipAddress: "192.0.2.1",
            userAgent: "MCP client",
          },
          token: "unexpected-response-secret",
        }),
      };

      registerTools(server as never, { client: client as never });

      const result = await tools.get("whoami")?.handler({});

      expect(client.json).toHaveBeenCalledWith("/api/auth/get-session", {
        method: "GET",
      });
      expect(result?.isError).toBe(false);
      expect(result?.content).toEqual([
        {
          type: "text",
          text: JSON.stringify(
            {
              id: "user-1",
              name: "Mohiuddin",
              email: "user@example.com",
              role,
            },
            null,
            2,
          ),
        },
      ]);
    },
  );

  it("returns null for whoami when there is no session", async () => {
    const { server, tools } = createServerMock();
    const client = {
      usingApiKey: false,
      json: vi.fn().mockResolvedValue(null),
    };

    registerTools(server as never, { client: client as never });

    const result = await tools.get("whoami")?.handler({});

    expect(result).toEqual({
      content: [{ type: "text", text: "null" }],
      isError: false,
    });
  });

  it("builds the expected query string for list_tasks", async () => {
    const { server, tools } = createServerMock();
    const client = {
      json: vi.fn().mockResolvedValue([{ id: "task-1" }]),
    };

    registerTools(server as never, { client: client as never });

    const result = await tools.get("list_tasks")?.handler({
      projectId: "project 1",
      status: "open",
      page: 2,
      relatedPage: 3,
      sortOrder: "desc",
    });

    expect(client.json).toHaveBeenCalledWith(
      "/api/task/tasks/project%201?status=open&page=2&relatedPage=3&sortOrder=desc",
      { method: "GET" },
    );
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify([{ id: "task-1" }], null, 2),
        },
      ],
      isError: false,
    });
  });

  it("gets one task by ticket ID with an optional workspace", async () => {
    const { server, tools } = createServerMock();
    const client = {
      json: vi.fn().mockResolvedValue({ id: "task-1", number: 12 }),
    };
    registerTools(server as never, { client: client as never });

    const tool = tools.get("get_task_by_ticket_id");
    expect(tool).toBeDefined();
    await tool?.handler({ ticketId: "KAN-12" });
    await tool?.handler({ ticketId: "KAN-12", workspaceId: "workspace 1" });
    await tool?.handler({ ticketId: "KAN-12", projectId: "project 1" });

    expect(client.json).toHaveBeenNthCalledWith(
      1,
      "/api/task/by-ticket-id/KAN-12",
      { method: "GET" },
    );
    expect(client.json).toHaveBeenNthCalledWith(
      2,
      "/api/task/by-ticket-id/KAN-12?workspaceId=workspace+1",
      { method: "GET" },
    );
    expect(client.json).toHaveBeenNthCalledWith(
      3,
      "/api/task/by-ticket-id/KAN-12?projectId=project+1",
      { method: "GET" },
    );
  });

  it("fetches the current task and sends a full body for update_task", async () => {
    const { server, tools } = createServerMock();
    const client = {
      json: vi
        .fn()
        .mockResolvedValueOnce({
          title: "Draft spec",
          description: "Write docs",
          status: "open",
          priority: "medium",
          projectId: "project-1",
          position: 4,
        })
        .mockResolvedValueOnce({ id: "task-1", status: "done" }),
    };

    registerTools(server as never, { client: client as never });

    const result = await tools.get("update_task")?.handler({
      taskId: "task-1",
      status: "done",
    });

    expect(client.json).toHaveBeenNthCalledWith(1, "/api/task/task-1", {
      method: "GET",
    });
    const putCall = client.json.mock.calls[1];
    expect(putCall?.[0]).toBe("/api/task/task-1");
    const putBody = JSON.parse(
      String((putCall?.[1] as { body?: string })?.body ?? "{}"),
    );
    expect(putBody).toEqual(
      expect.objectContaining({
        title: "Draft spec",
        description: "Write docs",
        status: "done",
        priority: "medium",
        projectId: "project-1",
        position: 4,
      }),
    );
    expect(result?.isError).toBe(false);
  });

  it("leaves the type and feature out of the update_task body", async () => {
    const { server, tools } = createServerMock();
    const client = {
      json: vi
        .fn()
        .mockResolvedValueOnce({
          title: "Write docs",
          status: "open",
          priority: "medium",
          projectId: "project-1",
          position: 4,
          type: "task",
          featureId: "feature-1",
        })
        .mockResolvedValueOnce({ id: "task-1" }),
    };

    registerTools(server as never, { client: client as never });

    await tools.get("update_task")?.handler({
      taskId: "task-1",
      title: "Write the docs",
    });

    const putBody = JSON.parse(
      String((client.json.mock.calls[1]?.[1] as { body?: string })?.body),
    );
    expect(putBody).not.toHaveProperty("type");
    expect(putBody).not.toHaveProperty("featureId");
  });

  it("creates a task inside a feature in one call", async () => {
    const { server, tools } = createServerMock();
    const client = { json: vi.fn().mockResolvedValue({ id: "task-2" }) };

    registerTools(server as never, { client: client as never });

    const result = await tools.get("create_task")?.handler({
      projectId: "project 1",
      title: "Write docs",
      description: "",
      priority: "low",
      status: "to-do",
      featureId: "feature-1",
    });

    expect(client.json).toHaveBeenCalledWith("/api/task/project%201", {
      method: "POST",
      body: JSON.stringify({
        title: "Write docs",
        description: "",
        priority: "low",
        status: "to-do",
        featureId: "feature-1",
      }),
    });
    expect(result?.isError).toBe(false);
  });

  it("creates a feature", async () => {
    const { server, tools } = createServerMock();
    const client = { json: vi.fn().mockResolvedValue({ id: "feature-1" }) };

    registerTools(server as never, { client: client as never });

    await tools.get("create_task")?.handler({
      projectId: "project-1",
      title: "Onboarding",
      description: "",
      priority: "medium",
      status: "to-do",
      type: "feature",
    });

    const body = JSON.parse(
      String((client.json.mock.calls[0]?.[1] as { body?: string })?.body),
    );
    expect(body).toEqual(expect.objectContaining({ type: "feature" }));
    expect(body).not.toHaveProperty("featureId");
  });

  it("rejects an unknown task type for create_task", async () => {
    const { server, tools } = createServerMock();
    const client = { json: vi.fn() };

    registerTools(server as never, { client: client as never });

    const result = await tools.get("create_task")?.handler({
      projectId: "project-1",
      title: "Onboarding",
      description: "",
      priority: "medium",
      status: "to-do",
      type: "epic",
    });

    expect(result?.isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });

  it.each([
    ["feature-1", "feature-1"],
    [null, null],
  ])(
    "sets a task's feature to %s with set_task_feature",
    async (featureId, expected) => {
      const { server, tools } = createServerMock();
      const client = { json: vi.fn().mockResolvedValue({ id: "task 1" }) };

      registerTools(server as never, { client: client as never });

      const result = await tools.get("set_task_feature")?.handler({
        taskId: "task 1",
        featureId,
      });

      expect(client.json).toHaveBeenCalledWith("/api/task/feature/task%201", {
        method: "PUT",
        body: JSON.stringify({ featureId: expected }),
      });
      expect(result?.isError).toBe(false);
    },
  );

  it("requires an explicit featureId for set_task_feature", async () => {
    const { server, tools } = createServerMock();
    const client = { json: vi.fn() };

    registerTools(server as never, { client: client as never });

    const result = await tools
      .get("set_task_feature")
      ?.handler({ taskId: "task-1" });

    expect(result?.isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });

  it("converts a task with set_task_type", async () => {
    const { server, tools } = createServerMock();
    const client = { json: vi.fn().mockResolvedValue({ id: "task-1" }) };

    registerTools(server as never, { client: client as never });

    await tools
      .get("set_task_type")
      ?.handler({ taskId: "task-1", type: "feature" });

    expect(client.json).toHaveBeenCalledWith("/api/task/type/task-1", {
      method: "PUT",
      body: JSON.stringify({ type: "feature" }),
    });
  });

  it("surfaces the API conflict when a feature with tasks becomes a task", async () => {
    const { server, tools } = createServerMock();
    const client = {
      json: vi
        .fn()
        .mockRejectedValue(new Error("This feature still has tasks.")),
    };

    registerTools(server as never, { client: client as never });

    const result = await tools
      .get("set_task_type")
      ?.handler({ taskId: "feature-1", type: "task" });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("still has tasks");
  });

  it("fetches the current project and sends a full body for update_project", async () => {
    const { server, tools } = createServerMock();
    const client = {
      json: vi
        .fn()
        .mockResolvedValueOnce({
          name: "Roadmap",
          slug: "roadmap",
        })
        .mockResolvedValueOnce({ id: "project-1", name: "Roadmap v2" }),
    };

    registerTools(server as never, { client: client as never });

    const result = await tools.get("update_project")?.handler({
      id: "project-1",
      name: "Roadmap v2",
    });

    expect(client.json).toHaveBeenNthCalledWith(1, "/api/project/project-1", {
      method: "GET",
    });
    const putCall = client.json.mock.calls[1];
    expect(putCall?.[0]).toBe("/api/project/project-1");
    const putBody = JSON.parse(
      String((putCall?.[1] as { body?: string })?.body ?? "{}"),
    );
    expect(putBody).toEqual({
      name: "Roadmap v2",
      icon: "Layout",
      slug: "roadmap",
      description: "",
      isPublic: false,
    });
    expect(result?.isError).toBe(false);
  });

  it("returns an MCP error result when the client request fails", async () => {
    const { server, tools } = createServerMock();
    const client = {
      json: vi.fn().mockRejectedValue(new Error("boom")),
    };

    registerTools(server as never, { client: client as never });

    const result = await tools.get("whoami")?.handler({});

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "boom" }, null, 2),
        },
      ],
      isError: true,
    });
  });

  it("validates label colors as hex values", () => {
    const { server, tools } = createServerMock();
    const client = { json: vi.fn() };

    registerTools(server as never, { client: client as never });

    const schema = tools.get("create_label")?.config.inputSchema;
    expect(schema).toBeDefined();
    expect(() =>
      schema?.parse({
        name: "Bug",
        color: "red",
        workspaceId: "workspace-1",
      }),
    ).toThrow(/hex color/i);
  });

  it("validates task date filters as ISO datetimes with timezone", () => {
    const { server, tools } = createServerMock();
    const client = { json: vi.fn() };

    registerTools(server as never, { client: client as never });

    const schema = tools.get("list_tasks")?.config.inputSchema;
    expect(schema).toBeDefined();
    expect(() =>
      schema?.parse({
        projectId: "project-1",
        dueBefore: "2026-04-04",
      }),
    ).toThrow();
  });

  it("creates a task relation with the expected body", async () => {
    const { server, tools } = createServerMock();
    const client = {
      json: vi.fn().mockResolvedValue({ id: "rel-1", relationType: "blocks" }),
    };

    registerTools(server as never, { client: client as never });

    const result = await tools.get("create_task_relation")?.handler({
      sourceTaskId: "task-1",
      targetTaskId: "task-2",
      relationType: "blocks",
    });

    expect(client.json).toHaveBeenCalledWith("/api/task-relation", {
      method: "POST",
      body: JSON.stringify({
        sourceTaskId: "task-1",
        targetTaskId: "task-2",
        relationType: "blocks",
      }),
    });
    expect(result?.isError).toBe(false);
  });

  it("still accepts the deprecated subtask relation type", async () => {
    const { server, tools } = createServerMock();
    const client = { json: vi.fn().mockResolvedValue({ id: "feature:t2:t1" }) };

    registerTools(server as never, { client: client as never });

    const result = await tools.get("create_task_relation")?.handler({
      sourceTaskId: "t1",
      targetTaskId: "t2",
      relationType: "subtask",
    });

    expect(result?.isError).toBe(false);
    expect(client.json).toHaveBeenCalledWith("/api/task-relation", {
      method: "POST",
      body: JSON.stringify({
        sourceTaskId: "t1",
        targetTaskId: "t2",
        relationType: "subtask",
      }),
    });
  });

  it("validates relationType for create_task_relation", () => {
    const { server, tools } = createServerMock();
    const client = { json: vi.fn() };

    registerTools(server as never, { client: client as never });

    const schema = tools.get("create_task_relation")?.config.inputSchema;
    expect(schema).toBeDefined();
    expect(() =>
      schema?.parse({
        sourceTaskId: "task-1",
        targetTaskId: "task-2",
        relationType: "duplicate",
      }),
    ).toThrow();
  });

  it("gets task relations by task id", async () => {
    const { server, tools } = createServerMock();
    const client = { json: vi.fn().mockResolvedValue([]) };

    registerTools(server as never, { client: client as never });

    await tools.get("get_task_relations")?.handler({ taskId: "task 1" });

    expect(client.json).toHaveBeenCalledWith("/api/task-relation/task%201", {
      method: "GET",
    });
  });

  it("deletes a task relation by id", async () => {
    const { server, tools } = createServerMock();
    const client = { json: vi.fn().mockResolvedValue({}) };

    registerTools(server as never, { client: client as never });

    await tools.get("delete_task_relation")?.handler({ id: "rel-1" });

    expect(client.json).toHaveBeenCalledWith("/api/task-relation/rel-1", {
      method: "DELETE",
    });
  });

  it("deletes a task-associated label without an obsolete preflight", async () => {
    const { server, tools } = createServerMock();
    const client = { json: vi.fn().mockResolvedValue({ id: "label-1" }) };
    registerTools(server as never, { client: client as never });
    const result = await tools.get("delete_label")?.handler({ id: "label-1" });
    expect(client.json).toHaveBeenCalledExactlyOnceWith("/api/label/label-1", {
      method: "DELETE",
      signal: expect.any(AbortSignal),
    });
    expect(result?.isError).toBe(false);
  });

  it("resumes workspace label deletion until the API completes it", async () => {
    const { server, tools } = createServerMock();
    const client = {
      json: vi
        .fn()
        .mockResolvedValueOnce({
          id: "label-1",
          taskId: null,
          pendingDeletion: true,
        })
        .mockResolvedValueOnce({ id: "label-1", taskId: null }),
    };
    registerTools(server as never, { client: client as never });
    const result = await tools.get("delete_label")?.handler({ id: "label-1" });
    expect(result?.isError).toBe(false);
    expect(client.json).toHaveBeenCalledTimes(2);
    expect(client.json).toHaveBeenNthCalledWith(2, "/api/label/label-1", {
      method: "DELETE",
      signal: expect.any(AbortSignal),
    });
  });

  it("returns saved progress when the overall deletion deadline expires", async () => {
    const { server, tools } = createServerMock();
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);
    const progress = { id: "large", pendingDeletion: true };
    const client = {
      json: vi
        .fn()
        .mockResolvedValueOnce(progress)
        .mockImplementationOnce(async () => {
          controller.abort();
          throw new DOMException("Timed out", "TimeoutError");
        }),
    };
    try {
      registerTools(server as never, { client: client as never });
      const result = await tools.get("delete_label")?.handler({ id: "large" });
      expect(timeout).toHaveBeenCalledWith(10_000);
      expect(result?.isError).toBe(false);
      expect(client.json).toHaveBeenCalledTimes(2);
      expect(client.json).toHaveBeenLastCalledWith("/api/label/large", {
        method: "DELETE",
        signal: controller.signal,
      });
      expect(result?.content).toEqual([
        expect.objectContaining({
          text: expect.stringContaining('"pendingDeletion": true'),
        }),
      ]);
    } finally {
      timeout.mockRestore();
    }
  });

  it("returns resumable progress when a cascade exceeds one tool call", async () => {
    const { server, tools } = createServerMock();
    const client = {
      json: vi.fn().mockResolvedValue({ pendingDeletion: true }),
    };
    registerTools(server as never, { client: client as never });
    const result = await tools.get("delete_label")?.handler({ id: "large" });
    expect(result?.isError).toBe(false);
    expect(client.json).toHaveBeenCalledTimes(100);
    expect(result?.content).toEqual([
      expect.objectContaining({
        text: expect.stringContaining('"pendingDeletion": true'),
      }),
    ]);
  });
});
