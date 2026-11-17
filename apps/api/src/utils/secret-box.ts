import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { resolveAuthSecret } from "./auth-secret";

const PREFIX = "sbx1:";
const ALGORITHM = "aes-256-gcm";
const HKDF_SALT = "kaneo-secret-box";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const BASE64URL = /^[A-Za-z0-9_-]*$/;

// Each purpose gets its own subkey of AUTH_SECRET, so a ciphertext sealed for
// one feature can never be opened as another's.
function deriveKey(purpose: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", resolveAuthSecret(), HKDF_SALT, purpose, KEY_BYTES),
  );
}

/**
 * Encrypts a secret at rest with AES-256-GCM. `context` is bound as
 * additional authenticated data, so the ciphertext only opens for the same
 * owner (for example `workspace:<id>`).
 */
export function sealSecret(
  plaintext: string,
  purpose: string,
  context: string,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(purpose), iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decodePart(part: string | undefined): Buffer | null {
  if (part === undefined || !BASE64URL.test(part)) return null;
  return Buffer.from(part, "base64url");
}

/**
 * Decrypts a value from `sealSecret`. Returns null on any failure (malformed
 * input, a rotated AUTH_SECRET, another purpose or context, tampering) and
 * never throws, so callers can ask for the secret again instead of failing.
 */
export function openSecret(
  sealed: string,
  purpose: string,
  context: string,
): string | null {
  try {
    if (typeof sealed !== "string" || !sealed.startsWith(PREFIX)) return null;
    const parts = sealed.slice(PREFIX.length).split(".");
    if (parts.length !== 3) return null;
    const [iv, tag, ciphertext] = parts.map(decodePart);
    if (!iv || !tag || !ciphertext) return null;
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;

    const decipher = createDecipheriv(ALGORITHM, deriveKey(purpose), iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
