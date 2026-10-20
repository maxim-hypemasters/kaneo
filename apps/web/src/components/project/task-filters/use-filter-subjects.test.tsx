import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { BoardFilters } from "@/hooks/use-task-filters";
import type { Release } from "@/types/release";
import type Task from "@/types/task";
import type { TaskFilterControls } from "./filter-subject";
import { useFilterSubjects } from "./use-filter-subjects";
import type { TaskFilterOptions } from "./use-task-filter-options";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const noFilters: BoardFilters = {
  status: null,
  priority: null,
  assignee: null,
  dueDate: null,
  labels: null,
  release: null,
  customFields: null,
};

const release = (
  id: string,
  startDate: string,
  codeFreezeDate: string,
  submissionDate: string,
) =>
  ({
    id,
    name: `Release ${id}`,
    startDate,
    codeFreezeDate,
    submissionDate,
  }) as Release;

// Today is Oct 17, 2026.
const releases = [
  release("past", "2026-08-01", "2026-08-10", "2026-08-20"),
  release("next", "2026-11-01", "2026-11-10", "2026-11-20"),
  release("frozen", "2026-09-01", "2026-10-10", "2026-10-25"),
  release("building", "2026-10-01", "2026-10-20", "2026-10-22"),
];

const tasks = [
  { id: "t1", releaseId: "next" },
  { id: "t2", releaseId: "next" },
  { id: "t3", releaseId: null },
  { id: "t4" },
  { id: "t5", releaseId: "gone" },
] as Task[];

function controls(filters: Partial<BoardFilters> = {}) {
  return {
    filters: { ...noFilters, ...filters },
    updateFilter: vi.fn(),
    toggleFilter: vi.fn(),
    setNegated: vi.fn(),
    updateCustomFieldFilter: vi.fn(),
    clearFilters: vi.fn(),
    activeFilterCount: 0,
  } satisfies TaskFilterControls;
}

function options(overrides: Partial<TaskFilterOptions> = {}) {
  return {
    members: [],
    labels: [],
    customFields: [],
    usedCustomFieldValues: {},
    releases,
    releasesLoading: false,
    ...overrides,
  } as TaskFilterOptions;
}

function releaseSubject(
  input: { controls?: TaskFilterControls; options?: TaskFilterOptions } = {},
) {
  const { result } = renderHook(() =>
    useFilterSubjects({
      controls: input.controls ?? controls(),
      options: input.options ?? options(),
      tasks,
      showStatus: true,
    }),
  );
  const subjects = result.current;
  const subject = subjects.find((item) => item.id === "release");
  if (!subject) throw new Error("no release subject");
  return { subjects, subject };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 17, 12));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("offers execution item types with counts, including legacy Tasks", () => {
  const control = controls({ type: ["bug"], negated: ["type"] });
  const { result } = renderHook(() =>
    useFilterSubjects({
      controls: control,
      options: options(),
      tasks: [{ id: "old" }, { id: "bug", type: "bug" }] as Task[],
      showStatus: true,
    }),
  );
  const subject = result.current.find((item) => item.id === "type")!;
  expect(subject.options.map(({ value, count }) => [value, count])).toEqual([
    ["task", 1],
    ["bug", 1],
  ]);
  expect(subject.selected).toEqual(["bug"]);
  expect(subject.negated).toBe(true);
  subject.onToggle("task");
  expect(control.toggleFilter).toHaveBeenCalledWith("type", "task");
  subject.onClear();
  expect(control.updateFilter).toHaveBeenCalledWith("type", null);
});

it("lists No release, then active, upcoming and past releases, after Labels", () => {
  const { subjects, subject } = releaseSubject();

  expect(subjects.map((item) => item.id)).toEqual([
    "type",
    "status",
    "assignee",
    "priority",
    "labels",
    "release",
    "dueDate",
  ]);
  expect(subject.label).toBe("tasks:boardFilters.subjects.release");
  expect(
    subject.options.map(({ value, label, count }) => ({ value, label, count })),
  ).toEqual([
    { value: "none", label: "tasks:releases.none", count: 2 },
    { value: "building", label: "Release building", count: undefined },
    { value: "frozen", label: "Release frozen", count: undefined },
    { value: "next", label: "Release next", count: 2 },
    { value: "past", label: "Release past", count: undefined },
  ]);
});

it("keeps a filtered release that no longer exists, named Unknown release", () => {
  const { subject } = releaseSubject({
    controls: controls({ release: ["gone", "none"] }),
  });

  expect(subject.selected).toEqual(["gone", "none"]);
  expect(subject.options.at(-1)).toEqual({
    value: "gone",
    label: "tasks:releases.unknown",
    count: 1,
  });
});

it("names a filtered release as loading until the releases are in", () => {
  const { subject } = releaseSubject({
    controls: controls({ release: ["next"] }),
    options: options({ releases: [], releasesLoading: true }),
  });

  expect(subject.options).toEqual([
    { value: "none", label: "tasks:releases.none", count: 2 },
    { value: "next", label: "common:empty.loading", count: 2 },
  ]);
});

it("toggles, negates and clears the release filter", () => {
  const filterControls = controls({ release: ["next"] });
  const { subject } = releaseSubject({ controls: filterControls });

  subject.onToggle("none");
  subject.onNegate(true);
  subject.onClear();

  expect(filterControls.toggleFilter).toHaveBeenCalledWith("release", "none");
  expect(filterControls.setNegated).toHaveBeenCalledWith("release", true);
  expect(filterControls.updateFilter).toHaveBeenCalledWith("release", null);
});
