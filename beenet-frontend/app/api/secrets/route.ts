import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    const url = `${backend}/api/secrets`;
    const headers: Record<string, string> = {};
    const cookie = req.headers.get("cookie");
    const auth = req.headers.get("authorization");
    if (cookie) headers["cookie"] = cookie;
    if (auth) headers["authorization"] = auth;
    const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({}, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    const url = `${backend}/api/secrets`;
    const headers: Record<string, string> = { "content-type": "application/json" };
    const cookie = req.headers.get("cookie");
    const auth = req.headers.get("authorization");
    if (cookie) headers["cookie"] = cookie;
    if (auth) headers["authorization"] = auth;
    const body = await req.json().catch(() => ({}));
    const res = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    const headers: Record<string, string> = { 'Content-Type': 'application/json' } as any;
    const cookie = req.headers.get("cookie");
    const auth = req.headers.get("authorization");
    if (cookie) headers["cookie"] = cookie;
    if (auth) headers["authorization"] = auth;
    const body = await req.json().catch(() => ({}));
    const path = String((body && body._path) || '').trim();
    const url = `${backend}/api/secrets${path}`;
    const { _path, ...payload } = body || {};
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  // Upsert Serper key via backend PUT /api/secrets/serper
  try {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    const url = `${backend}/api/secrets/serper`;
    const headers: Record<string, string> = { "content-type": "application/json" };
    const cookie = req.headers.get("cookie");
    const auth = req.headers.get("authorization");
    if (cookie) headers["cookie"] = cookie;
    if (auth) headers["authorization"] = auth;
    const body = await req.json().catch(() => ({}));
    const res = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}


