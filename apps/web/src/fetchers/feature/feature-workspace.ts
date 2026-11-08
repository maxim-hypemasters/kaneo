import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type {
  FeatureActivityItem,
  FeatureDocument,
  FeatureDocumentSummary,
  FeaturePage,
  FeatureUpdateInput,
} from "./types";

async function result<T>(response: Response): Promise<T> {
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export async function getLatestFeatureUpdate(id: string) {
  return result<FeatureActivityItem | null>(
    await client.feature[":id"].updates.latest.$get({ param: { id } }),
  );
}

export async function getFeatureUpdate(id: string, updateId: string) {
  return result<FeatureActivityItem>(
    await client.feature[":id"].updates[":updateId"].$get({
      param: { id, updateId },
    }),
  );
}

export async function getFeatureActivity(id: string, page: number) {
  return result<FeaturePage<FeatureActivityItem>>(
    await client.feature[":id"].activity.$get({
      param: { id },
      query: { page: String(page), limit: "30" },
    }),
  );
}

export async function publishFeatureUpdate(
  id: string,
  input: FeatureUpdateInput,
) {
  return result<FeatureActivityItem>(
    await client.feature[":id"].updates.$post({ param: { id }, json: input }),
  );
}

export async function editFeatureUpdate(
  id: string,
  updateId: string,
  input: FeatureUpdateInput,
) {
  return result<FeatureActivityItem>(
    await client.feature[":id"].updates[":updateId"].$put({
      param: { id, updateId },
      json: input,
    }),
  );
}

export async function deleteFeatureUpdate(id: string, updateId: string) {
  const response = await client.feature[":id"].updates[":updateId"].$delete({
    param: { id, updateId },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
}

export async function getFeatureDocuments(
  id: string,
  search: string,
  page: number,
) {
  return result<FeaturePage<FeatureDocumentSummary>>(
    await client.feature[":id"].documents.$get({
      param: { id },
      query: { search, page: String(page), limit: "30" },
    }),
  );
}

export async function getFeatureDocument(id: string, documentId: string) {
  return result<FeatureDocument>(
    await client.feature[":id"].documents[":documentId"].$get({
      param: { id, documentId },
    }),
  );
}

export async function createFeatureDocument(
  id: string,
  input: { title: string; body: string; draftAssetIds?: string[] },
) {
  return result<FeatureDocument>(
    await client.feature[":id"].documents.$post({ param: { id }, json: input }),
  );
}

export async function updateFeatureDocument(
  id: string,
  documentId: string,
  input: {
    title?: string;
    body?: string;
    expectedRevision: number;
    draftAssetIds?: string[];
    // Autosaves keep uploads they removed; pruneFeatureAssets releases them.
    keepRemovedAssets?: boolean;
  },
) {
  return result<FeatureDocument>(
    await client.feature[":id"].documents[":documentId"].$put({
      param: { id, documentId },
      json: input,
    }),
  );
}

export async function deleteFeatureDocument(id: string, documentId: string) {
  const response = await client.feature[":id"].documents[":documentId"].$delete(
    {
      param: { id, documentId },
    },
  );
  if (!response.ok) throw await HttpError.fromResponse(response);
}

export async function pruneFeatureAssets(id: string, assetIds: string[]) {
  return result<{ deletedAssetIds: string[] }>(
    await client.feature[":id"].assets.prune.$post(
      { param: { id }, json: { assetIds } },
      // Sent as a page closes, so it should outlive the page.
      { init: { keepalive: true } },
    ),
  );
}
