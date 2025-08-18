"use client";

import { create } from "zustand";

export type PendingTurn = {
  id: string;
  content: string;
  createdAt: number;
};

type PendingTurnState = {
  queue: Record<string, PendingTurn | undefined>;
  queuePendingTurn: (threadId: string, turn: PendingTurn) => void;
  consumePendingTurn: (threadId: string) => PendingTurn | undefined;
  peekPendingTurn: (threadId: string) => PendingTurn | undefined;
  clearAll: () => void;
};

export const usePendingTurnStore = create<PendingTurnState>((set, get) => ({
  queue: Object.create(null),
  queuePendingTurn: (threadId: string, turn: PendingTurn) => {
    set((s) => ({ queue: { ...s.queue, [threadId]: turn } }));
  },
  consumePendingTurn: (threadId: string) => {
    const current = get().queue[threadId];
    if (current) {
      set((s) => {
        const next = { ...s.queue };
        delete next[threadId];
        return { queue: next };
      });
    }
    return current;
  },
  peekPendingTurn: (threadId: string) => get().queue[threadId],
  clearAll: () => set({ queue: Object.create(null) }),
}));


