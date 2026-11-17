import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { AwayBadge } from "@/components/time-off/away/away-badge";
import { BulkActionCommand } from "./bulk-action-command";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

describe("BulkActionCommand", () => {
  it("reads an assignee's away hint next to their name", async () => {
    render(
      <BulkActionCommand
        open
        onOpenChange={vi.fn()}
        groups={[
          {
            value: "assign",
            label: "Assign to",
            items: [
              {
                value: "assign-user-1",
                label: "Ada",
                icon: <AwayBadge label="Away until Nov 20" decorative />,
                hint: "Away until Nov 20",
                onRun: vi.fn(),
              },
              { value: "assign-user-2", label: "Grace", onRun: vi.fn() },
            ],
          },
        ]}
      />,
    );

    // The badge stays hidden from screen readers, so the hint is said once.
    expect(
      await screen.findByRole("option", { name: /^Ada\s*Away until Nov 20$/ }),
    ).toBeTruthy();
    expect(screen.getByRole("option", { name: "Grace" })).toBeTruthy();
  });
});
