import { NextResponse } from "next/server";

import {
  apiUnavailableResponse,
  backendFetch,
  clearOwnerSession,
  forbiddenOriginResponse,
  isSameOrigin,
  ownerSessionToken,
} from "@/app/api/_lib/backend";

type BackendRouteContext = { params: Promise<{ path: string[] }> };

const safePathSegment = /^[a-zA-Z0-9_-]+$/;

async function proxyToBackend(request: Request, context: BackendRouteContext) {
  if (request.method !== "GET" && !isSameOrigin(request)) return forbiddenOriginResponse();

  const token = await ownerSessionToken();
  if (!token) return NextResponse.json({ detail: "Sign in required." }, { status: 401 });

  const { path } = await context.params;
  if (!path.length || path.some((segment) => !safePathSegment.test(segment))) {
    return NextResponse.json({ detail: "Not found." }, { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const endpoint = `/api/v1/${path.map(encodeURIComponent).join("/")}${requestUrl.search}`;
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  let upstream: Response;
  try {
    upstream = await backendFetch(endpoint, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.arrayBuffer(),
    });
  } catch {
    return apiUnavailableResponse();
  }

  const responseHeaders = new Headers();
  const upstreamContentType = upstream.headers.get("content-type");
  if (upstreamContentType) responseHeaders.set("content-type", upstreamContentType);

  const response = new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: responseHeaders,
  });
  if (upstream.status === 401) clearOwnerSession(response);
  return response;
}

export async function GET(request: Request, context: BackendRouteContext) {
  return proxyToBackend(request, context);
}

export async function POST(request: Request, context: BackendRouteContext) {
  return proxyToBackend(request, context);
}

export async function PATCH(request: Request, context: BackendRouteContext) {
  return proxyToBackend(request, context);
}
