"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { CopilotKit } from "@copilotkit/react-core";
import { useCopilotChatHeadless_c, useCoAgent } from "@copilotkit/react-core";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = React.useState<boolean>(true);
  const [verified, setVerified] = React.useState<boolean>(false);
  const [canonicalThreadId, setCanonicalThreadId] = React.useState<string | undefined>(undefined);
  const [initialMessages, setInitialMessages] = React.useState<any[]>([]);

  React.useEffect(() => {
    const id = params?.id;
    if (!id) {
      console.log("No threadId");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/messages?threadId=${encodeURIComponent(String(id))}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          // Unauthorized or other error; route back and inform user
          try { toast.error("You don't have access to this conversation or it doesn't exist."); } catch {}
          router.push("/");
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const mapped: any[] = Array.isArray(data?.messages) ? data.messages : [];
        setInitialMessages(mapped);
        const canonical = typeof data?.threadId === "string" && data.threadId ? String(data.threadId) : String(id);
        setCanonicalThreadId(canonical);
        setVerified(true);
      } catch {
        try { toast.error("Failed to load conversation."); } catch {}
        router.push("/");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  if (loading) {
    return (
      <div className="flex-1 min-h-0 p-4">
        <div className="max-w-4xl mx-auto space-y-3">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }
  
  if (!verified || !canonicalThreadId) return null;

  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="starterAgent"
      showDevConsole={false}
      publicLicenseKey="ck_pub_fa79034fd22de4f39fafa83479af81db"
      threadId={canonicalThreadId}
    >
      <Bootstrap initialMessages={initialMessages} canonicalThreadId={canonicalThreadId} />
      {children}
    </CopilotKit>
  );
}

function Bootstrap({ initialMessages, canonicalThreadId }: { initialMessages: any[]; canonicalThreadId: string }) {
  const { setMessages } = useCopilotChatHeadless_c();
  const { setState } = useCoAgent<any>({ name: "starterAgent" });
  const bootedForThreadRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    // Run exactly once per canonicalThreadId to avoid context-driven loops
    if (bootedForThreadRef.current === canonicalThreadId) return;
    bootedForThreadRef.current = canonicalThreadId;
    try {
      // Reset local state for this thread
      setMessages([] as any);
      setState({ plan: undefined });
    } catch {}
    try {
      if (Array.isArray(initialMessages) && initialMessages.length > 0) {
        setMessages(initialMessages as any);
        const lastStateMsg = [...initialMessages].reverse().find((m: any) => m?.role === "assistant" && m?.state);
        if (lastStateMsg?.state) setState(lastStateMsg.state);
      }
    } catch {}
  // Only depend on values that should trigger a re-bootstrap
  }, [canonicalThreadId, initialMessages]);
  return null;
}



