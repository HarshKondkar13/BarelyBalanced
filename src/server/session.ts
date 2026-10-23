import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type SessionUser = { id: string; name: string; email: string; isDemo: boolean };

/** Reads the session once per request. Server-side source of truth for the current user. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as typeof session.user & { isDemo?: boolean };
  return { id: u.id, name: u.name, email: u.email, isDemo: Boolean(u.isDemo) };
});

/** Use in every server component, action and route that touches user data. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}
