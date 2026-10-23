"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { notifications } from "@/db/schema";
import { getContext } from "@/server/context";
import type { ActionResult } from "./schedule";

export async function markAllReadAction(): Promise<ActionResult> {
  const { db, user } = await getContext();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  refresh();
  return { ok: true, message: "All caught up" };
}
