import { describe, expect, it } from "vite-plus/test";
import { assessmentResultSchema } from "./assessment-schema";

const base = { score: 80, questions: [], suggestions: [] };

describe("assessmentResultSchema", () => {
  it("treats recommendations that are not an object as none", () => {
    for (const recommendations of [[], "none", 3, null]) {
      const result = assessmentResultSchema.safeParse({
        ...base,
        recommendations,
      });
      expect(result.success).toBe(true);
      expect(result.data?.recommendations).toBeUndefined();
    }
  });

  it("passes an object through for parseRecommendations to read", () => {
    const recommendations = { estimate: "bad", priority: { priority: "low" } };
    expect(
      assessmentResultSchema.parse({ ...base, recommendations })
        .recommendations,
    ).toEqual(recommendations);
    expect(assessmentResultSchema.parse(base).recommendations).toBeUndefined();
  });
});
