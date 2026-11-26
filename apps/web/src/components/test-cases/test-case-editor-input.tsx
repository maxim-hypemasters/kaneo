import { DocumentEditor } from "@/components/editor/document-editor";
import type { MentionMember } from "@/components/task/extensions/mention-list";

// A test case text in the create dialog, in the task description's editor.
export function TestCaseEditorInput({
  label,
  placeholder,
  value,
  onChange,
  disabled,
  mentionMembers,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  mentionMembers?: MentionMember[];
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span aria-hidden="true">{label}</span>
      <DocumentEditor
        value={value}
        onChange={onChange}
        ariaLabel={label}
        placeholder={placeholder}
        disabled={disabled}
        mentionMembers={mentionMembers}
        // Three of these share the dialog, so each starts shorter.
        className="[&_.ProseMirror]:min-h-24!"
      />
    </div>
  );
}
