import type { TFunction } from "i18next";
import { z } from "zod";

// The longest description the details route accepts.
export const PROJECT_DESCRIPTION_MAX = 10_000;

export function createProjectFormSchema(
  t: TFunction,
  { descriptionMax }: { descriptionMax?: number } = {},
) {
  const description = z.string();
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("settings:projectGeneral.validation.nameRequired")),
    slug: z
      .string()
      .trim()
      .min(1, t("settings:projectGeneral.validation.keyRequired"))
      .max(8, t("settings:projectGeneral.validation.keyMax")),
    description: (descriptionMax
      ? description.max(
          descriptionMax,
          t("settings:projectGeneral.validation.descriptionMax", {
            max: descriptionMax,
          }),
        )
      : description
    ).optional(),
    icon: z
      .string()
      .min(1, t("settings:projectGeneral.validation.iconRequired")),
  });
}
