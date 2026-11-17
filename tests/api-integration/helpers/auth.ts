import type { Session, User } from "better-auth/types";
import { vi } from "vite-plus/test";
import { auth } from "../../../apps/api/src/auth";

function createSession(userId: string): Session {
  const now = new Date();

  return {
    id: `session-${userId}`,
    token: `token-${userId}`,
    userId,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: null,
  };
}

export function mockAuthenticatedSession(user: User) {
  return vi.spyOn(auth.api, "getSession").mockResolvedValue({
    session: createSession(user.id),
    user,
  });
}

/**
 * Resolves a session only for `Authorization: Bearer token-<userId>` of one
 * of `users`, so each request is authenticated as the user it names and
 * loopback calls really pass a token. Anything else is anonymous.
 */
export function mockSessionsByToken(users: User[]) {
  const byToken = new Map(users.map((user) => [`token-${user.id}`, user]));
  const resolve = async (context: { headers?: HeadersInit }) => {
    const authorization = new Headers(context?.headers).get("authorization");
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    const user = token ? byToken.get(token) : undefined;
    return user ? { session: createSession(user.id), user } : null;
  };
  return vi
    .spyOn(auth.api, "getSession")
    .mockImplementation(resolve as unknown as typeof auth.api.getSession);
}

export function mockAnonymousSession() {
  return vi.spyOn(auth.api, "getSession").mockResolvedValue(null);
}
