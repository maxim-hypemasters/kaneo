import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { MilestoneCandidate } from "@/fetchers/milestone/get-milestone-candidates";
import { MilestoneTaskPicker } from "./milestone-task-picker";
const mocks = vi.hoisted(() => ({
  tasks: [] as MilestoneCandidate[],
  pending: false,
  error: false,
  refetch: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));
vi.mock("@/hooks/queries/milestone/use-milestone-candidates", () => ({
  useMilestoneCandidates: () => ({
    data: { projectSlug: "WEB", tasks: mocks.tasks },
    isPending: mocks.pending,
    isSuccess: !mocks.pending && !mocks.error,
    isError: mocks.error,
    refetch: mocks.refetch,
  }),
}));
function Picker({
  disabled = false,
  initial = [],
}: {
  disabled?: boolean;
  initial?: string[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MilestoneTaskPicker
        projectId="p"
        featureId="f"
        value={value}
        onChange={setValue}
        disabled={disabled}
      />
      <span data-testid="selection">{JSON.stringify(value)}</span>
    </>
  );
}
const task = (number: number): MilestoneCandidate => ({
  id: `t${number}`,
  title: `Task ${number}`,
  number,
  type: number % 2 ? "task" : "bug",
  milestoneId: null,
});
beforeEach(() => {
  mocks.tasks = [task(1), task(2)];
  mocks.pending = false;
  mocks.error = false;
  vi.clearAllMocks();
});
afterEach(cleanup);
describe("Milestone creation task picker", () => {
  it("names the task ID/type/title without advice text", () => {
    render(<Picker />);
    expect(
      screen.getByRole("checkbox", {
        name: /WEB-2.*tasks:features.typeBug.*Task 2/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("tasks:milestones.linkTasksDescription"),
    ).not.toBeInTheDocument();
  });
  it("hides assigned work and marks a stale assigned selection unavailable", () => {
    mocks.tasks[1] = { ...task(2), milestoneId: "old" };
    render(<Picker initial={["t1", "t2"]} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(
      screen.queryByRole("checkbox", { name: /Task 2/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:milestones.unavailableTasks",
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:milestones.removeUnavailableTasks",
      }),
    );
    expect(screen.getByTestId("selection")).toHaveTextContent('["t1"]');
  });
  it("keeps selected tasks while searching and can clear selection", () => {
    render(<Picker />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Task 1/ }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "WEB-2" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Task 2/ }));
    expect(screen.getByTestId("selection")).toHaveTextContent('["t1","t2"]');
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.clearTasks" }),
    );
    expect(screen.getByTestId("selection")).toHaveTextContent("[]");
  });
  it("searches all loaded tasks beyond the rendered first hundred", () => {
    mocks.tasks = Array.from({ length: 101 }, (_, index) => task(index + 1));
    render(<Picker />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(100);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "WEB-101" },
    });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox", { name: /Task 101/ }));
    expect(screen.getByTestId("selection")).toHaveTextContent('["t101"]');
  });
  it("offers explicit recovery for work removed from this Feature", () => {
    render(<Picker initial={["gone", "t1"]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:milestones.unavailableTasks",
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:milestones.removeUnavailableTasks",
      }),
    );
    expect(screen.getByTestId("selection")).toHaveTextContent('["t1"]');
  });
  it("supports loading, retry, empty and search-empty states", () => {
    mocks.pending = true;
    const { rerender } = render(<Picker />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "tasks:milestones.loadingTasks",
    );
    mocks.pending = false;
    mocks.error = true;
    rerender(<Picker />);
    fireEvent.click(
      screen.getByRole("button", { name: "common:error.tryAgain" }),
    );
    expect(mocks.refetch).toHaveBeenCalledOnce();
    mocks.error = false;
    mocks.tasks = [];
    rerender(<Picker />);
    expect(
      screen.getByText("tasks:milestones.noUnassignedTasks"),
    ).toBeInTheDocument();
    mocks.tasks = [task(1)];
    rerender(<Picker />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "missing" },
    });
    expect(
      screen.getByText("tasks:milestones.noTaskMatches"),
    ).toBeInTheDocument();
  });
  it("disables search and selection while saving", () => {
    render(<Picker disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    for (const box of screen.getAllByRole("checkbox"))
      expect(box).toHaveAttribute("aria-disabled", "true");
  });
  it("selects a focused checkbox with the keyboard", () => {
    render(<Picker />);
    const box = screen.getByRole("checkbox", { name: /Task 1/ });
    box.focus();
    fireEvent.keyDown(box, { key: " " });
    fireEvent.keyUp(box, { key: " " });
    expect(screen.getByTestId("selection")).toHaveTextContent('["t1"]');
  });
});
