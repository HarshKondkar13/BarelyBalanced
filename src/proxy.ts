import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic redirect for signed-out visitors. This only checks that a session cookie
 * exists; real authorization happens on the server in requireUser() for every request.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/today/:path*", "/money/:path*", "/plan/:path*", "/signals/:path*", "/schedule/:path*", "/settings/:path*", "/onboarding/:path*", "/progress/:path*", "/notifications/:path*"],
};
