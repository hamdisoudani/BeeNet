import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get("limit");
    const cursor = searchParams.get("cursor");
    const qp = new URLSearchParams();
    if (limit) qp.set("limit", limit);
    if (cursor) qp.set("cursor", cursor);
    const url = `${backend}/api/conversations${qp.toString() ? `?${qp.toString()}` : ""}`;
    const headers: Record<string, string> = {};
    const cookie = req.headers.get("cookie");
    const auth = req.headers.get("authorization");
    if (cookie) headers["cookie"] = cookie;
    if (auth) headers["authorization"] = auth;
    // Forward ETag support from client if available
    const clientETag = req.headers.get('if-none-match');
    if (clientETag) headers['if-none-match'] = clientETag;
    const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
    // Surface backend ETag to client
    const etag = res.headers.get('etag');
    const data = await res.json().catch(() => ({}));
    const resp = NextResponse.json(data, { status: res.status });
    if (etag) resp.headers.set('ETag', etag);
    return resp;
  } catch (e) {
    return NextResponse.json({ ok: false, conversations: [] }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    const body = await req.json().catch(() => ({}));
    const url = `${backend}/api/conversations`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const cookie = req.headers.get("cookie");
    const auth = req.headers.get("authorization");
    if (cookie) headers["cookie"] = cookie;
    if (auth) headers["authorization"] = auth;
    const res = await fetch(url, { method: "DELETE", headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}


