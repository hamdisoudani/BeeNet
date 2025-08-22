"use client";

import { useEffect, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Logo from "@/public/logo.png";
import { Moon, Sun, Plus, Settings, ArrowLeft, MoreHorizontal, Trash2, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarSeparator,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserButton, useUser } from "@clerk/nextjs";
import { useConversations } from "@/context/conversations";
import React from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useModelStore } from "@/stores/modelStore";

// Component to handle auto-collapse logic (must be inside SidebarProvider)
function SidebarAutoCollapse() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  return null;
}

export default function SidebarAppShell({ children }: { children: React.ReactNode }) {
  const { theme, setTheme, systemTheme } = useTheme();
  const effectiveTheme = theme === "system" ? systemTheme : theme;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { conversations, loading, refresh, loadMore, addOrPrepend } = useConversations();
  const pathname = usePathname();

  const handleNewChat = useCallback(() => {
    // Simply go to the landing/start panel; conversation will be created after user submits
    router.push("/");
  }, [router]);



  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } finally {
        // bootstrap a newly created item AFTER refresh to avoid transient duplicates
        try {
          const raw = sessionStorage.getItem("beenet:new-conv");
          if (raw) {
            const extra = JSON.parse(raw);
            sessionStorage.removeItem("beenet:new-conv");
            addOrPrepend(extra);
          }
        } catch {}
      }
    })();
  }, [refresh, addOrPrepend]);

  // React to new conversation creations from anywhere in the app
  useEffect(() => {
    const onCreated = (e: Event) => {
      const anyEvt = e as CustomEvent<any>;
      const c = anyEvt?.detail;
      if (!c) return;
      try {
        addOrPrepend(c);
      } catch {}
    };
    window.addEventListener("beenet:conversation-created", onCreated as any);
    return () => window.removeEventListener("beenet:conversation-created", onCreated as any);
  }, [addOrPrepend]);

  return (
    <SidebarProvider>
      <SidebarAutoCollapse />
      <div className="flex h-dvh w-full">
        <Sidebar>
                     <SidebarHeader className="px-4 py-4 border-b border-border/30">
             <div className="flex items-center justify-between gap-3">
               <div className="flex items-center gap-3">
                 <Link href="/" aria-label="Home" className="inline-flex items-center hover:opacity-80 transition-opacity">
                   <Image src={Logo} alt="BeeNet" width={40} height={40} priority className="rounded-lg" />
                 </Link>
                 <div className="flex flex-col">
                   <span className="font-semibold text-sm text-foreground">BeeNet</span>
                   <span className="text-xs text-muted-foreground">AI Research</span>
                 </div>
               </div>
               <SidebarTrigger className="hidden md:inline-flex h-8 w-8 shrink-0 hover:bg-muted/50 transition-colors rounded-md" aria-label="Toggle sidebar" />
             </div>
           </SidebarHeader>
          
          <SidebarContent className="flex flex-col flex-1 min-h-0">
            <div className="flex-shrink-0">
              <SecretsStatusBanner />
            </div>
            {/* Conversations taking remaining space */}
                         <SidebarGroup className="flex-1 flex flex-col min-h-0">
               <div className="flex items-center justify-between px-4 py-3 w-full flex-shrink-0 border-b border-border/20">
                 <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                   Conversations
                 </SidebarGroupLabel>
                 <Button
                   variant="ghost"
                   size="icon"
                   className="h-7 w-7 flex-shrink-0 hover:bg-primary/10 hover:text-primary transition-all duration-200 rounded-md border border-transparent hover:border-primary/20"
                   onClick={handleNewChat}
                   aria-label="New chat"
                 >
                   <Plus className="h-4 w-4" />
                 </Button>
               </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <ScrollArea className="h-full [&_[data-slot=scroll-area-scrollbar]]:hidden">
                <SidebarMenu>
                  {loading && conversations.length === 0 && (
                    <div className="px-4 py-3 space-y-3">
                      <Skeleton className="h-10 w-[90%] rounded-lg" />
                      <Skeleton className="h-10 w-[75%] rounded-lg" />
                      <Skeleton className="h-10 w-[85%] rounded-lg" />
                      <Skeleton className="h-10 w-[70%] rounded-lg" />
                    </div>
                  )}
                  {!loading && conversations.length === 0 && (
                    <div className="px-4 py-8">
                      <div className="text-center text-sm text-muted-foreground bg-muted/30 rounded-xl py-8 px-4 border border-border/30">
                        <div className="mb-3 text-2xl">💬</div>
                        <div className="font-medium mb-2">No conversations yet</div>
                        <div className="text-xs leading-relaxed">Start researching to create your first conversation</div>
                      </div>
                    </div>
                  )}
                                     {!loading && conversations.map((c) => {
                     const active = Boolean(pathname && pathname === `/c/${encodeURIComponent(c.threadId)}`);
                     return (
                       <SidebarMenuItem key={c.threadId}>
                         <div className="group relative flex items-center gap-1 w-full px-2 overflow-hidden">
                           {active && <div className="absolute left-1 top-1 bottom-1 w-1 rounded bg-primary" aria-hidden />}
                           <SidebarMenuButton
                             className={cn("flex-1 py-1.5", !active && "text-muted-foreground")}
                             isActive={active}
                             onClick={() => router.push(`/c/${encodeURIComponent(c.threadId)}`)}
                           >
                             <Tooltip>
                               <TooltipTrigger asChild>
                                 <span className={cn("truncate max-w-[180px] text-[13px]", active ? "font-semibold" : "font-medium")}>
                                   {c.title || c.threadId}
                                 </span>
                               </TooltipTrigger>
                               <TooltipContent side="right" align="center">
                                 <div className="max-w-xs break-words">{c.title || c.threadId}</div>
                               </TooltipContent>
                             </Tooltip>
                           </SidebarMenuButton>
                           <ConversationActions threadId={c.threadId} onDeleted={() => {
                             // Optimistically remove and navigate home if viewing
                             try {
                               const path = pathname || '';
                               if (path.startsWith(`/c/`) && path.includes(encodeURIComponent(c.threadId))) {
                                 router.push('/');
                               }
                             } catch {}
                           }} />
                         </div>
                       </SidebarMenuItem>
                     );
                   })}
                  {/* Infinite scroll sentinel */}
                  <SidebarMenuItem>
                    <IntersectionSentinel onVisible={() => loadMore()} />
                  </SidebarMenuItem>
                </SidebarMenu>
                </ScrollArea>
              </div>
            </SidebarGroup>
            
            <div className="flex-shrink-0">
              <SidebarSeparator />
              
              {/* Navigation Links */}
                              <SidebarGroup>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild className="mx-2 rounded-lg hover:bg-muted/60 transition-colors">
                        <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5">
                          <Settings className="h-4 w-4" />
                          <span className="text-sm font-medium">Settings</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroup>
            </div>
          </SidebarContent>
          
          <SidebarFooter className="p-4 flex-shrink-0 border-t border-border/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <UserButton />
                {!isLoaded ? (
                  <Skeleton className="h-4 w-20 rounded" />
                ) : (
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">
                      {user?.firstName || user?.username || "User"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Free Plan
                    </div>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 hover:bg-muted/60 transition-colors rounded-lg flex-shrink-0"
                onClick={() => setTheme(effectiveTheme === "dark" ? "light" : "dark")}
                aria-label="Toggle theme"
              >
                {mounted ? (
                  effectiveTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
                ) : (
                  <div className="h-4 w-4" />
                )}
              </Button>
            </div>
          </SidebarFooter>
        </Sidebar>
        <CollapsedBrandReveal />
        <SidebarInset className="rounded-xl">
          {/* Mobile-only top navbar: back + trigger + brand on left, profile + theme on right */}
          <div className="md:hidden flex items-center justify-between h-12 px-3 border-b">
            <div className="flex items-center gap-1">
              {pathname?.startsWith("/c/") && (
                <Link href="/" aria-label="Back to home" className="h-8 w-8 grid place-items-center text-muted-foreground">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              )}
              <SidebarTrigger className="h-8 w-8" aria-label="Open sidebar" />
              <span className="ml-1 text-base font-semibold">BeeNet</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setTheme(effectiveTheme === "dark" ? "light" : "dark")}
                aria-label="Toggle theme"
              >
                {mounted ? (
                  effectiveTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
                ) : (
                  <div className="h-4 w-4" />
                )}
              </Button>
              <UserButton />
            </div>
          </div>
          <div className="flex-1 min-h-0">{children}</div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
function IntersectionSentinel({ onVisible }: { onVisible: () => void }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!ref.current) return;
    const node = ref.current;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          onVisible();
        }
      }
    }, { rootMargin: "200px" });
    obs.observe(node);
    return () => obs.disconnect();
  }, [onVisible]);
  return <div ref={ref} aria-hidden className="h-1" />;
}

