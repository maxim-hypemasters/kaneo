export const DEMO_DESCRIPTION = "Demo data with simulated progress history";

type DemoStage = { date: string; status: string };
export type DemoItem = {
  id: string;
  title: string;
  type: "feature" | "task";
  featureId: string | null;
  status: string;
  stages: DemoStage[];
};
export type DemoRelease = {
  id: string;
  name: string;
  phase: "past" | "active" | "upcoming";
  startDate: string;
  codeFreezeDate: string;
  submissionDate: string;
  trackingDay: string;
  items: DemoItem[];
};

export function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  ) {
    throw new Error("--today must be a calendar day in YYYY-MM-DD form");
  }
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function demoPrefix(projectId: string) {
  return `demo-release-progress:${projectId}:`;
}

const featureTitles = [
  ["Commander onboarding", "Combat foundations"],
  ["Battlefield experience", "Alliance campaign"],
  ["Seasonal events", "Ranked rewards"],
];
const taskTitles = [
  [
    "Introduce the first commander",
    "Explain squad deployment",
    "Add the tutorial battle",
    "Show victory rewards",
    "Save onboarding progress",
    "Balance starting units",
    "Improve attack targeting",
    "Add combat sound cues",
    "Review battle pacing",
    "Polish the loading hints",
  ],
  [
    "Improve the deployment preview",
    "Clarify unit health bars",
    "Add battle speed controls",
    "Review the battle report",
    "Test retreat confirmation",
    "Show alliance objectives",
    "Add campaign progress markers",
    "Refine the alliance overview",
    "Write campaign help text",
    "Plan campaign reward balancing",
  ],
  [
    "Outline the next seasonal event",
    "Design an event landing screen",
    "Plan event mission groups",
    "Prepare event reward previews",
    "Draft event tutorial copy",
    "Define ranked reward tiers",
    "Design the season summary",
    "Plan placement matches",
    "Review reward icon concepts",
    "Draft ranked help text",
  ],
];

function taskStages(
  phase: DemoRelease["phase"],
  start: string,
  today: string,
  index: number,
  finalStatus: string,
): DemoStage[] {
  if (phase === "upcoming")
    return [{ date: shiftDay(today, -1), status: finalStatus }];
  const joinOffset =
    phase === "past"
      ? [0, 0, 1, 2, 3, 5, 6, 7, 8, 9][index]!
      : [0, 0, 0, 1, 1, 2, 3, 4, 5, 6][index]!;
  const stages: DemoStage[] = [
    {
      date: shiftDay(start, joinOffset),
      status: finalStatus === "planned" ? "planned" : "to-do",
    },
  ];
  if (finalStatus === "to-do" || finalStatus === "planned") return stages;
  const started = joinOffset + 2;
  stages.push({ date: shiftDay(start, started), status: "in-progress" });
  if (finalStatus === "in-progress") return stages;
  if (finalStatus === "in-review") {
    stages.push({
      date: shiftDay(start, joinOffset + (phase === "past" ? 5 : 6)),
      status: "in-review",
    });
  } else {
    stages.push({
      date: shiftDay(start, joinOffset + 6 + (index % 3)),
      status: "done",
    });
  }
  return stages;
}

export function buildDemoPlan(projectId: string, today: string): DemoRelease[] {
  shiftDay(today, 0);
  if (!projectId.trim()) throw new Error("--project is required");
  const prefix = demoPrefix(projectId);
  const definitions = [
    {
      version: "0.68",
      phase: "past" as const,
      start: -28,
      freeze: -14,
      submission: -10,
      statuses: [...Array<string>(8).fill("done"), "in-review", "to-do"],
    },
    {
      version: "0.70",
      phase: "active" as const,
      start: -10,
      freeze: 6,
      submission: 10,
      statuses: [
        "done",
        "done",
        "done",
        "in-review",
        "in-review",
        "in-progress",
        "in-progress",
        "to-do",
        "to-do",
        "planned",
      ],
    },
    {
      version: "0.71",
      phase: "upcoming" as const,
      start: 14,
      freeze: 28,
      submission: 32,
      statuses: [...Array<string>(8).fill("planned"), "to-do", "to-do"],
    },
  ];
  return definitions.map((definition, releaseIndex) => {
    const id = `${prefix}${definition.version}`;
    const startDate = shiftDay(today, definition.start);
    const trackingDay =
      definition.phase === "upcoming" ? shiftDay(today, -1) : startDate;
    const features: DemoItem[] = featureTitles[releaseIndex]!.map(
      (title, index) => ({
        id: `${id}:feature-${index + 1}`,
        title: `Demo · ${title}`,
        type: "feature",
        featureId: null,
        status:
          definition.phase === "past"
            ? index === 0
              ? "done"
              : "in-review"
            : definition.phase === "active"
              ? index === 0
                ? "in-review"
                : "in-progress"
              : "planned",
        stages: [],
      }),
    );
    const tasks: DemoItem[] = taskTitles[releaseIndex]!.map((title, index) => {
      const status = definition.statuses[index]!;
      return {
        id: `${id}:task-${index + 1}`,
        title: `Demo · ${title}`,
        type: "task",
        featureId: features[Math.floor(index / 5)]!.id,
        status,
        stages: taskStages(definition.phase, startDate, today, index, status),
      };
    });
    return {
      id,
      name: `Demo · ${definition.version}`,
      phase: definition.phase,
      startDate,
      codeFreezeDate: shiftDay(today, definition.freeze),
      submissionDate: shiftDay(today, definition.submission),
      trackingDay,
      items: [...features, ...tasks],
    };
  });
}
