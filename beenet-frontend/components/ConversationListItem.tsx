"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConversations } from "@/context/conversations";

type Conversation = {
  threadId: string;
  title?: string;
};

type ConversationListItemProps = {
  conversation: Conversation;
};

function ConversationActions({ threadId, onDeleted }: { threadId: string; onDeleted: () => void }) {
  const { removeByThreadId, refresh } = useConversations();
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const handleDelete = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/conversations', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ threadId }),
      });
      const ok = res.ok;
      if (ok) {
        removeByThreadId(threadId);
        // Refresh in background to reconcile with server
        void refresh();
        onDeleted();
      }
    } finally {
      setBusy(false);
    }
  }, [busy, threadId, onDeleted, refresh, removeByThreadId]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all duration-200 border border-transparent hover:border-border/50" aria-label="Actions">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem onClick={handleDelete} disabled={busy} className="text-red-600">
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


export const ConversationListItem = React.memo(function ConversationListItem({ conversation }: ConversationListItemProps) {
  const pathname = usePathname();
  const router = useRouter();
  const active = Boolean(pathname && pathname === `/c/${encodeURIComponent(conversation.threadId)}`);

  return (
    <SidebarMenuItem>
      <div className="group relative flex items-center gap-1 w-full px-2 overflow-hidden">
        {active && <div className="absolute left-1 top-1 bottom-1 w-1 rounded bg-primary" aria-hidden />}
        <SidebarMenuButton
          className={cn("flex-1 py-1.5", !active && "text-muted-foreground")}
          isActive={active}
          onClick={() => router.push(`/c/${encodeURIComponent(conversation.threadId)}`)}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn("truncate max-w-[180px] text-[13px]", active ? "font-semibold" : "font-medium")}>
                {conversation.title || conversation.threadId}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              <div className="max-w-xs break-words">{conversation.title || conversation.threadId}</div>
            </TooltipContent>
          </Tooltip>
        </SidebarMenuButton>
        <ConversationActions threadId={conversation.threadId} onDeleted={() => {
          // Optimistically remove and navigate home if viewing
          try {
            const path = pathname || '';
            if (path.startsWith(`/c/`) && path.includes(encodeURIComponent(conversation.threadId))) {
              router.push('/');
            }
          } catch {}
        }} />
      </div>
    </SidebarMenuItem>
  );
});
