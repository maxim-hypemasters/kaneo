import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  format,
  isSameMonth,
  isToday,
  isWeekend,
  startOfToday,
} from "date-fns";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  SquareKanban,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import { GanttLaneHeader } from "@/components/gantt/gantt-lane-header";
import { GanttPeriodControls } from "@/components/gantt/gantt-period-controls";
import { GanttTaskRow } from "@/components/gantt/gantt-task-row";
import type {
  GanttLaneDragState,
  GanttLaneTarget,
  GanttTaskEdit,
  ScheduledTask,
} from "@/components/gantt/gantt-types";
import {
  groupGanttTasks,
  laneKeyForAssignee,
} from "@/components/gantt/group-gantt-tasks";
import {
  blockingDependencies,
  type GanttSpan,
  isDependencyBroken,
  planDependencyMoves,
} from "@/components/gantt/gantt-dependencies";
import { GanttDependencyDialog } from "@/components/gantt/gantt-dependency-dialog";
import { GanttDependencyLines } from "@/components/gantt/gantt-dependency-lines";
import {
  applyPendingEdit,
  classifyEdit,
} from "@/components/gantt/pending-task-edits";
import { paddedSchedule, parseTaskDate } from "@/components/gantt/timeline";
import { useDragToPan } from "@/components/gantt/use-drag-to-pan";
import { useGanttRange } from "@/components/gantt/use-gantt-range";
import { useWheelScrollsTime } from "@/components/gantt/use-wheel-scrolls-time";
import { useGanttTaskCommits } from "@/components/gantt/use-gantt-task-commits";
import PageTitle from "@/components/page-title";
import { DisplaySection } from "@/components/project/display/display-section";
import { GanttGroupByControl } from "@/components/project/display/gantt-group-by-control";
import { WeekStartControl } from "@/components/project/display/week-start-control";
import { ActiveFiltersBar } from "@/components/project/task-filters/active-filters-bar";
import { ProjectToolbar } from "@/components/project/toolbar/project-toolbar";
import { TaskCount } from "@/components/project/toolbar/task-count";
import { useProjectTaskView } from "@/components/project/toolbar/use-project-task-view";
import { LayoutSwitch } from "@/components/project/views/layout-switch";
import { useGoToProjectView } from "@/components/project/views/use-go-to-project-view";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Button } from "@/components/ui/button";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import useGetProjectTaskRelations from "@/hooks/queries/task-relation/use-get-project-task-relations";
import useGetProjectMembers from "@/hooks/queries/workspace-users/use-get-project-members";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { useUserPreferencesStore } from "@/store/user-preferences";

type GanttSearchParams = {
  taskId?: string;
};

const NO_COLLAPSED_LANES: ReadonlySet<string> = new Set();

type TaskAssignee = { name: string | null; image: string | null };

