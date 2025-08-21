"use client";

import React from "react";

type Conversation = {
  conversationId?: string;
  threadId: string;
  title?: string;
  lastMessageAt?: string;
  messageCount?: number;
};

type ConversationsContextType = {
  conversations: Conversation[];
  loading: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  addOrPrepend: (c: Conversation) => void;
  removeByThreadId: (threadId: string) => void;
};

const ConversationsContext = React.createContext<ConversationsContextType | null>(null);

export function useConversations() {
  const ctx = React.useContext(ConversationsContext);
  if (!ctx) throw new Error("useConversations must be used within ConversationsProvider");
  return ctx;
}

export function ConversationsProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [nextCursor, setNextCursor] = React.useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = React.useState<boolean>(true);

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/conversations?limit=20`, { method: "GET", credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const list: Conversation[] = Array.isArray(data?.conversations) ? data.conversations : [];
      // De-duplicate by threadId to prevent duplicates from causing key conflicts
      const uniqueList = list.filter((item, index, self) => 
        index === self.findIndex(t => t.threadId === item.threadId)
      );
      setConversations(uniqueList);
      setNextCursor(typeof data?.nextCursor === "string" ? data.nextCursor : undefined);
      setHasMore(Boolean(data?.hasMore));
    } catch {
      setConversations([]);
      setNextCursor(undefined);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = React.useCallback(async () => {
    if (!hasMore || !nextCursor || loading) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/conversations?cursor=${encodeURIComponent(nextCursor)}&limit=20`, { method: "GET", credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const list: Conversation[] = Array.isArray(data?.conversations) ? data.conversations : [];
      setConversations((prev) => {
        // Combine and de-duplicate to prevent key conflicts
        const combined = [...prev, ...list];
        return combined.filter((item, index, self) => 
          index === self.findIndex(t => t.threadId === item.threadId)
        );
      });
      setNextCursor(typeof data?.nextCursor === "string" ? data.nextCursor : undefined);
      setHasMore(Boolean(data?.hasMore));
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, [hasMore, nextCursor, loading]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const addOrPrepend = React.useCallback((c: Conversation) => {
    setConversations((prev) => {
      const exists = prev.some((x) => x.threadId === c.threadId);
      if (exists) return prev.map((x) => (x.threadId === c.threadId ? { ...x, ...c } : x));
      return [c, ...prev];
    });
  }, []);

  const removeByThreadId = React.useCallback((threadId: string) => {
    setConversations((prev) => prev.filter((x) => x.threadId !== threadId));
  }, []);

  const value = React.useMemo(() => ({ conversations, loading, refresh, loadMore, addOrPrepend, removeByThreadId }), [conversations, loading, refresh, loadMore, addOrPrepend, removeByThreadId]);

  return <ConversationsContext.Provider value={value}>{children}</ConversationsContext.Provider>;
}


