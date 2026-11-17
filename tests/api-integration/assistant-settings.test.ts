import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { resetToolModelsCache } from "../../apps/api/src/assistant/openrouter/list-tool-models";
import { resetKeyUsageCache } from "../../apps/api/src/assistant/settings/get-key-usage";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { workspaceAssistantSettingTable } from "../../apps/api/src/database/schema";
import { createApp } from "../../apps/api/src/index";
import { sealSecret } from "../../apps/api/src/utils/secret-box";
import {
  FAKE_KEY_INFO,
  type FakeOpenRouter,
  installFakeOpenRouter,
} from "./helpers/assistant/fake-openrouter";
import { mockSessionsByToken } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import { createWorkspaceMember } from "./helpers/fixtures";

const KEY = "sk-or-v1-integration-0123456789abcdef-SECRET1";
const OTHER_KEY = "sk-or-v1-replacement-fedcba9876543210-SECRET2";
const SONNET = "anthropic/claude-sonnet-5.5";
const HAIKU = "anthropic/claude-haiku-5.5";

type User = typeof schema.userTable.$inferSelect;

let openRouter: FakeOpenRouter;
// Every response body, checked for the keys after each test.
let bodies: string[];

beforeEach(async () => {
  await resetTestDatabase();
  resetToolModelsCache();
  resetKeyUsageCache();
  openRouter = installFakeOpenRouter();
  bodies = [];
});

afterEach(() => {
  openRouter.restore();
  vi.unstubAllEnvs();
  for (const body of bodies) {
    expect(body).not.toContain(KEY);
    expect(body).not.toContain(OTHER_KEY);
  }
});

async function joinWorkspace(workspaceId: string, name: string, role: string) {
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: `user-${randomUUID()}`,
      email: `${randomUUID()}@example.com`,
      emailVerified: true,
      name,
    })
    .returning();
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user!.id,
    role,
    joinedAt: new Date(),
  });
  return user!;
}

