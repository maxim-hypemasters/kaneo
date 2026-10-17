import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { FeatureBadge } from "./feature-badge";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

it("labels a feature without becoming a control", () => {
  render(<FeatureBadge className="extra" />);

  const badge = screen.getByText("tasks:features.badge");
  expect(badge).toBeVisible();
  expect(badge).toHaveClass("extra");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
