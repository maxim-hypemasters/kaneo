import { z } from "../openapi";

export const MAX_PROJECT_LINKS = 100;

export const projectLinkProjectParam = z.object({ projectId: z.string() });

export const projectLinkParam = projectLinkProjectParam.extend({
  id: z.string(),
});

// The scheme check keeps `javascript:` and friends out of the link's href.
const url = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => /^https?:\/\//i.test(value), "URL must use http or https")
  .openapi({ description: "An HTTP or HTTPS URL" });

const title = z.string().trim().min(1).max(200).openapi({
  description: "The name shown for the link",
});

export const createProjectLinkBody = z.object({ url, title });

export const updateProjectLinkBody = z
  .object({ url: url.optional(), title: title.optional() })
  .refine(
    (body) => body.url !== undefined || body.title !== undefined,
    "Provide a url, a title, or both",
  );

export const reorderProjectLinksBody = z.object({
  links: z
    .array(z.object({ id: z.string(), position: z.number().int().min(0) }))
    .min(1)
    .max(MAX_PROJECT_LINKS)
    .openapi({
      description:
        "Links with the positions to sort them by. Positions express relative order only; the project's links are renumbered from 0. Links left out follow the listed ones in their current order.",
    }),
});
