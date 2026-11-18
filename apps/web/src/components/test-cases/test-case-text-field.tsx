import { useState } from "react";
import { TestCaseTextInput } from "./test-case-text-input";

// Saves on blur when the text changed; an empty field clears it.
export function TestCaseTextField({
  label,
  value,
  onSave,
  disabled,
  rows,
}: {
  label: string;
  value: string | null;
  onSave: (value: string | null) => void;
  disabled?: boolean;
  rows?: number;
}) {
  const [draft, setDraft] = useState(value ?? "");
  return (
    <TestCaseTextInput
      label={label}
      value={draft}
      onChange={setDraft}
      disabled={disabled}
      rows={rows}
      onBlur={() => {
        if (draft === (value ?? "")) return;
        onSave(draft.trim() ? draft : null);
      }}
    />
  );
}
