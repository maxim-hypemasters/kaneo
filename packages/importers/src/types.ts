export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type ImportedPriority =
  | "no-priority"
  | "low"
  | "medium"
  | "high"
  | "urgent";

export type ImportedColumn = {
  key: string;
  name: string;
  isFinal: boolean;
};

export type ImportedLabel = {
  key: string;
  name: string;
  color: string;
};

export type ImportedPerson = {
  name?: string;
  email?: string;
};

export type ImportedComment = {
  author: ImportedPerson;
  body: string;
  createdAt?: string;
};

export type ImportedTask = {
  key: string;
  type?: "task" | "bug" | "feature";
  number?: number;
  featureKey?: string | null;
  milestoneKey?: string | null;
  releaseKey?: string | null;
  archivedAt?: string | null;
  planningSnapshots?: ImportedPlanningSnapshot[];
  legacyPlanning?: ImportedPlanningSnapshot;
  columnKey: string | null;
  archived?: boolean;
  title: string;
  description: string;
  priority: ImportedPriority;
  startDate?: string;
  dueDate?: string;
  createdAt?: string;
  assignee?: ImportedPerson;
  labelKeys: string[];
  comments: ImportedComment[];
};

export type ImportedRelationType = "subtask" | "blocks" | "related";

export type ImportedRelation = {
  sourceKey: string;
  targetKey: string;
  type: ImportedRelationType;
};

export type ImportedPlanningSnapshot = {
  createdAt?: string;
  status?: string | null;
  priority?: string | null;
  userId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  releaseId?: string | null;
  releaseName?: string | null;
  archivedAt?: string | null;
};
export type ImportedRelease = {
  key: string;
  name: string;
  startDate: string;
  codeFreezeDate: string;
  submissionDate: string;
};
export type ImportedMilestone = {
  key: string;
  featureKey: string;
  title: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  position: number;
  lead?: ImportedPerson;
  status?: string;
  priority?: ImportedPriority;
  releaseKey?: string | null;
};

export type ImportedProject = {
  name: string;
  key?: string;
  description?: string;
  columns: ImportedColumn[];
  labels: ImportedLabel[];
  tasks: ImportedTask[];
  relations: ImportedRelation[];
  milestones?: ImportedMilestone[];
  releases?: ImportedRelease[];
  warnings: string[];
};

export type SourceProject = {
  id: string;
  name: string;
  detail?: string;
};

export type ReadProjectOptions = {
  includeComments: boolean;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
};

export type ImportSource = {
  listProjects(): Promise<SourceProject[]>;
  readProject(
    projectId: string,
    options: ReadProjectOptions,
  ): Promise<ImportedProject>;
};

export type ConnectOptions = {
  fetch?: FetchLike;
  signal?: AbortSignal;
};
