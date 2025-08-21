import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    const url = `${backend}/api/secrets/serper/remove`;
    const headers: Record<string, string> = {};
    const cookie = req.headers.get("cookie");
    const auth = req.headers.get("authorization");
    if (cookie) headers["cookie"] = cookie;
    if (auth) headers["authorization"] = auth;
    const res = await fetch(url, { method: "POST", headers });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}


