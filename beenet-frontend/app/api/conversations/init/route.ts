import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    const url = `${backend}/api/conversations/init`;
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    console.log(url)
    const cookie = req.headers.get("cookie");
    const auth = req.headers.get("authorization");
    if (cookie) headers["cookie"] = cookie;
    if (auth) headers["authorization"] = auth;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}


