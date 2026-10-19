import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { MilestonePicker } from "./milestone-picker";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/queries/milestone/use-get-milestones", () => ({
  useGetMilestones: () => ({
    data: [{ id: "m1", title: "Alpha" }],
    isPending: false,
    isError: false,
  }),
}));
afterEach(cleanup);
describe("Milestone picker", () => {
  it("offers same-feature milestones and explicit clearing", async () => {
    const onChange = vi.fn();
    render(
      <MilestonePicker
        projectId="p"
        featureId="f"
        value="m1"
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.property: Alpha" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "tasks:milestones.none" }),
    );
    expect(onChange).toHaveBeenCalledWith(null);
  });
  it("supports selecting by keyboard", async () => {
    const onChange = vi.fn();
    render(
      <MilestonePicker
        projectId="p"
        featureId="f"
        value={null}
        onChange={onChange}
      />,
    );
    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const option = await screen.findByRole("menuitem", { name: "Alpha" });
    option.focus();
    fireEvent.keyDown(option, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("m1");
  });
});
