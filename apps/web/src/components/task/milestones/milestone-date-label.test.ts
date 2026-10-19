import { describe, expect, it, vi } from "vite-plus/test";
import { milestoneDateLabel } from "./milestone-date-label";
vi.mock("@/lib/format", () => ({
  formatDateShort: (date: string) => date.slice(0, 10),
}));
const t = (key: string, options: Record<string, unknown>) =>
  `${key} ${JSON.stringify(options)}`;
describe("milestone date labels", () => {
  it("shows both boundaries without turning them into task deadlines", () => {
    expect(
      milestoneDateLabel({ startDate: "2026-11-01", endDate: "2026-11-04" }, t),
    ).toBe(
      'tasks:milestones.dateRange {"start":"2026-11-01","end":"2026-11-04"}',
    );
  });
  it("supports either optional boundary and no dates", () => {
    expect(
      milestoneDateLabel({ startDate: "2026-11-01", endDate: null }, t),
    ).toBe('tasks:milestones.startsOn {"date":"2026-11-01"}');
    expect(
      milestoneDateLabel({ startDate: null, endDate: "2026-11-04" }, t),
    ).toBe('tasks:milestones.endsOn {"date":"2026-11-04"}');
    expect(
      milestoneDateLabel({ startDate: null, endDate: null }, t),
    ).toBeNull();
  });
});