function ConversationActions({ threadId, onDeleted }: { threadId: string; onDeleted: () => void }) {
  const { removeByThreadId, refresh } = useConversations();
  const [busy, setBusy] = React.useState(false);
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
        try { removeByThreadId(threadId); } catch {}
        // Refresh in background to reconcile with server
        void refresh();
        onDeleted();
      }
    } finally {
      setBusy(false);
    }
  }, [busy, threadId, onDeleted, refresh]);

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

function CollapsedBrandReveal() {
  const { state, isMobile } = useSidebar();
  const pathname = usePathname();
  const isCollapsed = state === "collapsed";
  
  // Only show on desktop when collapsed
  if (isMobile || !isCollapsed) return null;

  return (
    <AnimatePresence>
      {isCollapsed && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed left-4 top-4 z-50 hidden md:flex items-center gap-2 rounded-lg border bg-background/95 backdrop-blur-sm px-3 py-2 shadow-lg"
        >
          <Link href="/" aria-label="Home" className="inline-flex items-center">
            <Image src={Logo} alt="BeeNet" width={24} height={24} />
          </Link>
          {pathname?.startsWith("/c/") && (
            <Link href="/" aria-label="Back to home" className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </Link>
          )}
          <SidebarTrigger className="ml-1 h-7 w-7" aria-label="Open sidebar" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// MobileTrigger removed; replaced by inline mobile navbar inside SidebarInset


function SecretsStatusBanner() {
  const { ready, hasSerperKey, statusLoading, statusError, setStatus, setStatusLoading, setStatusError } = useModelStore();
  const [dismissed, setDismissed] = React.useState(false);
  const needsModel = ready === false;
  const needsSerper = hasSerperKey === false;
  const show = !statusLoading && !dismissed && (needsModel || needsSerper || statusError === true);
  if (!show) return null;
  const neutral = statusError && !(needsModel || needsSerper);
  const text = neutral
    ? "We couldn’t verify your configuration."
    : !needsModel && needsSerper
      ? "Add your Serper key to enable web search."
      : "Add a default model to start chatting.";
  return (
    <div className="px-2 mb-2" role="status" aria-live="polite">
      <div className={cn("rounded-lg border p-2 shadow-sm", neutral ? "border-amber-300/60 bg-amber-50/70 text-amber-900" : "border-destructive/40 bg-destructive/10 text-destructive") }>
        <div className="flex items-start gap-1.5">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-[10px] font-medium">Setup required</div>
            <div className="text-[10px] mt-0.5 break-words whitespace-normal leading-tight">{text}</div>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1 justify-end">
          <Button asChild size="sm" variant="outline" className="h-6 px-2 text-[10px]">
            <Link href="/settings">Settings</Link>
          </Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={async () => {
            try {
              setStatusLoading(true); setStatusError(false);
              const res = await fetch('/api/secrets/status', { method: 'GET', credentials: 'include', cache: 'no-store' });
              const data = await res.json().catch(() => ({}));
              if (res.ok) setStatus(Boolean(data?.hasModel), Boolean(data?.hasSerperKey)); else setStatusError(true);
            } catch { setStatusError(true); }
            finally { setStatusLoading(false); }
          }}>Retry</Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setDismissed(true)}>Dismiss</Button>
        </div>
      </div>
    </div>
  );
}