async function setup() {
  const { user: admin, workspace } = await createWorkspaceMember({
    role: "admin",
    userName: "Ada Admin",
  });
  const member = await joinWorkspace(workspace.id, "Mo Member", "member");
  mockSessionsByToken([admin, member]);
  const { app } = createApp();

  const send = async (path: string, init: RequestInit) => {
    const response = await app.request(path, init);
    bodies.push(await response.clone().text());
    return response;
  };
  const call = (
    user: User,
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    send(`/api/assistant/${workspace.id}${path}`, {
      method,
      headers: {
        authorization: `Bearer token-${user.id}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
    });
  const save = (user: User, body: unknown) =>
    call(user, "PUT", "/settings", body);
  const json = async (response: Response) => {
    expect(response.status).toBe(200);
    return (await response.json()) as Record<string, unknown>;
  };
  const storedRows = () => db.select().from(workspaceAssistantSettingTable);

  return { admin, member, workspace, send, call, save, json, storedRows };
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await readErrorBody(response)).toMatchObject({ code });
}

describe("assistant settings", () => {
  it("lets members see availability but not the settings", async () => {
    const { admin, member, call, save, json, storedRows } = await setup();

    expect(await json(await call(member, "GET", "/status"))).toEqual({
      enabled: false,
      reason: "not_configured",
      model: null,
      canManage: false,
    });
    await json(await save(admin, { apiKey: KEY, model: SONNET }));

    const statusResponse = await call(member, "GET", "/status");
    const statusText = await statusResponse.clone().text();
    expect(await json(statusResponse)).toEqual({
      enabled: true,
      reason: null,
      model: SONNET,
      canManage: false,
    });
    expect(statusText).not.toContain(KEY.slice(-4));
    expect(await json(await call(admin, "GET", "/status"))).toMatchObject({
      enabled: true,
      canManage: true,
    });

    for (const [method, path, body] of [
      ["GET", "/settings"],
      ["PUT", "/settings", { apiKey: OTHER_KEY, model: HAIKU }],
      ["DELETE", "/settings"],
      ["GET", "/settings/usage"],
      ["GET", "/models"],
    ] as const) {
      await expectError(
        await call(member, method, path, body),
        403,
        "MISSING_PERMISSION",
      );
    }
    const [row] = await storedRows();
    expect(row).toMatchObject({
      model: SONNET,
      apiKeyHint: `…${KEY.slice(-4)}`,
    });
    // The member's PUT never reached OpenRouter.
    expect(openRouter.requestsTo("/key")).toHaveLength(1);
  });

  it("encrypts a saved key and returns only its hint", async () => {
    const { admin, call, save, json, storedRows } = await setup();

    const saved = await json(
      await save(admin, { apiKey: `  ${KEY}  `, model: SONNET }),
    );
    expect(saved).toEqual({
      configured: true,
      keyHint: `…${KEY.slice(-4)}`,
      keyState: "ok",
      model: SONNET,
      defaultModel: SONNET,
      allowDataCollection: false,
      lastError: null,
      updatedAt: expect.any(String),
      updatedBy: { id: admin.id, name: "Ada Admin" },
    });
    expect(await json(await call(admin, "GET", "/settings"))).toEqual(saved);

    const [row] = await storedRows();
    expect(row!.apiKeyCiphertext.startsWith("sbx1:")).toBe(true);
    expect(row!.apiKeyCiphertext).not.toContain(KEY);
    expect(row!.apiKeyCiphertext).not.toContain(KEY.slice(8, 30));
    expect(row!.updatedByUserId).toBe(admin.id);

    const [keyCheck] = openRouter.requestsTo("/key");
    expect(keyCheck?.headers.get("authorization")).toBe(`Bearer ${KEY}`);
  });

  it("stores nothing when OpenRouter rejects the key or can't be reached", async () => {
    const { admin, save, storedRows } = await setup();

    openRouter.setKeyResponse({
      status: 401,
      json: { error: { code: 401, message: `Invalid key ${KEY}` } },
    });
    await expectError(
      await save(admin, { apiKey: KEY, model: SONNET }),
      400,
      "OPENROUTER_KEY_INVALID",
    );

    openRouter.setKeyResponse({ networkError: true });
    await expectError(
      await save(admin, { apiKey: KEY, model: SONNET }),
      502,
      "OPENROUTER_UNREACHABLE",
    );
    expect(await storedRows()).toEqual([]);
  });

  it("accepts only models that support tool calls", async () => {
    const { admin, save, json, storedRows } = await setup();

    for (const model of [
      "openai/not-a-real-model",
      `${SONNET}:batch`,
      "legacy/retired-model",
    ]) {
      await expectError(
        await save(admin, { apiKey: KEY, model }),
        400,
        "ASSISTANT_MODEL_UNSUPPORTED",
      );
    }
    expect(await storedRows()).toEqual([]);

    // A canonical slug is saved as its model id.
    expect(
      await json(
        await save(admin, { apiKey: KEY, model: `${HAIKU}-20261001` }),
      ),
    ).toMatchObject({ model: HAIKU });
  });

  it("saves an unchecked model when the model list can't be loaded", async () => {
    const { admin, save, json, storedRows } = await setup();
    openRouter.setModelsResponse({ status: 503, body: "unavailable" });

    expect(
      await json(await save(admin, { apiKey: KEY, model: "vendor/new-model" })),
    ).toMatchObject({
      configured: true,
      model: "vendor/new-model",
      modelUnverified: true,
    });
    expect(await storedRows()).toMatchObject([{ model: "vendor/new-model" }]);
  });

  it("requires a key when none is saved", async () => {
    const { admin, save, storedRows } = await setup();

    for (const body of [
      { model: SONNET },
      { apiKey: "", model: SONNET },
      { apiKey: "    ", model: SONNET },
    ]) {
      await expectError(
        await save(admin, body),
        400,
        "OPENROUTER_KEY_REQUIRED",
      );
    }
    expect(await storedRows()).toEqual([]);
    expect(openRouter.requestsTo("/key")).toEqual([]);
  });

  it("keeps the saved key when the key is blank or left out", async () => {
    const { admin, save, json, storedRows } = await setup();
    await json(await save(admin, { apiKey: KEY, model: SONNET }));
    const [before] = await storedRows();

    expect(await json(await save(admin, { model: HAIKU }))).toMatchObject({
      keyHint: `…${KEY.slice(-4)}`,
      model: HAIKU,
      allowDataCollection: false,
    });
    expect(
      await json(
        await save(admin, {
          apiKey: "",
          model: SONNET,
          allowDataCollection: true,
        }),
      ),
    ).toMatchObject({ model: SONNET, allowDataCollection: true });
    expect(await json(await save(admin, { model: HAIKU }))).toMatchObject({
      model: HAIKU,
      allowDataCollection: true,
    });
    const [kept] = await storedRows();
    expect(kept!.apiKeyCiphertext).toBe(before!.apiKeyCiphertext);
    expect(openRouter.requestsTo("/key")).toHaveLength(1);

    expect(
      await json(await save(admin, { apiKey: OTHER_KEY, model: HAIKU })),
    ).toMatchObject({ keyHint: `…${OTHER_KEY.slice(-4)}`, keyState: "ok" });
    const [replaced] = await storedRows();
    expect(replaced!.apiKeyCiphertext).not.toBe(before!.apiKeyCiphertext);
  });

  it("reports a key sealed under another AUTH_SECRET as unreadable", async () => {
    const { admin, member, workspace, call, save, json } = await setup();
    vi.stubEnv("AUTH_SECRET_FILE", "");
    vi.stubEnv("AUTH_SECRET", "another-secret-with-at-least-32-characters");
    const sealedElsewhere = sealSecret(
      KEY,
      "assistant-openrouter-key:v1",
      `workspace:${workspace.id}`,
    );
    vi.unstubAllEnvs();
    await db.insert(workspaceAssistantSettingTable).values({
      workspaceId: workspace.id,
      apiKeyCiphertext: sealedElsewhere,
      apiKeyHint: `…${KEY.slice(-4)}`,
      model: SONNET,
      updatedByUserId: admin.id,
    });

    expect(await json(await call(member, "GET", "/status"))).toEqual({
      enabled: false,
      reason: "key_unreadable",
      model: SONNET,
      canManage: false,
    });
    expect(await json(await call(admin, "GET", "/settings"))).toMatchObject({
      configured: true,
      keyState: "unreadable",
      keyHint: `…${KEY.slice(-4)}`,
    });
    await expectError(
      await call(admin, "GET", "/settings/usage"),
      409,
      "ASSISTANT_KEY_UNREADABLE",
    );
    await expectError(
      await save(admin, { model: HAIKU }),
      400,
      "OPENROUTER_KEY_REQUIRED",
    );
    expect(
      await json(await save(admin, { apiKey: KEY, model: HAIKU })),
    ).toMatchObject({ keyState: "ok", model: HAIKU });
    expect(await json(await call(member, "GET", "/status"))).toMatchObject({
      enabled: true,
      reason: null,
    });
  });

  it("removes the key on DELETE", async () => {
    const { admin, member, call, save, json, storedRows } = await setup();
    await json(await save(admin, { apiKey: KEY, model: HAIKU }));

    const removed = {
      configured: false,
      keyHint: null,
      keyState: null,
      model: SONNET,
      defaultModel: SONNET,
      allowDataCollection: false,
      lastError: null,
      updatedAt: null,
      updatedBy: null,
    };
    expect(await json(await call(admin, "DELETE", "/settings"))).toEqual(
      removed,
    );
    expect(await storedRows()).toEqual([]);
    expect(await json(await call(member, "GET", "/status"))).toMatchObject({
      enabled: false,
      reason: "not_configured",
      model: null,
    });
    expect(await json(await call(admin, "DELETE", "/settings"))).toEqual(
      removed,
    );
    await expectError(
      await call(admin, "GET", "/settings/usage"),
      409,
      "ASSISTANT_NOT_CONFIGURED",
    );
  });

  it("reports key usage, cached per key", async () => {
    const { admin, call, save, json } = await setup();
    await json(await save(admin, { apiKey: KEY, model: SONNET }));

    const usage = {
      usageUsd: 1.5,
      limitUsd: 20,
      limitRemainingUsd: 18.5,
      isFreeTier: false,
    };
    expect(await json(await call(admin, "GET", "/settings/usage"))).toEqual(
      usage,
    );
    expect(await json(await call(admin, "GET", "/settings/usage"))).toEqual(
      usage,
    );
    expect(openRouter.requestsTo("/key")).toHaveLength(2);

    // A replaced key is never answered from the old key's cache entry.
    await json(await save(admin, { apiKey: OTHER_KEY, model: SONNET }));
    openRouter.setKeyResponse({
      json: { data: { usage: 0, limit: null, limit_remaining: null } },
    });
    expect(await json(await call(admin, "GET", "/settings/usage"))).toEqual({
      usageUsd: 0,
      limitUsd: null,
      limitRemainingUsd: null,
      isFreeTier: false,
    });
    const keyChecks = openRouter.requestsTo("/key");
    expect(keyChecks).toHaveLength(4);
    expect(keyChecks.at(-1)?.headers.get("authorization")).toBe(
      `Bearer ${OTHER_KEY}`,
    );
  });

  it("records a key OpenRouter rejects when reading usage", async () => {
    const { admin, member, call, save, json } = await setup();
    await json(await save(admin, { apiKey: KEY, model: SONNET }));

    openRouter.setKeyResponse({ networkError: true });
    await expectError(
      await call(admin, "GET", "/settings/usage"),
      502,
      "OPENROUTER_UNREACHABLE",
    );

    openRouter.setKeyResponse({ status: 401, json: { error: { code: 401 } } });
    await expectError(
      await call(admin, "GET", "/settings/usage"),
      400,
      "OPENROUTER_KEY_INVALID",
    );
    expect(await json(await call(admin, "GET", "/settings"))).toMatchObject({
      keyState: "rejected",
      lastError: { code: "OPENROUTER_KEY_INVALID", at: expect.any(String) },
    });
    expect(await json(await call(member, "GET", "/status"))).toEqual({
      enabled: true,
      reason: "key_rejected",
      model: SONNET,
      canManage: false,
    });

    // Changing only the model keeps the rejection: the key was not re-checked.
    expect(await json(await save(admin, { model: SONNET }))).toMatchObject({
      keyState: "rejected",
      lastError: { code: "OPENROUTER_KEY_INVALID" },
    });

    // A new key that OpenRouter accepts clears it.
    openRouter.setKeyResponse({ json: FAKE_KEY_INFO });
    expect(
      await json(await save(admin, { apiKey: OTHER_KEY, model: SONNET })),
    ).toMatchObject({ keyState: "ok", lastError: null });
  });

  it("lists tool-capable models, recommended first, cached", async () => {
    const { admin, call, json } = await setup();

    const { models } = (await json(await call(admin, "GET", "/models"))) as {
      models: Array<Record<string, unknown>>;
    };
    expect(models.map((model) => model.id)).toEqual([
      SONNET,
      HAIKU,
      "openai/gpt-6-mini",
    ]);
    expect(models[0]).toEqual({
      id: SONNET,
      name: "Anthropic: Claude Sonnet 5.5",
      contextLength: 1_000_000,
      promptPerMTokUsd: 3,
      completionPerMTokUsd: 15,
      recommended: true,
    });
    expect(models[2]).toMatchObject({
      promptPerMTokUsd: 0.4,
      completionPerMTokUsd: 1.6,
      recommended: false,
    });
    await json(await call(admin, "GET", "/models"));
    expect(openRouter.requestsTo("/models")).toHaveLength(1);

    resetToolModelsCache();
    openRouter.setModelsResponse({ networkError: true });
    await expectError(
      await call(admin, "GET", "/models"),
      502,
      "OPENROUTER_UNREACHABLE",
    );
  });

  it("refuses API keys", async () => {
    const { admin, workspace, send } = await setup();
    const { key } = await auth.api.createApiKey({
      body: { userId: admin.id, name: "Assistant test" },
    });

    for (const headers of [
      { "x-api-key": key },
      { authorization: `Bearer ${key}` },
    ]) {
      for (const [method, path] of [
        ["GET", "/status"],
        ["GET", "/settings"],
        ["DELETE", "/settings"],
      ]) {
        await expectError(
          await send(`/api/assistant/${workspace.id}${path}`, {
            method,
            headers,
          }),
          403,
          "SESSION_REQUIRED",
        );
      }
      await expectError(
        await send(`/api/assistant/${workspace.id}/settings`, {
          method: "PUT",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ apiKey: KEY, model: SONNET }),
        }),
        403,
        "SESSION_REQUIRED",
      );
    }
    expect(openRouter.requests).toEqual([]);
  });

  it("answers every route with 404 when DISABLE_ASSISTANT=true", async () => {
    const { admin, call, save, json } = await setup();
    await json(await save(admin, { apiKey: KEY, model: SONNET }));
    const before = openRouter.requests.length;
    vi.stubEnv("DISABLE_ASSISTANT", "true");

    for (const [method, path, body] of [
      ["GET", "/status"],
      ["GET", "/settings"],
      ["PUT", "/settings", { apiKey: OTHER_KEY, model: HAIKU }],
      ["DELETE", "/settings"],
      ["GET", "/settings/usage"],
      ["GET", "/models"],
    ] as const) {
      await expectError(
        await call(admin, method, path, body),
        404,
        "ASSISTANT_DISABLED",
      );
    }
    expect(openRouter.requests).toHaveLength(before);
  });

  it("refuses bodies that aren't strict JSON", async () => {
    const { admin, call, storedRows } = await setup();
    const body = JSON.stringify({ apiKey: KEY, model: SONNET });

    for (const contentType of [
      "text/plain",
      "application/x-www-form-urlencoded",
    ]) {
      await expectError(
        await call(admin, "PUT", "/settings", body, {
          "content-type": contentType,
        }),
        400,
        "UNSUPPORTED_CONTENT_TYPE",
      );
    }
    for (const invalid of [
      { apiKey: KEY, model: SONNET, extra: true },
      { apiKey: "too-short", model: SONNET },
      { apiKey: `${KEY}\n`.repeat(2), model: SONNET },
      { apiKey: KEY, model: "" },
      { apiKey: KEY },
    ]) {
      expect((await call(admin, "PUT", "/settings", invalid)).status).toBe(400);
    }
    expect(
      (
        await call(admin, "PUT", "/settings", "x".repeat(9 * 1024), {
          "content-type": "application/json",
        })
      ).status,
    ).toBe(413);
    expect(await storedRows()).toEqual([]);
    expect(openRouter.requests).toEqual([]);
  });

  it("hides another workspace's settings", async () => {
    const { admin, json, save } = await setup();
    await json(await save(admin, { apiKey: KEY, model: SONNET }));
    const other = await createWorkspaceMember({ role: "admin" });
    const { app } = createApp();

    const response = await app.request(
      `/api/assistant/${other.workspace.id}/settings`,
      { headers: { authorization: `Bearer token-${admin.id}` } },
    );
    bodies.push(await response.clone().text());
    expect([403, 404]).toContain(response.status);
    expect(
      await db
        .select()
        .from(workspaceAssistantSettingTable)
        .where(
          eq(workspaceAssistantSettingTable.workspaceId, other.workspace.id),
        ),
    ).toEqual([]);
  });
});
