import { NextResponse, type NextRequest } from "next/server";
import { SENTINEL_COOKIE, tokenMatches } from "./lib/sentinel/auth";

export function proxy(request: NextRequest) {
  const expected = process.env.SENTINEL_API_TOKEN;
  if (!expected) return NextResponse.next();

  const provided = request.cookies.get(SENTINEL_COOKIE)?.value;
  if (tokenMatches(provided, expected)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const login = request.nextUrl.clone();
  login.pathname = "/sentinel/login";
  login.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/api/sentinel/:path*", "/api/sentinel-login", "/sentinel/live/:path*", "/sentinel/trace/:path*"],
};
