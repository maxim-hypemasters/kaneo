import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { NewFeatureButton } from "./new-feature-button";

const state = vi.hoisted(() => ({
  creatable: ["task", "feature", "bug"],
  creation: null as null | { type: string; projectId: string },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canWorkItem: (type: string) => state.creatable.includes(type),
  }),
}));
vi.mock("@/components/shared/modals/create-task-modal", () => ({
  default: (props: {
    type: string;
    projectId: string;
    onClose: () => void;
  }) => {
    state.creation = { type: props.type, projectId: props.projectId };
    return (
      <div role="dialog">
        <button type="button" onClick={props.onClose}>
          Close
        </button>
      </div>
    );
  },
}));

afterEach(() => {
  cleanup();
  state.creatable = ["task", "feature", "bug"];
  state.creation = null;
});

describe("NewFeatureButton", () => {
  it("opens feature creation for the project", () => {
    render(<NewFeatureButton projectId="project-1" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:createMenu.newFeature" }),
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(state.creation).toEqual({ type: "feature", projectId: "project-1" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides without permission to create features", () => {
    state.creatable = ["task", "bug"];
    render(<NewFeatureButton projectId="project-1" />);
    expect(
      screen.queryByRole("button", { name: "tasks:createMenu.newFeature" }),
    ).toBeNull();
  });
});
