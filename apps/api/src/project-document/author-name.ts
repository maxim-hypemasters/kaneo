import { eq } from "drizzle-orm";
import { userTable } from "../database/schema";
import type { DocumentTransaction } from "./access";

// Pages keep the author's name so the tree can show it without a join.
export async function authorName(tx: DocumentTransaction, userId: string) {
  const [author] = await tx
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId));
  return author?.name ?? null;
}
