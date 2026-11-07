import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { FeatureHealth } from "@/fetchers/feature/types";
import { FeatureHealthSelect } from "./feature-health-select";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "tasks:features.workspace.healthLabel": "Update health",
        "tasks:features.workspace.health.on-track": "On track",
        "tasks:features.workspace.health.at-risk": "At risk",
        "tasks:features.workspace.health.off-track": "Off track",
      })[key] ?? key,
  }),
}));
afterEach(cleanup);

function Picker() {
  const [health, setHealth] = useState<FeatureHealth>("on-track");
  return <FeatureHealthSelect value={health} onChange={setHealth} />;
}

it("uses the existing menu control, indicates selection, and colors the trigger", async () => {
  render(<Picker />);
  const trigger = screen.getByRole("button", {
    name: "Update health: On track",
  });
  expect(within(trigger).getByText("On track")).toHaveClass("text-success");
  fireEvent.click(trigger);
  expect(
    await screen.findByRole("menuitemradio", { name: /On track/ }),
  ).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("menuitemradio", { name: /At risk/ }));
  const atRisk = screen.getByRole("button", { name: "Update health: At risk" });
  expect(within(atRisk).getByText("At risk")).toHaveClass("text-warning");
  fireEvent.click(atRisk);
  fireEvent.click(
    await screen.findByRole("menuitemradio", { name: /Off track/ }),
  );
  expect(
    within(
      screen.getByRole("button", { name: "Update health: Off track" }),
    ).getByText("Off track"),
  ).toHaveClass("text-destructive");
});

it("disables the picker during writes or without permission", () => {
  const change = vi.fn();
  render(<FeatureHealthSelect value="on-track" onChange={change} disabled />);
  const trigger = screen.getByRole("button", {
    name: "Update health: On track",
  });
  expect(trigger).toBeDisabled();
  fireEvent.click(trigger);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
});
