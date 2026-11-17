import { Hono } from "hono";
import { describe, expect, it } from "vite-plus/test";
import { ApiError } from "../../errors/api-error";
import { requireJsonContentType } from "./require-json-content-type";

const app = new Hono()
  .put("/", requireJsonContentType, (c) => c.text("ok"))
  .onError((error, c) =>
    c.json(
      { code: error instanceof ApiError ? error.code : "OTHER" },
      error instanceof ApiError ? error.status : 500,
    ),
  );

function put(contentType?: string) {
  return app.request("/", {
    method: "PUT",
    headers: contentType ? { "content-type": contentType } : {},
    body: "{}",
  });
}

describe("requireJsonContentType", () => {
  it.each([
    "application/json",
    "application/json; charset=utf-8",
    "Application/JSON",
  ])("accepts %s", async (contentType) => {
    expect((await put(contentType)).status).toBe(200);
  });

  it.each([
    "text/plain",
    "text/plain;charset=UTF-8",
    "application/x-www-form-urlencoded",
    "multipart/form-data; boundary=x",
    "application/json-seq",
    "application/jsonx",
  ])("refuses %s", async (contentType) => {
    const response = await put(contentType);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "UNSUPPORTED_CONTENT_TYPE" });
  });

  it("refuses a body without a content type", async () => {
    const response = await app.request("/", {
      method: "PUT",
      body: new Blob(["{}"]),
    });
    expect(response.status).toBe(400);
  });
});
