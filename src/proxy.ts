import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { PROJECT_COOKIE, PROJECT_COOKIE_OPTIONS } from "@/lib/project-cookie";

const STUDIO = /^\/studio\/([0-9a-f-]{36})(?:\/|$)/i;

// Optimistic check only: the cookie's presence, not its validity. Pages still verify the session.
export function proxy(request: NextRequest) {
  // The old dashboard is gone; its links land in the studio.
  if (request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/studio", request.url));
  }
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  // /studio/[id] opens that project: the server actions all act on the project cookie, so the URL sets it.
  // The page itself still checks the project belongs to the signed-in user.
  const id = STUDIO.exec(request.nextUrl.pathname)?.[1];
  if (id && request.cookies.get(PROJECT_COOKIE)?.value !== id) {
    request.cookies.set(PROJECT_COOKIE, id);
    const res = NextResponse.next({ request });
    res.cookies.set(PROJECT_COOKIE, id, PROJECT_COOKIE_OPTIONS);
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/projects/:path*", "/studio/:path*"],
};
