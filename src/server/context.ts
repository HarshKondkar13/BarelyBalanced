import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { preferences } from "@/db/schema";
import { todayLocal } from "@/lib/dates";
import { requireUser } from "./session";
import { ensureUserInitialized } from "./setup";

/**
 * Per-request context for authenticated pages and actions:
 * the verified user, their preferences, and "today" in their timezone.
 */
export const getContext = cache(async () => {
  const user = await requireUser();
  await ensureUserInitialized(db, user.id);
  const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, user.id));
  const tz = prefs?.timezone ?? "Asia/Kolkata";
  return { user, prefs, tz, today: todayLocal(tz), db };
});

export type AppContext = Awaited<ReturnType<typeof getContext>>;
