import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { openAssistantKey, sealAssistantKey } from "./assistant-key-box";

const KEY = "sk-or-v1-0123456789abcdef0123456789abcdef";

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET_FILE", "");
  vi.stubEnv("AUTH_SECRET", "a".repeat(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("assistant key box", () => {
  it("opens a key only for the workspace it was sealed for", () => {
    const sealed = sealAssistantKey("ws-1", KEY);
    expect(sealed.startsWith("sbx1:")).toBe(true);
    expect(sealed).not.toContain(KEY);
    expect(openAssistantKey("ws-1", sealed)).toBe(KEY);
    expect(openAssistantKey("ws-2", sealed)).toBeNull();
  });

  it("cannot open a key after AUTH_SECRET changes", () => {
    const sealed = sealAssistantKey("ws-1", KEY);
    vi.stubEnv("AUTH_SECRET", "b".repeat(32));
    expect(openAssistantKey("ws-1", sealed)).toBeNull();
  });
});
