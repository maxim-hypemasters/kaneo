import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { TaskTypeChip } from "./task-type-chip";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

describe("TaskTypeChip", () => {
  it("names the type for screen readers and shows the current one", () => {
    render(<TaskTypeChip value="feature" onChange={vi.fn()} />);

    expect(
      screen.getByRole("button", {
        name: "common:modals.createTask.type common:modals.createTask.typeFeature",
      }),
    ).toBeInTheDocument();
  });

  it("switches between task and feature", async () => {
    const onChange = vi.fn();
    render(<TaskTypeChip value="task" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));
    const task = await screen.findByRole("menuitemradio", {
      name: /typeTask/,
    });
    expect(task).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: /typeFeature/ }));

    expect(onChange).toHaveBeenCalledWith("feature");
  });
});
