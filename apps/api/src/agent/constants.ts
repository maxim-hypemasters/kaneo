// Edits within this window collapse into one automatic assessment.
export const AUTO_ASSESS_DELAY_MS = 30_000;
// A runner that has polled within this window counts as online.
export const RUNNER_ONLINE_WINDOW_MS = 60_000;
// lastSeenAt is written at most this often per runner.
export const RUNNER_SEEN_THROTTLE_MS = 15_000;
// A claimed run must heartbeat before its lease ends, or another poll takes it.
export const RUN_LEASE_MS = 120_000;
// Claims per run before an expired lease fails it instead.
export const MAX_RUN_ATTEMPTS = 2;
export const MAX_EVENTS_PER_RUN = 200;
export const EVENT_MESSAGE_MAX_CHARS = 500;
export const CONTEXT_COMMENT_LIMIT = 20;
// Finished assessment runs are pruned after this long; Ship runs are kept.
export const ASSESS_RUN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
