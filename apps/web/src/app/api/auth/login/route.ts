import { NextResponse } from "next/server";

import {
  apiUnavailableResponse,
  backendFetch,
  forbiddenOriginResponse,
  isSameOrigin,
  messageFromPayload,
  SESSION_COOKIE,
} from "@/app/api/_lib/backend";

type LoginPayload = { access_token: string; expires_at: string };

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOriginResponse();

  let credentials: unknown;
  try {
    credentials = await request.json();
  } catch {
    return NextResponse.json({ detail: "Enter your email and password." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await backendFetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
  } catch {
    return apiUnavailableResponse();
  }

  const payload = (await upstream.json().catch(() => null)) as LoginPayload | null;
  if (!upstream.ok || !payload?.access_token || !payload.expires_at) {
    return NextResponse.json(
      { detail: messageFromPayload(payload, "Could not sign in. Please try again.") },
      { status: upstream.status },
    );
  }

  const expiresAt = new Date(payload.expires_at);
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  if (Number.isNaN(expiresAt.getTime()) || maxAge === 0) {
    return NextResponse.json({ detail: "The API returned an invalid session." }, { status: 502 });
  }

  const response = NextResponse.json({ signed_in: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: payload.access_token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  return response;
}
