import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { getSessionUser } from "@/server/session";
import { CalendarError, exchangeCode, saveConnection } from "@/server/integrations/google-calendar";
import { log } from "@/server/log";

export async function GET(req: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/settings/integrations?${q}`, req.url));
    res.cookies.delete({ name: "pp_gcal_oauth", path: "/api/integrations/google" });
    return res;
  };
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in", req.url));
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back(`error=${p.get("error") === "access_denied" ? "denied" : "oauth"}`);
  let saved: { state: string; verifier: string; uid: string } | null = null;
  try {
    saved = JSON.parse(req.cookies.get("pp_gcal_oauth")?.value ?? "null");
  } catch {
    saved = null;
  }
  // CSRF + session binding: the state must match and belong to the signed-in user.
  if (!saved || saved.state !== p.get("state") || saved.uid !== user.id || !p.get("code")) return back("error=state");
  try {
    const tokens = await exchangeCode(p.get("code")!, saved.verifier);
    await saveConnection(db, user.id, tokens);
    log.info("calendar.connected", { userId: user.id, scopes: tokens.scope.split(" ").length });
    return back("connected=1");
  } catch (e) {
    log.warn("calendar.connect_failed", { userId: user.id, kind: e instanceof CalendarError ? e.kind : "unknown" });
    return back("error=exchange");
  }
}