const spansOf = (tasks: readonly ScheduledTask[]) =>
  new Map<string, GanttSpan>(
    tasks.map((task) => [
      task.id,
      { start: task.scheduleStart, end: task.scheduleEnd },
    ]),
  );

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/gantt",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): GanttSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  // isSuccess stays false while only streamed pages of a large board are
  // in, so the chart waits for all tasks before choosing its opening span.
  const { data: project, isSuccess: tasksLoaded } = useGetTasks(projectId);
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const groupByPreference = useUserPreferencesStore(
    (state) => state.ganttGroupBy,
  );
  // Anything but an explicit "assignee" (including a stale stored value)
  // renders the flat timeline.
  const groupByAssignee = groupByPreference === "assignee";
  const { data: projectMembers, isSuccess: membersLoaded } =
    useGetProjectMembers({
      workspaceId,
      projectId,
      enabled: groupByAssignee,
    });
  const { canAssignTasks } = useWorkspacePermission();
  const goToView = useGoToProjectView({
    workspaceId,
    projectId,
    currentRoute: "gantt",
  });
  const view = useProjectTaskView({
    project,
    projectId,
    workspaceId,
    scope: "schedule",
  });
  const filteredProject = view.filters.filteredProject;
  // Collapsed lanes are per visit and per project: a lane collapsed long ago
  // shouldn't silently hide work in a planning view.
  const [collapsedLanes, setCollapsedLanes] = useState<{
    projectId: string;
    keys: ReadonlySet<string>;
  }>({ projectId, keys: NO_COLLAPSED_LANES });
  const collapsedLaneKeys =
    collapsedLanes.projectId === projectId
      ? collapsedLanes.keys
      : NO_COLLAPSED_LANES;
  const toggleLane = (laneKey: string) =>
    setCollapsedLanes((current) => {
      const keys = new Set(
        current.projectId === projectId ? current.keys : NO_COLLAPSED_LANES,
      );
      if (keys.has(laneKey)) {
        keys.delete(laneKey);
      } else {
        keys.add(laneKey);
      }
      return { projectId, keys };
    });
  const [laneDragState, setLaneDragState] = useState<GanttLaneDragState | null>(
    null,
  );
  const laneLabelIdPrefix = useId();
  const isMobile = useIsMobile();
  const [isTaskRailOpen, setIsTaskRailOpen] = useState(false);

  // Wider day columns on small screens so dragging and reading dates is easier.
  const dayColumnWidthRem = isMobile ? 3.125 : 2.75;
  const taskColumnWidthRem = isMobile ? 12 : 14;
  const showTaskRail = !isMobile || isTaskRailOpen;
  const railWidthRem = showTaskRail ? (isMobile ? taskColumnWidthRem : 20) : 0;
  const taskRailWidth = `${railWidthRem}rem`;
  const rowGridTemplateColumns = showTaskRail
    ? `${taskRailWidth} max-content`
    : "max-content";
  const timelineTrackRef = useRef<HTMLDivElement>(null);
  // State, not a ref: the range hook and period controls attach scroll
  // listeners once the container mounts (it doesn't while there's nothing
  // to show).
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );
  const panTimeline = useDragToPan();
  useWheelScrollsTime(scrollElement);
  const [pixelsPerDay, setPixelsPerDay] = useState(44);
  const todayCellRef = useRef<HTMLDivElement>(null);
  // Only auto-scroll once per visit to the view: re-running on every timeline
  // recalculation (e.g. a browser resize crossing the mobile breakpoint) would
  // yank the grid back to today out from under someone who deliberately
  // scrolled elsewhere.
  const hasCenteredOnTodayRef = useRef(false);
  // The Gantt project selector can swap `projectId` without unmounting this
  // route, so the one-time guard above has to be re-armed for the newly
  // selected project. Resetting it here (during render, comparing against the
  // previous projectId) rather than in an effect means it's already cleared
  // by the time the auto-center layout effect below runs for this project,
  // instead of one render later.
  const previousProjectIdRef = useRef(projectId);
  if (previousProjectIdRef.current !== projectId) {
    previousProjectIdRef.current = projectId;
    hasCenteredOnTodayRef.current = false;
  }

  useEffect(() => {
    if (!isMobile) {
      setIsTaskRailOpen(true);
      return;
    }

    setIsTaskRailOpen(false);
  }, [isMobile]);

  const allTasks = useMemo(
    () => [
      ...(project?.columns.flatMap((column) => column.tasks) ?? []),
      ...(project?.plannedTasks ?? []),
    ],
    [project],
  );

  const parsedTasks = useMemo(() => {
    return allTasks
      .map((task) => {
        const parsedStart =
          parseTaskDate(task.startDate) ?? parseTaskDate(task.dueDate);
        const parsedEnd =
          parseTaskDate(task.dueDate) ?? parseTaskDate(task.startDate);

        if (!parsedStart || !parsedEnd) return null;

        const start = parsedStart <= parsedEnd ? parsedStart : parsedEnd;
        const end = parsedEnd >= parsedStart ? parsedEnd : parsedStart;

        return {
          ...task,
          scheduleStart: start,
          scheduleEnd: end,
        };
      })
      .filter((task): task is NonNullable<typeof task> => task !== null)
      .sort(
        (left, right) =>
          left.scheduleStart.getTime() - right.scheduleStart.getTime(),
      );
  }, [allTasks]);

  const { pending: pendingEdits, commit } = useGanttTaskCommits(parsedTasks);
  const { data: relations } = useGetProjectTaskRelations({
    projectId,
    relationType: "blocks",
  });
  const dependencies = useMemo(
    () => blockingDependencies(relations ?? []),
    [relations],
  );
  // A date change that breaks a dependency waits here (shown in place, not
  // saved) while the user decides what to do about it. Only the edit itself
  // is kept, with the dependencies it broke: what still breaks and what would
  // move is worked out from the live data, which can change while the
  // question is open.
  const [heldEdit, setHeldEdit] = useState<{
    taskId: string;
    edit: GanttTaskEdit;
    assignee: TaskAssignee;
    // A plain move or resize takes whoever is assigned when it's saved, so a
    // reassignment made meanwhile isn't undone.
    changesAssignee: boolean;
    brokenIds: ReadonlySet<string>;
  } | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  // Saved drags show right away; rows keep their server-date order until
  // the refetch lands, as they always have.
  const savedTasks = useMemo<ScheduledTask[]>(() => {
    if (pendingEdits.size === 0) return parsedTasks;
    return parsedTasks.map((task) => {
      const edit = pendingEdits.get(task.id);
      return edit ? applyPendingEdit(task, edit) : task;
    });
  }, [parsedTasks, pendingEdits]);
  const savedTasksById = useMemo(
    () => new Map(savedTasks.map((task) => [task.id, task])),
    [savedTasks],
  );
  const savedSpans = useMemo(() => spansOf(savedTasks), [savedTasks]);
  const heldTask = heldEdit ? savedTasksById.get(heldEdit.taskId) : undefined;
  const heldDraft = useMemo(() => {
    if (!heldEdit || !heldTask) return null;
    if (heldEdit.changesAssignee) return heldEdit;
    return {
      edit: { ...heldEdit.edit, userId: heldTask.userId || null },
      assignee: {
        name: heldTask.assigneeName,
        image: heldTask.assigneeImage ?? null,
      },
    };
  }, [heldEdit, heldTask]);
  const heldPlan = useMemo(
    () =>
      heldEdit && heldDraft
        ? planDependencyMoves(
            savedSpans,
            dependencies,
            heldEdit.taskId,
            heldDraft.edit,
            heldEdit.brokenIds,
          )
        : null,
    [heldEdit, heldDraft, savedSpans, dependencies],
  );
  const heldMoves = useMemo(
    () =>
      (heldPlan?.moves ?? []).map((move) => ({
        ...move,
        title: savedTasksById.get(move.taskId)?.title ?? "",
      })),
    [heldPlan, savedTasksById],
  );

  const displayedTasks = useMemo<ScheduledTask[]>(() => {
    if (!heldEdit || !heldDraft) return savedTasks;
    return savedTasks.map((task) =>
      task.id === heldEdit.taskId
        ? applyPendingEdit(task, {
            ...heldDraft.edit,
            seq: -1,
            assigneeName: heldDraft.assignee.name,
            assigneeImage: heldDraft.assignee.image,
            hasStartDate: true,
            hasDueDate: true,
          })
        : task,
    );
  }, [savedTasks, heldEdit, heldDraft]);
  const spans = useMemo(() => spansOf(displayedTasks), [displayedTasks]);
  // Bars whose drag moves an arrow; only they report drags, so other drags
  // never re-render the chart.
  const dependentTaskIds = useMemo(
    () =>
      new Set(
        dependencies.flatMap((dependency) => [
          dependency.blockerId,
          dependency.blockedId,
        ]),
      ),
    [dependencies],
  );
  // The red arrows, in words: for each task starting too early, the tasks
  // that block it and haven't ended yet.
  const earlyStartBlockers = useMemo(() => {
    const titles = new Map(displayedTasks.map((task) => [task.id, task.title]));
    const blockers = new Map<string, string[]>();
    for (const dependency of dependencies) {
      const blocker = spans.get(dependency.blockerId);
      const blocked = spans.get(dependency.blockedId);
      if (!blocker || !blocked || !isDependencyBroken(blocker, blocked)) {
        continue;
      }
      const list = blockers.get(dependency.blockedId) ?? [];
      list.push(titles.get(dependency.blockerId) ?? "");
      blockers.set(dependency.blockedId, list);
    }
    return blockers;
  }, [dependencies, spans, displayedTasks]);
  const dependencyNote = (taskId: string) =>
    earlyStartBlockers
      .get(taskId)
      ?.map((title) =>
        t("tasks:gantt.dependencies.startsBeforeBlocker", { title }),
      )
      .join(" ");

  const scheduledTasks = useMemo(() => {
    const visibleIds = new Set(
      [
        ...(filteredProject?.columns.flatMap((column) => column.tasks) ?? []),
        ...(filteredProject?.plannedTasks ?? []),
      ].map((task) => task.id),
    );
    return displayedTasks.filter((task) => visibleIds.has(task.id));
  }, [displayedTasks, filteredProject]);

  const unassignedLabel = t("tasks:assignee.unassigned");
  const unknownLabel = t("common:people.unknown");
  const assigneeFilterValues = view.filters.filters.assignee;
  const assigneeFilterNegated =
    view.filters.filters.negated?.includes("assignee") ?? false;
  const lanes = useMemo(
    () =>
      groupByAssignee
        ? groupGanttTasks(scheduledTasks, {
            members: projectMembers ?? [],
            membersLoaded,
            assigneeFilter: {
              values: assigneeFilterValues,
              negated: assigneeFilterNegated,
            },
            unassignedLabel,
            unknownLabel,
          })
        : null,
    [
      groupByAssignee,
      scheduledTasks,
      projectMembers,
      membersLoaded,
      assigneeFilterValues,
      assigneeFilterNegated,
      unassignedLabel,
      unknownLabel,
    ],
  );
  const lanesByKey = useMemo(
    () => new Map((lanes ?? []).map((lane) => [lane.key, lane])),
    [lanes],
  );
  const resolveLane = useCallback(
    (laneKey: string): GanttLaneTarget | null =>
      lanesByKey.get(laneKey) ?? null,
    [lanesByKey],
  );
  // Which rows are on screen and in what order; the dependency lines
  // measure them again whenever this changes.
  const renderedRowsKey = lanes
    ? lanes
        .map(
          (lane) =>
            `${lane.key}:${
              collapsedLaneKeys.has(lane.key)
                ? ""
                : lane.tasks.map((task) => task.id).join(",")
            }`,
        )
        .join("|")
    : scheduledTasks.map((task) => task.id).join(",");
  const laneDragEnabled = groupByAssignee && canAssignTasks();
  const dropTargetLaneKey = laneDragState?.targetLaneKey ?? null;

  const commitTaskEdit = (task: ScheduledTask, edit: GanttTaskEdit) => {
    const keepsAssignee = edit.userId === (task.userId || null);
    const targetLane = keepsAssignee
      ? null
      : lanesByKey.get(laneKeyForAssignee(edit.userId));
    const assignee = {
      name: keepsAssignee
        ? task.assigneeName
        : targetLane?.userId
          ? targetLane.name
          : null,
      image: keepsAssignee
        ? (task.assigneeImage ?? null)
        : (targetLane?.image ?? null),
    };
    const broken = classifyEdit(task, edit).dates
      ? planDependencyMoves(savedSpans, dependencies, task.id, edit).broken
      : [];
    if (broken.length > 0) {
      setHeldEdit({
        taskId: task.id,
        edit,
        assignee,
        changesAssignee: !keepsAssignee,
        brokenIds: new Set(broken.map((dependency) => dependency.id)),
      });
      return;
    }
    commit(task, edit, assignee);
  };

  const resolveHeldEdit = (moveRelated: boolean) => {
    setHeldEdit(null);
    if (!heldTask || !heldDraft) return;
    const saved = commit(heldTask, heldDraft.edit, heldDraft.assignee);
    if (!moveRelated) return;
    for (const move of heldPlan?.moves ?? []) {
      const related = savedTasksById.get(move.taskId);
      if (!related) continue;
      // Only once the task the user moved has saved: if that fails, the
      // tasks moved to make room for it stay where they were.
      commit(
        related,
        {
          start: move.to.start,
          end: move.to.end,
          userId: related.userId || null,
        },
        {
          name: related.assigneeName,
          image: related.assigneeImage ?? null,
        },
        { after: saved, keepDateFields: true },
      );
    }
  };

  // The question only stands while the edit still breaks something: drop it
  // when its task is gone, and save it as is once a refetch (someone else
  // moving the other task, or removing the dependency) has made room for
  // every dependency it broke.
  useEffect(() => {
    if (!heldEdit) return;
    if (!heldTask || !heldDraft) {
      setHeldEdit(null);
      return;
    }
    if (heldPlan && heldPlan.broken.length === 0) {
      setHeldEdit(null);
      commit(heldTask, heldDraft.edit, heldDraft.assignee);
    }
  }, [heldEdit, heldTask, heldDraft, heldPlan, commit]);

  const trackDrag = (taskId: string, dragging: boolean) =>
    setDraggingTaskId((current) =>
      dragging ? taskId : current === taskId ? null : current,
    );

  const openTask = (taskId: string) =>
    navigate({
      to: ".",
      search: { taskId },
      replace: true,
    });

  // The rendered days follow the scroll: the span grows as either edge comes
  // near, and jumps re-centre it on dates outside it.
  const { timeline, viewport, scrollToDate, scrollByPage } = useGanttRange({
    projectId,
    tasks: parsedTasks,
    ready: tasksLoaded,
    weekStartsOn,
    dayColumnWidthRem,
    railWidthRem,
    scrollElement,
  });

  // Whether today's column is rendered; "Jump to today" re-centres the span
  // first when it isn't.
  const todayInRange = useMemo(
    () => timeline?.days.some((day) => isToday(day)) ?? false,
    [timeline],
  );
  // Opening the view only centres on today when today is near the project's
  // work. The rendered span is padded to a minimum width, so today can be in
  // it while the work sits months away.
  const todayNearSchedule = useMemo(() => {
    const schedule = paddedSchedule(parsedTasks, weekStartsOn);
    const today = startOfToday();
    return !!schedule && today >= schedule.start && today <= schedule.end;
  }, [parsedTasks, weekStartsOn]);

  // The task rail is `position: sticky; left: 0`, so it stays pinned over the
  // left edge of the scroll container's viewport rather than scrolling away
  // with the timeline underneath it. `scrollIntoView({ inline: "center" })`
  // has no way to know that, and centers the target against the *whole*
  // viewport width, landing today roughly half the rail's width left of
  // where it visually reads as centered. `scroll-padding-left` tells the
  // browser's own scroll-alignment math to treat the rail's width as inset
  // from the viewport, so "center" (and any future "start"/"end" alignment)
  // resolves against the space actually visible next to it.
  const scrollPaddingLeftRem = railWidthRem;

  const scrollToToday = useCallback((behavior: ScrollBehavior = "smooth") => {
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    todayCellRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : behavior,
      inline: "center",
      block: "nearest",
    });
  }, []);

  const jumpToToday = () => {
    if (todayInRange) {
      scrollToToday();
    } else {
      scrollToDate(startOfToday(), "center");
    }
  };

  useLayoutEffect(() => {
    const element = timelineTrackRef.current;
    if (!element || !timeline) return;

    const update = () => {
      const count = timeline.days.length;
      if (count <= 0) return;
      setPixelsPerDay(element.clientWidth / count);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [timeline]);

  // Decide once per project, as soon as its opening span is on screen with
  // all of its tasks in, whether to centre on today: only when today is near
  // the work. Deciding later (when growing the span or a jump brings today
  // into it) would yank the view away from wherever the reader went.
  // `projectId` is listed (though unused in the body) so a project switch on
  // the same route re-runs this after the guard was re-armed during render.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- projectId is intentionally listed to force a re-run on project switch; see comment above.
  useLayoutEffect(() => {
    if (
      hasCenteredOnTodayRef.current ||
      !tasksLoaded ||
      !timeline ||
      !scrollElement
    )
      return;
    hasCenteredOnTodayRef.current = true;
    if (todayInRange && todayNearSchedule) scrollToToday("auto");
  }, [
    tasksLoaded,
    timeline,
    scrollElement,
    todayInRange,
    todayNearSchedule,
    scrollToToday,
    projectId,
  ]);

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="gantt"
      toolbar={
        <ProjectToolbar
          view={view}
          display={
            <>
              <DisplaySection>
                <LayoutSwitch
                  workspaceId={workspaceId}
                  projectId={projectId}
                  currentRoute="gantt"
                  currentView="gantt"
                />
              </DisplaySection>
              <DisplaySection>
                <GanttGroupByControl />
                <WeekStartControl />
              </DisplaySection>
            </>
          }
        />
      }
      summary={
        <TaskCount shown={scheduledTasks.length} total={parsedTasks.length} />
      }
      filterBar={
        <ActiveFiltersBar
          subjects={view.subjects}
          onClear={view.filters.clearFilters}
        />
      }
    >
      <PageTitle
        title={t("tasks:gantt.pageTitle", { name: project?.name })}
        hideAppName
      />
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="border-b border-border/80 px-3 py-2 sm:px-4">
          <h1 className="sr-only">{t("tasks:gantt.title")}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {timeline && (
              <GanttPeriodControls
                timeline={timeline}
                viewport={viewport}
                onGoToDate={(date) => scrollToDate(date, "start", "auto")}
                onPage={scrollByPage}
              />
            )}

            <Button
              variant="outline"
              size="xs"
              className="h-9 touch-manipulation sm:h-auto"
              aria-label={t("tasks:gantt.jumpToToday")}
              onClick={jumpToToday}
              disabled={scheduledTasks.length === 0}
            >
              <Calendar className="size-3.5" />
              <span className="hidden sm:inline">
                {t("tasks:gantt.jumpToToday")}
              </span>
            </Button>

            <Button
              variant="outline"
              size="xs"
              className="h-9 touch-manipulation sm:hidden"
              aria-pressed={showTaskRail}
              onClick={() => setIsTaskRailOpen((current) => !current)}
            >
              {showTaskRail ? (
                <ChevronLeft className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              {showTaskRail
                ? t("tasks:gantt.hideTasks")
                : t("tasks:gantt.showTasks")}
            </Button>
          </div>
        </div>

        {!timeline || parsedTasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-sm text-center">
              <h2 className="text-sm font-semibold text-foreground">
                {t("tasks:gantt.noTasks")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("tasks:gantt.noTasksSubtitle")}
              </p>
              {/* Gantt is the default landing view, so a new or undated
                  project needs a way to its tasks from here. */}
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => goToView("board")}
              >
                <SquareKanban className="size-4" />
                {t("tasks:view.board")}
              </Button>
            </div>
          </div>
        ) : scheduledTasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-sm text-center">
              <h2 className="text-sm font-semibold text-foreground">
                {t("tasks:gantt.noTasksFound")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("tasks:filterBar.noMatches")}
              </p>
            </div>
          </div>
        ) : (
          <div
            ref={setScrollElement}
            data-testid="gantt-scroll-container"
            data-gantt-scroll-container=""
            onPointerDown={panTimeline}
            className={cn(
              "min-h-0 flex-1 overflow-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] data-panning:cursor-grabbing data-panning:[&_*]:cursor-grabbing",
              laneDragState && "cursor-grabbing [&_*]:cursor-grabbing",
            )}
            style={{ scrollPaddingLeft: `${scrollPaddingLeftRem}rem` }}
          >
            <div className="relative min-w-max touch-pan-x touch-pan-y">
              <div className="sticky top-0 z-20 flex border-b border-border bg-background/95 backdrop-blur">
                {showTaskRail ? (
                  <div
                    data-gantt-rail=""
                    className="sticky left-0 z-30 shrink-0 border-r border-border bg-background px-2 py-2.5 sm:w-80 sm:px-4 sm:py-3"
                    style={{
                      width: isMobile ? `${taskColumnWidthRem}rem` : undefined,
                    }}
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("tasks:gantt.taskHeader")}
                    </p>
                  </div>
                ) : null}
                <div
                  className="grid shrink-0 cursor-grab select-none"
                  style={{
                    gridTemplateColumns: timeline.gridTemplateColumns,
                    minWidth: `${timeline.timelineMinWidthRem}rem`,
                  }}
                >
                  {timeline.days.map((day, index) => {
                    const showMonth =
                      index === 0 ||
                      !isSameMonth(day, timeline.days[index - 1] ?? day);

                    const isCurrentDay = isToday(day);

                    return (
                      <div
                        key={day.toISOString()}
                        ref={isCurrentDay ? todayCellRef : undefined}
                        aria-current={isCurrentDay ? "date" : undefined}
                        className={cn(
                          "border-r border-border/70 px-0.5 py-2 text-center sm:px-1",
                          isWeekend(day) && "bg-muted/25",
                        )}
                      >
                        <div className="h-4 text-[10px] font-medium text-muted-foreground">
                          {showMonth ? format(day, "MMM") : ""}
                        </div>
                        <div
                          className={cn(
                            "mx-auto flex size-6 items-center justify-center rounded-full text-xs font-medium",
                            isCurrentDay &&
                              "bg-primary text-primary-foreground",
                          )}
                        >
                          {format(day, "d")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="relative">
                <div
                  ref={timelineTrackRef}
                  className="absolute inset-y-0 z-0 grid"
                  style={{
                    left: taskRailWidth,
                    gridTemplateColumns: timeline.gridTemplateColumns,
                    width: `${timeline.timelineMinWidthRem}rem`,
                  }}
                >
                  {timeline.days.map((day) => (
                    <div
                      key={`bg-line-${day.toISOString()}`}
                      className={cn(
                        "h-full min-h-0 border-r border-border/60",
                        isWeekend(day) && "bg-muted/25",
                      )}
                    />
                  ))}
                </div>

                <div
                  data-gantt-lanes=""
                  className="relative z-10 flex flex-col"
                >
                  {dependencies.length > 0 && (
                    <GanttDependencyLines
                      dependencies={dependencies}
                      spans={spans}
                      timeline={timeline}
                      dayColumnWidthRem={dayColumnWidthRem}
                      railWidthRem={railWidthRem}
                      layoutKey={renderedRowsKey}
                      draggingTaskId={draggingTaskId}
                    />
                  )}
                  {lanes
                    ? lanes.map((lane) => {
                        const collapsed =
                          lane.tasks.length > 0 &&
                          collapsedLaneKeys.has(lane.key);
                        const labelId = `${laneLabelIdPrefix}-${lane.key}`;
                        const laneDrag = laneDragEnabled
                          ? {
                              laneKey: lane.key,
                              resolveLane,
                              onChange: setLaneDragState,
                            }
                          : undefined;
                        return (
                          // No z-index/transform here: a lane must not form
                          // a stacking context, or a bar dragged out of it
                          // would paint underneath the other lanes.
                          <div
                            key={lane.key}
                            role="group"
                            aria-labelledby={labelId}
                            data-gantt-lane={lane.key}
                            data-drop-target={
                              dropTargetLaneKey === lane.key ? "" : undefined
                            }
                            className={cn(
                              "relative",
                              dropTargetLaneKey === lane.key &&
                                "after:pointer-events-none after:absolute after:inset-0 after:z-[12] after:bg-primary/5 after:ring-2 after:ring-inset after:ring-primary/50",
                            )}
                          >
                            <GanttLaneHeader
                              lane={lane}
                              labelId={labelId}
                              collapsed={collapsed}
                              onToggle={() => toggleLane(lane.key)}
                              timeline={timeline}
                              showTaskRail={showTaskRail}
                              rowGridTemplateColumns={rowGridTemplateColumns}
                            />
                            {collapsed
                              ? null
                              : lane.tasks.map((task) => (
                                  <GanttTaskRow
                                    key={task.id}
                                    task={task}
                                    projectSlug={project?.slug}
                                    timeline={timeline}
                                    pixelsPerDay={pixelsPerDay}
                                    isMobile={isMobile}
                                    showTaskRail={showTaskRail}
                                    rowGridTemplateColumns={
                                      rowGridTemplateColumns
                                    }
                                    showAssignee={false}
                                    laneDrag={laneDrag}
                                    onOpenTask={() => openTask(task.id)}
                                    onCommit={(edit) =>
                                      commitTaskEdit(task, edit)
                                    }
                                    onDragChange={
                                      dependentTaskIds.has(task.id)
                                        ? (dragging) =>
                                            trackDrag(task.id, dragging)
                                        : undefined
                                    }
                                    dependencyNote={dependencyNote(task.id)}
                                  />
                                ))}
                          </div>
                        );
                      })
                    : scheduledTasks.map((task) => (
                        <GanttTaskRow
                          key={task.id}
                          task={task}
                          projectSlug={project?.slug}
                          timeline={timeline}
                          pixelsPerDay={pixelsPerDay}
                          isMobile={isMobile}
                          showTaskRail={showTaskRail}
                          rowGridTemplateColumns={rowGridTemplateColumns}
                          showAssignee
                          onOpenTask={() => openTask(task.id)}
                          onCommit={(edit) => commitTaskEdit(task, edit)}
                          onDragChange={
                            dependentTaskIds.has(task.id)
                              ? (dragging) => trackDrag(task.id, dragging)
                              : undefined
                          }
                          dependencyNote={dependencyNote(task.id)}
                        />
                      ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <GanttDependencyDialog
          open={!!heldPlan && heldPlan.broken.length > 0}
          brokenCount={heldPlan?.broken.length ?? 0}
          cycle={heldPlan?.cycle ?? false}
          moves={heldMoves}
          onMoveRelated={() => resolveHeldEdit(true)}
          onMoveOnly={() => resolveHeldEdit(false)}
          onCancel={() => setHeldEdit(null)}
        />

        <TaskDetailsSheet
          taskId={taskId}
          projectId={projectId}
          workspaceId={workspaceId}
          onClose={() =>
            navigate({
              to: ".",
              search: {},
              replace: true,
            })
          }
        />
      </div>
    </ProjectLayout>
  );
}
