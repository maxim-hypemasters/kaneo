import type { Release, ReleaseProgress } from "../api/releases.js";
import { releaseUrl } from "../render/links.js";
import { type ReleasePhase, releasePhase } from "./release-phase.js";

export type ReleaseJson = {
  readonly id: string;
  readonly projectId: string;
  readonly projectKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly startDate: string;
  readonly codeFreezeDate: string;
  readonly submissionDate: string;
  readonly phase: ReleasePhase;
  readonly progress: ReleaseProgress | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly url: string;
};

export const EMPTY_PROGRESS: ReleaseProgress = {
  tasks: { total: 0, completed: 0 },
  features: { total: 0, completed: 0 },
  unfinished: 0,
};

export function toReleaseJson(
  release: Release,
  context: {
    readonly today: string;
    readonly webUrl: string;
    readonly project: { readonly slug: string; readonly workspaceId: string };
  },
): ReleaseJson {
  return {
    id: release.id,
    projectId: release.projectId,
    projectKey: context.project.slug.toUpperCase(),
    name: release.name,
    description: release.description,
    startDate: release.startDate,
    codeFreezeDate: release.codeFreezeDate,
    submissionDate: release.submissionDate,
    phase: releasePhase(release, context.today),
    progress: release.progress ?? null,
    createdAt: release.createdAt,
    updatedAt: release.updatedAt,
    url: releaseUrl(context.webUrl, {
      workspaceId: context.project.workspaceId,
      projectId: release.projectId,
      id: release.id,
    }),
  };
}
