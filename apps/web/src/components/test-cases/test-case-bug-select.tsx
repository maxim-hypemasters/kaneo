import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { projectBugs } from "./project-bugs";

const NONE = "none";

export function TestCaseBugSelect({
  projectId,
  value,
  currentTitle,
  onChange,
  disabled,
}: {
  projectId: string;
  value: string | null;
  // Shown when the linked bug isn't on the board, e.g. archived.
  currentTitle?: string | null;
  onChange: (bugId: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { data: project, isPending } = useGetTasks(projectId, {
    refetchOnMount: false,
  });
  const bugs = projectBugs(project);
  const selected = bugs.find((bug) => bug.id === value);
  const label = (bug: { number: number | null; title: string }) =>
    bug.number === null ? bug.title : `#${bug.number} ${bug.title}`;
  return (
    <Select
      value={value ?? NONE}
      disabled={disabled || isPending}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next === NONE ? null : next);
      }}
    >
      <SelectTrigger size="sm" aria-label={t("tasks:testCases.fields.bug")}>
        <SelectValue>
          {value === null
            ? t("tasks:testCases.noBug")
            : selected
              ? label(selected)
              : (currentTitle ?? t("tasks:testCases.hiddenBug"))}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t("tasks:testCases.noBug")}</SelectItem>
        {bugs.map((bug) => (
          <SelectItem key={bug.id} value={bug.id}>
            {label(bug)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
