// Limits and defaults for the workspace assistant. Everything is enforced in
// process, so a single instance needs no Redis or other shared store.

export const DEFAULT_ASSISTANT_MODEL = "anthropic/claude-sonnet-5.5";
export const RECOMMENDED_MODELS: readonly string[] = [
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-haiku-5.5",
];
export const REASONING_EFFORT = "low";

// One turn: model calls, tool calls and write proposals.
export const MAX_MODEL_CALLS_PER_TURN = 12;
export const MAX_TOOL_CALLS_PER_STEP = 10;
export const MAX_TOOL_CALLS_PER_TURN = 40;
export const MAX_PROPOSALS_PER_STEP = 10;
export const MAX_OUTPUT_TOKENS = 32_000;

// Streaming from OpenRouter.
export const FIRST_BYTE_TIMEOUT_MS = 60_000;
export const IDLE_TIMEOUT_MS = 60_000;
export const TURN_WALL_CLOCK_MS = 300_000;

// Sizes, in characters.
export const MAX_USER_MESSAGE_CHARS = 8_000;
export const TOOL_RESULT_MAX_CHARS = 16_000;
export const DOCUMENT_RESULT_MAX_CHARS = 32_000;
export const LIST_STRING_MAX_CHARS = 2_000;
export const HISTORY_MAX_CHARS = 120_000;
export const REWRITE_MAX_CHARS = 30_000;

// Loopback tool calls. The concurrency cap protects the database pool.
export const READ_TIMEOUT_MS = 10_000;
export const WRITE_TIMEOUT_MS = 15_000;
export const PARALLEL_READS = 2;
export const LOOPBACK_CONCURRENCY = 4;

// The per-chat turn lease and the SSE keep-alive.
export const LEASE_MS = 60_000;
export const HEARTBEAT_MS = 15_000;

// Turns streaming at once.
export const MAX_TURNS_PER_USER = 2;
export const MAX_TURNS_PER_INSTANCE = 8;

// Per user and workspace, per UTC day.
export const DAILY_MODEL_CALLS_PER_USER = 300;

// Approvals. No write starts after this budget, but one admitted just before
// it can still take a guard read, GET+PUT (WRITE_TIMEOUT_MS each) and a
// summary read, so the worst case stays under a 60 s proxy read timeout.
export const DECISIONS_BUDGET_MS = 10_000;
export const MAX_DECISIONS = 10;

export const CHAT_MESSAGES_PAGE = 300;

export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
export const OPENROUTER_REFERER = "https://kaneo.app";
export const OPENROUTER_TITLE = "Kaneo";
