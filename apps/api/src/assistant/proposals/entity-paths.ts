// GET paths of the entities a proposal names, read as the user over loopback.

const segment = encodeURIComponent;

export const entityPaths = {
  project: (id: string) => `/api/project/${segment(id)}`,
  task: (id: string) => `/api/task/${segment(id)}`,
  milestone: (id: string) => `/api/milestone/${segment(id)}`,
  release: (id: string) => `/api/release/${segment(id)}`,
  page: (id: string) => `/api/project-document/${segment(id)}`,
  featureDocument: (featureId: string, documentId: string) =>
    `/api/feature/${segment(featureId)}/documents/${segment(documentId)}`,
  members: (workspaceId: string) =>
    `/api/workspace/${segment(workspaceId)}/members`,
  labels: (workspaceId: string) =>
    `/api/label/workspace/${segment(workspaceId)}`,
  projectCustomFields: (projectId: string) =>
    `/api/custom-field/project/${segment(projectId)}`,
  taskCustomFields: (taskId: string) =>
    `/api/custom-field/task/${segment(taskId)}`,
  triageMembers: (projectId: string) =>
    `/api/triage/project/${segment(projectId)}/members`,
};
