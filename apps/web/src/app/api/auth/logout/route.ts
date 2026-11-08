import { NextResponse } from "next/server";

import { clearOwnerSession, forbiddenOriginResponse, isSameOrigin } from "@/app/api/_lib/backend";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOriginResponse();

  const response = NextResponse.json({ signed_out: true });
  clearOwnerSession(response);
  return response;
}
