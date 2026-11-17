import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { openSecret, sealSecret } from "./secret-box";

const secretA = "a".repeat(32);
const secretB = "b".repeat(32);
const purpose = "assistant-openrouter-key:v1";
const context = "workspace:ws-1";
const plaintext = "sk-or-v1-0123456789abcdef0123456789abcdef";

function split(sealed: string): string[] {
  return sealed.slice("sbx1:".length).split(".");
}

function flipByte(sealed: string, partIndex: number): string {
  const parts = split(sealed);
  const bytes = Buffer.from(parts[partIndex] ?? "", "base64url");
  bytes.writeUInt8(bytes.readUInt8(0) ^ 0x01, 0);
  parts[partIndex] = bytes.toString("base64url");
  return `sbx1:${parts.join(".")}`;
}

describe("secret box", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET_FILE", "");
    vi.stubEnv("AUTH_SECRET", secretA);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("opens what it sealed", () => {
    const sealed = sealSecret(plaintext, purpose, context);

    expect(sealed).toMatch(/^sbx1:[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(openSecret(sealed, purpose, context)).toBe(plaintext);
  });

  it("round-trips an empty string and non-ASCII text", () => {
    for (const value of ["", "ключ — 🔑"]) {
      expect(
        openSecret(sealSecret(value, purpose, context), purpose, context),
      ).toBe(value);
    }
  });

  it("never contains the plaintext", () => {
    const sealed = sealSecret(plaintext, purpose, context);

    expect(sealed).not.toContain(plaintext);
    expect(sealed).not.toContain(Buffer.from(plaintext).toString("base64url"));
  });

  it("uses a fresh IV for every seal", () => {
    const first = sealSecret(plaintext, purpose, context);
    const second = sealSecret(plaintext, purpose, context);

    expect(first).not.toBe(second);
    expect(first.split(".")[0]).not.toBe(second.split(".")[0]);
  });

  it("returns null after AUTH_SECRET changes", () => {
    const sealed = sealSecret(plaintext, purpose, context);
    vi.stubEnv("AUTH_SECRET", secretB);

    expect(openSecret(sealed, purpose, context)).toBeNull();
  });

  it("returns null when AUTH_SECRET is missing instead of throwing", () => {
    const sealed = sealSecret(plaintext, purpose, context);
    vi.stubEnv("AUTH_SECRET", "");

    expect(openSecret(sealed, purpose, context)).toBeNull();
  });

  it("returns null for another context or purpose", () => {
    const sealed = sealSecret(plaintext, purpose, context);

    expect(openSecret(sealed, purpose, "workspace:ws-2")).toBeNull();
    expect(openSecret(sealed, "other-purpose:v1", context)).toBeNull();
  });

  it.each([
    ["iv", 0],
    ["tag", 1],
    ["ciphertext", 2],
  ])("returns null when the %s is tampered with", (_part, index) => {
    const sealed = sealSecret(plaintext, purpose, context);

    expect(openSecret(flipByte(sealed, index), purpose, context)).toBeNull();
  });

  it("returns null for a truncated tag", () => {
    const sealed = sealSecret(plaintext, purpose, context);
    const [iv, tag = "", ciphertext] = split(sealed);
    const shortTag = Buffer.from(tag, "base64url")
      .subarray(0, 8)
      .toString("base64url");

    expect(
      openSecret(`sbx1:${iv}.${shortTag}.${ciphertext}`, purpose, context),
    ).toBeNull();
  });

  it.each([
    "",
    "plain-text-key",
    "enc:v1:abc.def.ghi",
    "sbx1:",
    "sbx1:a.b",
    "sbx1:a.b.c.d",
    "sbx1:!!!.???.***",
    "sbx2:AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.AAAA",
  ])("returns null for the malformed value %p", (value) => {
    expect(openSecret(value, purpose, context)).toBeNull();
  });

  it("returns null for a non-string value", () => {
    expect(openSecret(null as unknown as string, purpose, context)).toBeNull();
  });
});
