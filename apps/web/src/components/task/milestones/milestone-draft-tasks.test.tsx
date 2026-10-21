import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { MilestoneDraftTask } from "./milestone-draft-task";
import { MilestoneDraftTasks } from "./milestone-draft-tasks";
import { MilestoneDraftTaskRow } from "./milestone-draft-task-row";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(cleanup);

describe("Milestone draft task limits", () => {
  it("locks an already open type selector when submission starts", async () => {
    const task = { id: "draft", title: "Draft", type: "task" as const };
    const onChange = vi.fn();
    const props = { task, index: 1, onChange, onRemove: vi.fn() };
    const { rerender } = render(<MilestoneDraftTaskRow {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.newTaskType" }),
    );
    await screen.findByRole("menuitemradio", {
      name: "tasks:features.typeBug",
    });
    rerender(<MilestoneDraftTaskRow {...props} disabled />);
    const bug = screen.getByRole("menuitemradio", {
      name: "tasks:features.typeBug",
    });
    expect(bug).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(bug);
    expect(onChange).not.toHaveBeenCalled();
  });
  it("bounds new work at 100 and restores capacity when a draft is removed", async () => {
    function Drafts() {
      const [tasks, setTasks] = useState<MilestoneDraftTask[]>(
        Array.from({ length: 100 }, (_, index) => ({
          id: String(index),
          title: `Task ${index}`,
          type: "task",
        })),
      );
      return <MilestoneDraftTasks value={tasks} onChange={setTasks} />;
    }
    render(<Drafts />);
    expect(
      screen.getByRole("button", { name: "tasks:createMenu.label" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "tasks:milestones.removeNewTask",
      })[99],
    );
    expect(
      screen.getByRole("button", { name: "tasks:createMenu.label" }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:createMenu.label" }),
    );
    expect(
      (await screen.findAllByRole("menuitem")).map((item) => item.textContent),
    ).toEqual(["tasks:createMenu.newTask", "tasks:createMenu.newBug"]);
    fireEvent.click(
      screen.getByRole("menuitem", { name: "tasks:createMenu.newBug" }),
    );
    expect(screen.getAllByRole("textbox")).toHaveLength(100);
    expect(
      screen.getByRole("button", { name: "tasks:createMenu.label" }),
    ).toBeDisabled();
  });
});
