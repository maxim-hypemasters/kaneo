import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Release } from "@/types/release";
import { ReleaseRow } from "./release-row";

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => (
    <a href="/release" className={className}>
      {children}
    </a>
  ),
}));

const release: Release = {
  id: "r1",
  projectId: "project-1",
  name: "2.4",
  description: null,
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-20",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  progress: {
    tasks: { total: 0, completed: 0 },
    features: { total: 0, completed: 0 },
    unfinished: 0,
  },
};

function renderRow() {
  render(
    <TooltipProvider delay={0}>
      <ul>
        <ReleaseRow
          release={release}
          counts={{
            tasks: 2,
            completedTasks: 1,
            features: 0,
            completedFeatures: 0,
            unfinished: 1,
          }}
          today="2026-10-17"
          workspaceId="workspace-1"
          permissions={{
            canManage: false,
            canMoveItems: false,
            canDelete: false,
            canCreateTasks: false,
          }}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onMoveUnfinished={vi.fn()}
        />
      </ul>
    </TooltipProvider>,
  );
}

afterEach(cleanup);

describe("ReleaseRow dates", () => {
  it("names a date's kind in a tooltip on hover", async () => {
    renderRow();

    const freeze = screen.getByText("Oct 15").parentElement as HTMLElement;
    expect(freeze).not.toHaveAttribute("title");
    fireEvent.mouseEnter(freeze);

    expect(
      await screen.findByText("tasks:releases.dates.codeFreeze", {
        selector: "[data-slot=tooltip-popup] *",
      }),
    ).toBeVisible();
  });

  it("lifts each date above the row's link for the mouse, not for touch", () => {
    renderRow();

    // The link's ::after covers the row; a date below it never gets a hover.
    expect(screen.getByRole("link", { name: /2\.4/ })).toHaveClass(
      "after:absolute",
      "after:inset-0",
    );
    for (const date of ["Oct 1", "Oct 15", "Oct 20"]) {
      expect(screen.getByText(date).parentElement).toHaveClass(
        "relative",
        "z-10",
        "pointer-coarse:pointer-events-none",
      );
    }
  });
});
