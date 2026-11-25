import { type SQLWrapper, sql } from "drizzle-orm";

// Notifications about a comment point at the document it is on: a project
// page or a Feature document.
export const DOCUMENT_RESOURCE_TYPES = [
  "project_document",
  "feature_document",
] as const;

export type DocumentResourceType = (typeof DOCUMENT_RESOURCE_TYPES)[number];

export function isDocumentResourceType(
  type: string | null | undefined,
): type is DocumentResourceType {
  return (DOCUMENT_RESOURCE_TYPES as readonly string[]).includes(type ?? "");
}

// The project a document is in now, or null for any other resource. A Feature
// can move to another project, so this is read through the Feature each time.
export function documentResourceProjectId(
  resourceId: string | null | SQLWrapper,
  resourceType: string | null | SQLWrapper,
) {
  return sql<string | null>`(CASE ${resourceType}::text
    WHEN 'project_document' THEN (
      SELECT notification_page.project_id
      FROM project_document AS notification_page
      WHERE notification_page.id = ${resourceId}::text
    )
    WHEN 'feature_document' THEN (
      SELECT notification_feature.project_id
      FROM feature_document AS notification_feature_document
      JOIN task AS notification_feature
        ON notification_feature.id = notification_feature_document.feature_id
      WHERE notification_feature_document.id = ${resourceId}::text
    )
  END)`;
}
