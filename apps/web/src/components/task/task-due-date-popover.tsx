import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type Task from "@/types/task";

export default function TaskDueDatePopover({
  children,
}: {
  task: Task;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      {Children.map(children, (child) =>
        isValidElement(child)
          ? cloneElement(
              child as ReactElement<{
                disabled?: boolean;
                tabIndex?: number;
                title?: string;
              }>,
              {
                disabled: true,
                tabIndex: -1,
                title: t("tasks:estimate.readOnlyDates"),
              },
            )
          : child,
      )}
    </>
  );
}
