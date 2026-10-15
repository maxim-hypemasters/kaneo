import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { DefaultViewRow } from "./default-view-row";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const option = (name: string) =>
  screen.getByRole("button", { name: `settings:preferencesPage.${name}` });

afterEach(() => {
  cleanup();
  localStorage.removeItem("user-preferences");
  useUserPreferencesStore.setState({
    defaultProjectView: "gantt",
    viewMode: "board",
  });
});

it("preselects Gantt", () => {
  render(<DefaultViewRow />);

  expect(option("gantt")).toHaveAttribute("aria-pressed", "true");
  expect(option("board")).toHaveAttribute("aria-pressed", "false");
});

it("sets the default view and the board's mode for Board and List", () => {
  render(<DefaultViewRow />);

  fireEvent.click(option("list"));
  expect(useUserPreferencesStore.getState()).toMatchObject({
    defaultProjectView: "list",
    viewMode: "list",
  });

  fireEvent.click(option("board"));
  expect(useUserPreferencesStore.getState()).toMatchObject({
    defaultProjectView: "board",
    viewMode: "board",
  });

  useUserPreferencesStore.setState({ viewMode: "list" });
  fireEvent.click(option("gantt"));
  expect(useUserPreferencesStore.getState()).toMatchObject({
    defaultProjectView: "gantt",
    viewMode: "list",
  });
});

it("keeps the current view when the pressed option is clicked again", () => {
  render(<DefaultViewRow />);

  fireEvent.click(option("gantt"));

  expect(useUserPreferencesStore.getState().defaultProjectView).toBe("gantt");
  expect(option("gantt")).toHaveAttribute("aria-pressed", "true");
});
