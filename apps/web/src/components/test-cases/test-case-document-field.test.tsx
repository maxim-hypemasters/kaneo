import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { TestCaseDocumentField } from "./test-case-document-field";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/editor/document-draft-guard", () => ({
  useDocumentDraftGuard: () => {},
}));
// The real editor is TipTap; a textarea keeps this test on the field's logic.
vi.mock("@/components/editor/document-editor", () => ({
  DocumentEditor: (props: {
    value: string;
    onChange?: (value: string) => void;
    onRequestEdit?: () => void;
    readOnly?: boolean;
    ariaLabel: string;
    footer?: ReactNode;
  }) => (
    <div>
      <textarea
        aria-label={props.ariaLabel}
        value={props.value}
        readOnly={props.readOnly}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
      {props.onRequestEdit && (
        <button type="button" onClick={props.onRequestEdit}>
          edit
        </button>
      )}
      {props.footer}
    </div>
  ),
}));

afterEach(cleanup);

function field(onSave = vi.fn(async () => {}), value: string | null = "Old") {
  render(
    <TestCaseDocumentField
      documentKey="tc:steps"
      label="Steps"
      placeholder="Add steps"
      value={value}
      canEdit
      onSave={onSave}
    />,
  );
  return onSave;
}

describe("TestCaseDocumentField", () => {
  it("reads until clicked, then saves the edited text", async () => {
    const onSave = field();
    expect(screen.getByLabelText("Steps")).toHaveAttribute("readonly");
    fireEvent.click(screen.getByText("edit"));
    fireEvent.change(screen.getByLabelText("Steps"), {
      target: { value: "1. Pay" },
    });
    fireEvent.click(screen.getByText("common:documentEditor.save"));
    expect(onSave).toHaveBeenCalledWith("1. Pay");
    expect(await screen.findByText("edit")).toBeInTheDocument();
  });

  it("clears the field when the text is blank", () => {
    const onSave = field();
    fireEvent.click(screen.getByText("edit"));
    fireEvent.change(screen.getByLabelText("Steps"), {
      target: { value: "  " },
    });
    fireEvent.click(screen.getByText("common:documentEditor.save"));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("restores the saved text on cancel without saving", () => {
    const onSave = field();
    fireEvent.click(screen.getByText("edit"));
    fireEvent.change(screen.getByLabelText("Steps"), {
      target: { value: "Draft" },
    });
    fireEvent.click(screen.getByText("common:actions.cancel"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Steps")).toHaveValue("Old");
  });

  it("keeps the draft and says so when saving fails", async () => {
    field(
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    fireEvent.click(screen.getByText("edit"));
    fireEvent.change(screen.getByLabelText("Steps"), {
      target: { value: "Draft" },
    });
    fireEvent.click(screen.getByText("common:documentEditor.save"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "common:documentEditor.saveFailed",
    );
    expect(screen.getByLabelText("Steps")).toHaveValue("Draft");
  });
});
