import { describe, expect, it } from "vite-plus/test";
import type { AssistantModel } from "@/fetchers/assistant/get-assistant-models";
import {
  groupAssistantModels,
  isListedModel,
  matchesModelQuery,
} from "./assistant-model-options";

function model(id: string, name: string, recommended = false): AssistantModel {
  return {
    id,
    name,
    contextLength: 200_000,
    promptPerMTokUsd: 3,
    completionPerMTokUsd: 15,
    recommended,
  };
}

const sonnet = model(
  "anthropic/claude-sonnet-5.5",
  "Anthropic: Claude Sonnet 5.5",
  true,
);
const haiku = model(
  "anthropic/claude-haiku-5.5",
  "Anthropic: Claude Haiku 5.5",
  true,
);
const gpt = model("openai/gpt-6-mini", "OpenAI: GPT-6 Mini");

describe("groupAssistantModels", () => {
  it("puts recommended models first and keeps the API's order", () => {
    expect(groupAssistantModels([gpt, sonnet, haiku])).toEqual([
      { value: "recommended", items: [sonnet, haiku] },
      { value: "all", items: [gpt] },
    ]);
  });

  it("leaves out empty groups", () => {
    expect(groupAssistantModels([gpt])).toEqual([
      { value: "all", items: [gpt] },
    ]);
    expect(groupAssistantModels([])).toEqual([]);
  });
});

describe("matchesModelQuery", () => {
  it("matches every word against the id or the name, ignoring case", () => {
    expect(matchesModelQuery(sonnet, "sonnet")).toBe(true);
    expect(matchesModelQuery(sonnet, "CLAUDE 5.5")).toBe(true);
    expect(matchesModelQuery(sonnet, "anthropic/claude-sonnet")).toBe(true);
    expect(matchesModelQuery(sonnet, "claude gpt")).toBe(false);
    expect(matchesModelQuery(gpt, "openai mini")).toBe(true);
  });

  it("matches everything for a blank query", () => {
    expect(matchesModelQuery(gpt, "  ")).toBe(true);
  });
});

describe("isListedModel", () => {
  it("recognises an exact listed id", () => {
    expect(isListedModel([sonnet, gpt], "openai/gpt-6-mini")).toBe(true);
    expect(isListedModel([sonnet, gpt], " openai/gpt-6-mini ")).toBe(true);
    expect(isListedModel([sonnet, gpt], "openai/gpt")).toBe(false);
    expect(isListedModel([sonnet, gpt], "")).toBe(false);
  });
});
