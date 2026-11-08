import { NextResponse } from "next/server";

import {
  apiUnavailableResponse,
  backendFetch,
  clearOwnerSession,
  messageFromPayload,
  ownerSessionToken,
} from "@/app/api/_lib/backend";

type SessionPayload = { email: string; expires_at: string };

export async function GET() {
  const token = await ownerSessionToken();
  if (!token) return NextResponse.json({ detail: "Sign in required." }, { status: 401 });

  let upstream: Response;
  try {
    upstream = await backendFetch("/api/v1/auth/session", {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return apiUnavailableResponse();
  }

  const payload = (await upstream.json().catch(() => null)) as SessionPayload | null;
  if (!upstream.ok || !payload?.email) {
    const response = NextResponse.json(
      { detail: messageFromPayload(payload, "Could not check your session.") },
      { status: upstream.status },
    );
    if (upstream.status === 401) clearOwnerSession(response);
    return response;
  }

  return NextResponse.json({ email: payload.email });
}
