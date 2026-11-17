import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ToolStep } from "./build-conversation-items";
import { ToolSteps } from "./tool-steps";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

afterEach(cleanup);

const steps: ToolStep[] = [
  { id: "1", name: "list_projects", status: "done", errorText: null },
  { id: "2", name: "get_task", status: "error", errorText: "Task not found" },
];

describe("ToolSteps", () => {
  it("shows every step while the answer is being written", () => {
    render(<ToolSteps steps={steps} live />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(/Task not found/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("folds finished steps into one line that opens", () => {
    render(<ToolSteps steps={steps} live={false} />);
    const toggle = screen.getByRole("button", {
      name: "workspace:assistant.steps.lookedAt:2",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listitem")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("keeps a single step visible", () => {
    render(<ToolSteps steps={steps.slice(0, 1)} live={false} />);
    expect(screen.getByRole("listitem")).toHaveTextContent(
      "workspace:assistant.tools.listProjects",
    );
  });
});
