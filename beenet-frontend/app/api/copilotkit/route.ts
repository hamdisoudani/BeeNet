import { NextRequest } from "next/server";
import {
  CopilotRuntime,
  copilotRuntimeNextJSAppRouterEndpoint,
  ExperimentalEmptyAdapter,
  // uncomment this if you want to use LangGraph Platform
  // langGraphPlatformEndpoint,
} from "@copilotkit/runtime";

const serviceAdapter = new ExperimentalEmptyAdapter();

const runtime = new CopilotRuntime({
  remoteEndpoints: [
    // Uncomment this if you want to use LangGraph JS, make sure to
    // remove the remote action url below too.
    //
    // langGraphPlatformEndpoint({
    //   deploymentUrl: "http://localhost:8000",
    //   langsmithApiKey: process.env.LANGSMITH_API_KEY || "", // only used in LangGraph Platform deployments
    //   agents: [
    //     {
    //       name: "sample_agent",
    //       description: "A helpful LLM agent.",
    //     },
    //   ],
    // }),
    {
      url: process.env.NEXT_PUBLIC_BACKEND_URL
        ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/copilotkit`
        : "http://localhost:4000/api/copilotkit",
      onBeforeRequest({ ctx }) {
        // Forward Clerk auth headers to backend so the proxy can authenticate
        const h: Headers | undefined = ctx?.request?.headers as unknown as Headers | undefined;
        const get = (key: string) => (h ? h.get(key) || undefined : undefined);
        const cookie = get("cookie");
        const auth = get("authorization");
        const clerk = get("x-clerk-auth-token");
        const clerkStatus = get("x-clerk-auth-status");
        const clerkSig = get("x-clerk-auth-signature");
        const clerkMsg = get("x-clerk-auth-message");
        const clerkReason = get("x-clerk-auth-reason");
        // Prefer explicit header; else derive from cookie `modelId`
        let modelId = get("x-model-id");
        if (!modelId && cookie) {
          try {
            const parts = String(cookie).split(/;\s*/);
            for (const p of parts) {
              const [k, v] = p.split("=");
              if (k === "modelId") { modelId = decodeURIComponent(v || ""); break; }
            }
          } catch {}
        }
        const headers: Record<string, string> = {};
        if (cookie) headers["cookie"] = cookie;
        if (auth) headers["authorization"] = auth;
        if (clerk) headers["x-clerk-auth-token"] = clerk;
        if (clerkStatus) headers["x-clerk-auth-status"] = clerkStatus;
        if (clerkSig) headers["x-clerk-auth-signature"] = clerkSig;
        if (clerkMsg) headers["x-clerk-auth-message"] = clerkMsg;
        if (clerkReason) headers["x-clerk-auth-reason"] = clerkReason;
        if (modelId) headers["x-model-id"] = modelId;
        return { headers };
      }
    },
  ],
  middleware: {
    onAfterRequest(options) {
      console.log("onAfterRequest from the middleware", options);
    },
    onBeforeRequest(options) {
      console.log("onBeforeRequest from the middleware", options);
    },
  }
});

const ep = copilotRuntimeNextJSAppRouterEndpoint({
  runtime,
  serviceAdapter,
  endpoint: "/api/copilotkit",
});
export const POST = async (req: NextRequest) => {
  // Intercept GraphQL loadAgentState locally (it never reaches the backend proxy)
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const body: any = await req.clone().json().catch(() => undefined);
      const opName: string | undefined = typeof body?.operationName === "string" ? body.operationName : undefined;
      const queryStr: string | undefined = typeof body?.query === "string" ? body.query : undefined;
      const isLoadAgentState = opName === "loadAgentState" || (queryStr ? /\bloadAgentState\b/.test(queryStr) : false);
      if (isLoadAgentState) {
        const threadId: string | undefined = (() => {
          try { return String(body?.variables?.data?.threadId || "").trim() || undefined; } catch { return undefined; }
        })();
        const payload = {
          data: {
            loadAgentState: {
              threadId,
              threadExists: false,
              state: "",
              messages: "[]",
              __typename: "LoadAgentStateResponse",
            },
          },
        };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
    }
  } catch {}
  return ep.handleRequest(req);
};
export const GET = ep.GET;
export const OPTIONS = ep.OPTIONS;