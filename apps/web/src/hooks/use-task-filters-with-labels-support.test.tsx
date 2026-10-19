import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { useTaskFiltersWithLabelsSupport } from "./use-task-filters-with-labels-support";

const IGNORE_STATUS = ["status"] as const;

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function createWrapper() {
  const queryClient = createTestQueryClient();

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useTaskFiltersWithLabelsSupport", () => {
  const storageKey = "kaneo:board-filters:project-1";

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("restores persisted label filters from storage and matches tasks from project data", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ labels: ["label-bug"] }),
    );

    const project = {
      id: "project-1",
      name: "Project",
      slug: "PROJ",
      icon: null,
      description: null,
      isPublic: false,
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
      workspaceId: "workspace-1",
      columns: [
        {
          id: "todo",
          slug: "todo",
          name: "Todo",
          icon: null,
          isFinal: false,
          tasks: [
            {
              id: "task-1",
              title: "Bug task",
              number: 1,
              description: null,
              status: "todo",
              priority: null,
              startDate: null,
              dueDate: null,
              position: 0,
              createdAt: "2026-04-16T00:00:00.000Z",
              updatedAt: "2026-04-16T00:00:00.000Z",
              userId: null,
              assigneeId: null,
              assigneeName: null,
              assigneeImage: null,
              projectId: "project-1",
              labels: [
                {
                  id: "label-bug",
                  name: "bug",
                  color: "red",
                },
              ],
              externalLinks: [],
            },
            {
              id: "task-2",
              title: "Other task",
              number: 2,
              description: null,
              status: "todo",
              priority: null,
              startDate: null,
              dueDate: null,
              position: 1,
              createdAt: "2026-04-16T00:00:00.000Z",
              updatedAt: "2026-04-16T00:00:00.000Z",
              userId: null,
              assigneeId: null,
              assigneeName: null,
              assigneeImage: null,
              projectId: "project-1",
              labels: [],
              externalLinks: [],
            },
          ],
        },
      ],
      plannedTasks: [],
      archivedTasks: [],
    };

    const { result } = renderHook(
      () => useTaskFiltersWithLabelsSupport(project, "project-1"),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.filters.labels).toEqual(["label-bug"]);
    });

    expect(result.current.filteredProject?.columns[0]?.tasks).toHaveLength(1);
    expect(result.current.filteredProject?.columns[0]?.tasks[0]?.id).toBe(
      "task-1",
    );
  });

  it.each(["#123", "proj-123", "proj-"])(
    "matches a task by its issue identifier when searching for %s",
    (textQuery) => {
      const project = {
        id: "project-1",
        name: "Project",
        slug: "PROJ",
        icon: null,
        description: null,
        isPublic: false,
        createdAt: "2026-04-16T00:00:00.000Z",
        updatedAt: "2026-04-16T00:00:00.000Z",
        workspaceId: "workspace-1",
        columns: [
          {
            id: "todo",
            slug: "todo",
            name: "Todo",
            icon: null,
            isFinal: false,
            tasks: [
              {
                id: "task-123",
                title: "Unrelated title",
                number: 123,
                description: null,
                status: "todo",
                priority: null,
                startDate: null,
                dueDate: null,
                position: 0,
                createdAt: "2026-04-16T00:00:00.000Z",
                updatedAt: "2026-04-16T00:00:00.000Z",
                userId: null,
                assigneeId: null,
                assigneeName: null,
                assigneeImage: null,
                projectId: "project-1",
                labels: [],
                externalLinks: [],
              },
              {
                id: "task-without-number",
                title: "Another unrelated title",
                number: null,
                description: null,
                status: "todo",
                priority: null,
                startDate: null,
                dueDate: null,
                position: 1,
                createdAt: "2026-04-16T00:00:00.000Z",
                updatedAt: "2026-04-16T00:00:00.000Z",
                userId: null,
                assigneeId: null,
                assigneeName: null,
                assigneeImage: null,
                projectId: "project-1",
                labels: [],
                externalLinks: [],
              },
            ],
          },
        ],
        plannedTasks: [],
        archivedTasks: [],
      };

      const { result } = renderHook(
        () => useTaskFiltersWithLabelsSupport(project, "project-1", textQuery),
        {
          wrapper: createWrapper(),
        },
      );

      expect(result.current.filteredProject?.columns[0]?.tasks).toEqual([
        expect.objectContaining({ id: "task-123" }),
      ]);
    },
  );

  it("reads stored filters from before releases with no release filter", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ priority: ["high"], negated: ["priority"] }),
    );

    const { result } = renderHook(
      () => useTaskFiltersWithLabelsSupport(null, "project-1"),
      { wrapper: createWrapper() },
    );

    expect(result.current.filters.release).toBeNull();
    expect(result.current.filters.type).toBeNull();
    expect(result.current.activeFilterCount).toBe(1);
  });

  it("stores Type multiselect and negation, normalizes invalid values, and clears them", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ type: ["bug", "invalid", "bug"], negated: ["type"] }),
    );
    const { result } = renderHook(
      () => useTaskFiltersWithLabelsSupport(null, "project-1"),
      { wrapper: createWrapper() },
    );
    expect(result.current.filters.type).toEqual(["bug"]);
    expect(result.current.activeFilterCount).toBe(1);
    act(() => result.current.toggleFilter("type", "task"));
    expect(
      JSON.parse(window.localStorage.getItem(storageKey) ?? "{}"),
    ).toMatchObject({ type: ["bug", "task"], negated: ["type"] });
    act(() => result.current.clearFilters());
    expect(result.current.filters.type).toBeNull();
    expect(result.current.filters.negated).toBeNull();
  });

  it("filters by release, including No release, and stores the choice", () => {
    const item = (id: string, releaseId?: string | null) => ({
      id,
      title: id,
      number: 1,
      description: null,
      status: "planned",
      priority: null,
      dueDate: null,
      userId: null,
      labels: [],
      releaseId,
    });
    const project = {
      id: "project-1",
      slug: "PROJ",
      columns: [
        {
          id: "todo",
          tasks: [item("in-r1", "r1"), item("in-r2", "r2"), item("none-1")],
        },
      ],
      plannedTasks: [item("planned-r1", "r1"), item("none-2", null)],
      archivedTasks: [],
    } as unknown as Parameters<typeof useTaskFiltersWithLabelsSupport>[0];
    const shown = (
      filtered: ReturnType<
        typeof useTaskFiltersWithLabelsSupport
      >["filteredProject"],
    ) => [
      ...(filtered?.columns.flatMap((column) => column.tasks) ?? []),
      ...(filtered?.plannedTasks ?? []),
    ];

    const { result } = renderHook(
      () => useTaskFiltersWithLabelsSupport(project, "project-1"),
      { wrapper: createWrapper() },
    );

    act(() => result.current.toggleFilter("release", "r1"));
    act(() => result.current.toggleFilter("release", "none"));

    expect(result.current.filters.release).toEqual(["r1", "none"]);
    expect(result.current.activeFilterCount).toBe(1);
    expect(
      shown(result.current.filteredProject).map((task) => task.id),
    ).toEqual(["in-r1", "none-1", "planned-r1", "none-2"]);
    expect(
      JSON.parse(window.localStorage.getItem(storageKey) ?? "{}").release,
    ).toEqual(["r1", "none"]);

    act(() => result.current.setNegated("release", true));
    expect(
      shown(result.current.filteredProject).map((task) => task.id),
    ).toEqual(["in-r2"]);

    act(() => result.current.toggleFilter("release", "r1"));
    act(() => result.current.toggleFilter("release", "none"));
    expect(result.current.filters.release).toBeNull();
    expect(result.current.filters.negated).toBeNull();
  });

  it("keeps an ignored status filter stored but out of the backlog", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ status: ["done"], priority: ["high"] }),
    );
    const planned = {
      id: "planned-1",
      title: "Planned work",
      number: 7,
      description: null,
      status: "planned",
      priority: "high",
      dueDate: null,
      userId: null,
      labels: [],
    };
    const project = {
      id: "project-1",
      slug: "PROJ",
      columns: [],
      plannedTasks: [planned],
      archivedTasks: [],
    } as unknown as Parameters<typeof useTaskFiltersWithLabelsSupport>[0];

    const { result } = renderHook(
      () =>
        useTaskFiltersWithLabelsSupport(
          project,
          "project-1",
          "",
          undefined,
          IGNORE_STATUS,
        ),
      { wrapper: createWrapper() },
    );

    expect(result.current.filters.status).toBeNull();
    expect(result.current.activeFilterCount).toBe(1);
    expect(result.current.filteredProject?.plannedTasks).toHaveLength(1);

    act(() => result.current.clearFilters());

    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? "{}")).toEqual(
      expect.objectContaining({ status: ["done"], priority: null }),
    );
  });
});
