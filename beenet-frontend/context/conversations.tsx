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
  addOrPrepend: (c: Conversation) => void;
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

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/conversations", { method: "GET", credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const list: Conversation[] = Array.isArray(data?.conversations) ? data.conversations : [];
      setConversations(list);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const value = React.useMemo(() => ({ conversations, loading, refresh, addOrPrepend }), [conversations, loading, refresh, addOrPrepend]);

  return <ConversationsContext.Provider value={value}>{children}</ConversationsContext.Provider>;
}


