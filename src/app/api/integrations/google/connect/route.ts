import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/session";
import { buildAuthUrl, googleConfigured } from "@/server/integrations/google-calendar";
import { SCOPES } from "@/lib/integrations/calendar";

/** Starts OAuth. mode=read asks for read-only access; mode=publish adds the app-created-calendars scope. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in", req.url));
  if (!googleConfigured()) return NextResponse.redirect(new URL("/settings/integrations?error=not_configured", req.url));
  const mode = req.nextUrl.searchParams.get("mode") === "publish" ? "publish" : "read";
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const scopes = mode === "publish" ? [SCOPES.read, SCOPES.publish] : [SCOPES.read];
  const res = NextResponse.redirect(buildAuthUrl({ state, codeChallenge: challenge, scopes }));
  res.cookies.set("pp_gcal_oauth", JSON.stringify({ state, verifier, uid: user.id }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integrations/google",
    maxAge: 600,
  });
  return res;
}
