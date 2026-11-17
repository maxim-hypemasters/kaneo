import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { MAX_OUTPUT_TOKENS } from "../constants";
import { resetToolModelsCache } from "./list-tool-models";
import { estimateTokens } from "./max-output-tokens";
import { resolveMaxOutputTokens } from "./resolve-max-output-tokens";
import type { ChatMessage, ToolDefinition } from "./types";

const MODEL = "vendor/small-window";

function stubModels(response: () => Response) {
  const fetchMock = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const messages: ChatMessage[] = [
  { role: "system", content: "You are the Kaneo assistant." },
  { role: "user", content: "x".repeat(70_000) },
];
const tools: ToolDefinition[] = [
  {
    type: "function",
    function: { name: "list_projects", description: "", parameters: {} },
  },
];

beforeEach(() => {
  resetToolModelsCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveMaxOutputTokens", () => {
  it("leaves the request room in a small context window", async () => {
    stubModels(() =>
      Response.json({
        data: [
          {
            id: MODEL,
            context_length: 30_000,
            top_provider: { max_completion_tokens: 16_000 },
          },
        ],
      }),
    );
    const requestTokens = estimateTokens(
      JSON.stringify({ messages, tools }).length,
    );
    await expect(resolveMaxOutputTokens(MODEL, messages, tools)).resolves.toBe(
      30_000 - requestTokens,
    );
  });

  it("asks for the default without the model list", async () => {
    stubModels(() => new Response("down", { status: 503 }));
    await expect(resolveMaxOutputTokens(MODEL, messages, tools)).resolves.toBe(
      MAX_OUTPUT_TOKENS,
    );
  });
});
