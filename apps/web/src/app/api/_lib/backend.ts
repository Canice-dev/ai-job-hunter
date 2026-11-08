import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "job_hunter_session";

function apiUrl() {
  return (process.env.API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export function forbiddenOriginResponse() {
  return NextResponse.json({ detail: "This request must come from the dashboard." }, { status: 403 });
}

export function apiUnavailableResponse() {
  return NextResponse.json(
    { detail: "The API is unavailable. Make sure the Python server is running." },
    { status: 503 },
  );
}

export function messageFromPayload(payload: unknown, fallback: string) {
  if (typeof payload === "object" && payload !== null && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

export async function ownerSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function backendFetch(path: string, init: RequestInit = {}) {
  return fetch(`${apiUrl()}${path}`, { ...init, cache: "no-store" });
}

export function clearOwnerSession(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}
