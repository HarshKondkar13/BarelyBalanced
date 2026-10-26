import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import { brand } from "@/lib/brand";
import * as schema from "@/db/schema";

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  appName: brand.name,
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    autoSignIn: true,
  },
  // Sign-in only asks for identity scopes. Calendar access is a separate, incremental
  // consent handled by lib/integrations/google-calendar.
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : undefined,
  user: {
    additionalFields: {
      isDemo: { type: "boolean", input: false, defaultValue: false, required: false },
    },
    deleteUser: { enabled: true },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14, // 14 days
    updateAge: 60 * 60 * 24,
  },
  rateLimit: { enabled: process.env.NODE_ENV === "production", window: 60, max: 30 },
  plugins: [nextCookies()],
});

export const isGoogleSignInConfigured = googleConfigured;
