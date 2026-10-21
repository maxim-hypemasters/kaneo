import { createContext, useContext, type ReactNode } from "react";
import type { TaskReleaseOrigin } from "./task-release-origin";

const TaskReleaseOriginContext = createContext<TaskReleaseOrigin | null>(null);

export function TaskReleaseOriginProvider({
  origin,
  children,
}: {
  origin: TaskReleaseOrigin | null;
  children: ReactNode;
}) {
  return (
    <TaskReleaseOriginContext.Provider value={origin}>
      {children}
    </TaskReleaseOriginContext.Provider>
  );
}

export function useTaskReleaseOrigin() {
  return useContext(TaskReleaseOriginContext);
}
