import type { ReactNode } from "react";
import {
  fieldDescriptionId,
  fieldErrorId,
} from "@/components/import/connect-forms/field-ids";
import { Label } from "@/components/ui/label";

type AssistantFieldRowProps = {
  // The control's id; the description and error ids derive from it, so the
  // control can point aria-describedby at them with fieldDescribedBy.
  id: string;
  label: ReactNode;
  description: ReactNode;
  error?: string | null;
  children: ReactNode;
};

export function AssistantFieldRow({
  id,
  label,
  description,
  error,
  children,
}: AssistantFieldRowProps) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <div
          id={fieldDescriptionId(id)}
          className="space-y-1 text-xs text-muted-foreground"
        >
          {description}
        </div>
      </div>
      <div className="w-full shrink-0 space-y-1.5 sm:w-80">
        {children}
        {error ? (
          <p
            id={fieldErrorId(id)}
            role="alert"
            className="text-xs text-destructive-foreground"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
