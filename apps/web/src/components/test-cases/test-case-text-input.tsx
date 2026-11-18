import { Textarea } from "@/components/ui/textarea";

// A labelled multi-line field; the dialog and the details both use it.
export function TestCaseTextInput({
  label,
  value,
  onChange,
  onBlur,
  disabled,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      {label}
      <Textarea
        value={value}
        rows={rows}
        maxLength={10_000}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
    </label>
  );
}
