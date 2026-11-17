import { createRequire } from "node:module";

// The installed date-holidays version. Plan revisions include it, so bumping
// the pinned package marks plans of members with a calendar outdated.
export const HOLIDAY_DATA_VERSION: string = createRequire(import.meta.url)(
  "date-holidays/package.json",
).version;
