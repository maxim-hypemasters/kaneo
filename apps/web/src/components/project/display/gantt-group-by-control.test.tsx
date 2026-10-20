import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { GanttGroupByControl } from "./gantt-group-by-control";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

beforeEach(() => {
  useUserPreferencesStore.setState({ ganttGroupBy: "none" });
});

afterEach(() => {
  cleanup();
});

async function choose(name: string) {
  fireEvent.click(
    screen.getByRole("combobox", { name: "tasks:display.groupBy" }),
    { detail: 1 },
  );
  const option = await screen.findByRole("option", { name });
  fireEvent.pointerDown(option);
  fireEvent.mouseDown(option);
  fireEvent.pointerUp(option);
  fireEvent.mouseUp(option);
  fireEvent.click(option, { detail: 1 });
}

describe("GanttGroupByControl", () => {
  it("switches the Gantt grouping and back", async () => {
    render(<GanttGroupByControl />);
    expect(
      screen.getByRole("combobox", { name: "tasks:display.groupBy" }),
    ).toHaveTextContent("tasks:display.groupByOptions.none");

    await choose("tasks:gantt.milestones.assigneeLead");
    expect(useUserPreferencesStore.getState().ganttGroupBy).toBe("assignee");
    expect(
      screen.getByRole("combobox", { name: "tasks:display.groupBy" }),
    ).toHaveTextContent("tasks:gantt.milestones.assigneeLead");

    await choose("tasks:display.groupByOptions.none");
    expect(useUserPreferencesStore.getState().ganttGroupBy).toBe("none");
  });

  it("groups by feature", async () => {
    render(<GanttGroupByControl />);

    await choose("tasks:milestones.title");

    expect(useUserPreferencesStore.getState().ganttGroupBy).toBe("milestone");
    expect(
      screen.getByRole("combobox", { name: "tasks:display.groupBy" }),
    ).toHaveTextContent("tasks:milestones.title");
  });
});
