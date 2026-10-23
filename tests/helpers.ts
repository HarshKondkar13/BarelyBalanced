import { db } from "@/db";
import { user } from "@/db/schema";
import { ensureUserInitialized } from "@/server/setup";

export async function makeUser(label: string) {
  const id = `test-${label}-${crypto.randomUUID()}`;
  await db.insert(user).values({ id, name: label, email: `${id}@example.test` });
  await ensureUserInitialized(db, id);
  return id;
}
export { db };
