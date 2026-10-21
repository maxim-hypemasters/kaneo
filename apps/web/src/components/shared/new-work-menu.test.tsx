import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { NewWorkMenu } from "./new-work-menu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

describe("NewWorkMenu", () => {
  it.each([
    ["task", "newTask"],
    ["feature", "newFeature"],
    ["bug", "newBug"],
  ])("selects %s from the same three-option menu", async (type, key) => {
    const onSelect = vi.fn();
    render(<NewWorkMenu onSelect={onSelect} />);
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:createMenu.label" }),
    );
    const options = await screen.findAllByRole("menuitem");
    expect(options.map((option) => option.textContent)).toEqual([
      "tasks:createMenu.newTask",
      "tasks:createMenu.newFeature",
      "tasks:createMenu.newBug",
    ]);
    fireEvent.click(
      screen.getByRole("menuitem", { name: `tasks:createMenu.${key}` }),
    );
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(type);
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
  });

  it("returns keyboard focus to its trigger when dismissed without a selection", async () => {
    render(<NewWorkMenu onSelect={vi.fn()} />);
    const trigger = screen.getByRole("button", {
      name: "tasks:createMenu.label",
    });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps a compact custom trigger as one button and respects disabled", () => {
    render(
      <NewWorkMenu disabled onSelect={vi.fn()}>
        <button type="button" data-task-action="addSubtask">
          +
        </button>
      </NewWorkMenu>,
    );
    const trigger = screen.getByRole("button", {
      name: "tasks:createMenu.label",
    });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(trigger).toHaveAttribute("data-task-action", "addSubtask");
    expect(trigger).toBeDisabled();
  });

  it.each([
    ["milestone", "milestoneAction"],
    ["task", "taskAction"],
  ])("offers linking %s after creation actions", async (kind, key) => {
    const onLink = vi.fn();
    render(<NewWorkMenu onSelect={vi.fn()} onLink={onLink} />);
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:createMenu.label" }),
    );
    expect(await screen.findAllByRole("menuitem")).toHaveLength(5);
    expect(screen.getByRole("separator")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("menuitem", { name: `tasks:releases.link.${key}` }),
    );
    expect(onLink).toHaveBeenCalledExactlyOnceWith(kind);
  });

  it("supports linking without creation permission", async () => {
    render(<NewWorkMenu onLink={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:createMenu.label" }),
    );
    const options = await screen.findAllByRole("menuitem");
    expect(options.map((item) => item.textContent)).toEqual([
      "tasks:releases.link.milestoneAction",
      "tasks:releases.link.taskAction",
    ]);
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });
});
