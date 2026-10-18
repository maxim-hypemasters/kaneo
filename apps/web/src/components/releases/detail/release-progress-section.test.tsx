import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { Release } from "@/types/release";
import type { ReleaseItemCounts } from "@/lib/releases/release-progress";
import { ReleaseProgressSection } from "./release-progress-section";

const m = vi.hoisted(() => ({
  query: {
    data: undefined as unknown,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  useGetReleaseProgress: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values && "count" in values ? `${key}:${values.count}` : key,
  }),
}));
vi.mock("@/hooks/queries/release/use-get-release-progress", () => ({
  useGetReleaseProgress: (...args: unknown[]) => {
    m.useGetReleaseProgress(...args);
    return m.query;
  },
}));
vi.mock("./release-progress-chart", () => ({
  ReleaseProgressChart: () => <div>chart</div>,
}));
const release = {
  id: "release-1",
  projectId: "project-1",
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-20",
} as Release;
const counts: ReleaseItemCounts = {
  tasks: 7,
  completedTasks: 2,
  features: 1,
  completedFeatures: 0,
  unfinished: 6,
};
const today = "2026-10-17";

function renderSection() {
  return render(
    <ReleaseProgressSection release={release} counts={counts} today={today} />,
  );
}

function expectMetadata() {
  for (const [kind, date] of [
    ["start", "Oct 1"],
    ["codeFreeze", "Oct 15"],
    ["submission", "Oct 20"],
  ]) {
    const label = screen.getByText(`tasks:releases.dates.${kind}`);
    expect(label).not.toHaveClass("sr-only");
    expect(label.closest("div")).toHaveTextContent(date);
  }
  expect(
    screen.getByText(
      "tasks:releases.counts.features:1 · tasks:releases.counts.tasks:7 · tasks:releases.counts.unfinished:6",
    ),
  ).toBeInTheDocument();
}

beforeEach(() => {
  m.query = {
    data: undefined,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  };
  m.useGetReleaseProgress.mockClear();
});
afterEach(cleanup);

describe("ReleaseProgressSection", () => {
  it("keeps release dates and counts visible while loading the chosen release", () => {
    renderSection();
    expect(m.useGetReleaseProgress).toHaveBeenCalledWith(
      "project-1",
      "release-1",
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "tasks:releases.chart.loading",
    );
    expectMetadata();
  });

  it("lets a failed request retry without replacing the release page", () => {
    m.query.isError = true;
    renderSection();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:releases.chart.loadError",
    );
    expectMetadata();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:releases.retry" }),
    );
    expect(m.query.refetch).toHaveBeenCalledOnce();
  });

  it("keeps the chart visible while a refresh is pending", () => {
    m.query.data = {};
    m.query.isFetching = true;
    renderSection();
    expect(screen.getByText("chart")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.queryByText("tasks:releases.dates.start"),
    ).not.toBeInTheDocument();
  });
});
