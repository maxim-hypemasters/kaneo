import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import type {
  ReleasePlanTask,
  ReleasePlanTaskInputPatch,
} from "@/types/release-plan";
import { ReleasePlanTaskInputs } from "./release-plan-task-inputs";

export function ReleasePlanTaskRow({
  task,
  projectId,
  workspaceId,
  disabled,
  onSavingChange,
  onSaved,
}: {
  task: ReleasePlanTask;
  projectId: string;
  workspaceId: string;
  disabled: boolean;
  onSavingChange: (saving: boolean) => void;
  onSaved: (patch: ReleasePlanTaskInputPatch) => void | Promise<void>;
}) {
  return (
    <li className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-2 py-3 first:pt-0 last:pb-0">
      <TaskTypeGlyph
        type={task.type}
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {task.identifier && (
            <span className="text-xs text-muted-foreground">
              {task.identifier}
            </span>
          )}
          <span className="break-words text-sm font-medium">{task.title}</span>
        </div>
        <ReleasePlanTaskInputs
          task={task}
          projectId={projectId}
          workspaceId={workspaceId}
          disabled={disabled}
          onSavingChange={onSavingChange}
          onSaved={onSaved}
        />
      </div>
    </li>
  );
}
