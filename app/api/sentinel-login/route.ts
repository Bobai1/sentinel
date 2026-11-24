import { NextResponse } from "next/server";
import { SENTINEL_COOKIE, tokenMatches } from "@/lib/sentinel/auth";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

export async function POST(request: Request) {
  if (!process.env.SENTINEL_API_TOKEN) {
    return NextResponse.json({ error: "Sign-in is not enabled" }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  if (!tokenMatches(password, process.env.SENTINEL_API_TOKEN)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SENTINEL_COOKIE, password, COOKIE_OPTIONS);
  return response;
}

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.SENTINEL_API_TOKEN) });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SENTINEL_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
