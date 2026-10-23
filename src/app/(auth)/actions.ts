"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user } from "@/db/schema";
import { ensureUserInitialized } from "@/server/setup";
import { seedDemoData } from "@/server/demo-seed";

export type AuthState = { error?: string } | undefined;

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email: z.email("Enter a valid email").max(200),
  password: z.string().min(10, "Use at least 10 characters").max(128),
});

export async function signUpAction(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const res = await auth.api.signUpEmail({ body: parsed.data, headers: await headers() });
    await ensureUserInitialized(db, res.user.id);
  } catch (e) {
    if (e instanceof APIError) return { error: e.message || "Could not create the account" };
    throw e;
  }
  redirect("/onboarding");
}

const signInSchema = z.object({ email: z.email("Enter a valid email"), password: z.string().min(1, "Enter your password") });

export async function signInAction(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await auth.api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch (e) {
    if (e instanceof APIError) return { error: "Email or password is incorrect" };
    throw e;
  }
  redirect("/today");
}

/**
 * Demo mode: creates an isolated, flagged demo account filled with labelled sample data.
 * Sample data never mixes with a real account; demo accounts are purged after 7 days.
 */
export async function startDemoAction(): Promise<void> {
  if (process.env.DEMO_MODE_ENABLED !== "true") redirect("/sign-in");
  const id = crypto.randomUUID();
  const res = await auth.api.signUpEmail({
    body: { name: "Demo explorer", email: `demo-${id}@demo.invalid`, password: crypto.randomUUID() + crypto.randomUUID() },
    headers: await headers(),
  });
  await db.update(user).set({ isDemo: true }).where(eq(user.id, res.user.id));
  await ensureUserInitialized(db, res.user.id);
  await seedDemoData(db, res.user.id);
  redirect("/today");
}

export async function signOutAction(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
