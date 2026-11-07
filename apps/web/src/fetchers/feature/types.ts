export type FeatureHealth = "on-track" | "at-risk" | "off-track";

export type FeatureMilestoneSnapshot = {
  id: string;
  title: string;
  position: number;
  total: number;
  started: number;
  completed: number;
  previousTotal: number | null;
  previousCompleted: number | null;
};

export type FeatureUpdateData = {
  health: FeatureHealth;
  milestones: FeatureMilestoneSnapshot[];
};

export type FeatureActivityItem = {
  id: string;
  taskId: string;
  type: string;
  content: string | null;
  eventData?: unknown;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  userName: string | null;
  userImage: string | null;
  externalUserName?: string | null;
  externalUserAvatar?: string | null;
  externalSource?: string | null;
  externalUrl?: string | null;
};

export type FeatureDocument = {
  id: string;
  featureId: string;
  title: string;
  body: string;
  revision: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FeatureDocumentSummary = Omit<FeatureDocument, "body">;

export type FeaturePage<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type FeatureUpdateInput = {
  note: string;
  health: FeatureHealth;
  draftAssetIds?: string[];
};
