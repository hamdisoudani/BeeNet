"use client";

import CustomChat from "@/components/chat/CustomChat";
import { useEffect, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useCoAgent } from "@copilotkit/react-core";
import { v4 as uuidv4 } from "uuid";
import { usePendingTurnStore } from "@/stores/pendingTurn";

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const threadId = params?.id;
  const q = search?.get("q");

  const { setState, run } = useCoAgent<any>({ name: "starterAgent" });
  const sentOnceRef = useRef<boolean>(false);

  useEffect(() => {
    // Layout has already verified access and initialized CopilotKit with threadId.
    // Send any queued first message once (or fallback to legacy ?q).
    if (sentOnceRef.current) return;
    if (!threadId) return;
    let payload: { id: string; content: string } | null = null;
    try {
      const store = usePendingTurnStore.getState();
      const queued = store.consumePendingTurn(String(threadId));
      if (queued && typeof queued.content === "string" && queued.content.trim().length > 0) {
        payload = { id: String(queued.id || uuidv4()), content: queued.content };
      }
    } catch {}
    if (!payload && typeof q === "string" && q.trim().length > 0) {
      payload = { id: uuidv4(), content: q };
    }
    if (!payload) return;
    try {
      setState({ plan: undefined });
      run(() => ({ id: payload!.id, role: "user", content: payload!.content }));
      sentOnceRef.current = true;
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    // Remove the query param to keep a clean URL after boot
    if (q) router.replace(`/c/${threadId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex-1 min-h-0">
      <CustomChat />
    </div>
  );
}





