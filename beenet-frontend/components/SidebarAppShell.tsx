"use client";

import { useEffect, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Logo from "@/public/logo.png";
import { Moon, Sun, Plus, Settings, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
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
import { UserButton } from "@clerk/nextjs";
import { useConversations } from "@/context/conversations";

export default function SidebarAppShell({ children }: { children: React.ReactNode }) {
  const { theme, setTheme, systemTheme } = useTheme();
  const effectiveTheme = theme === "system" ? systemTheme : theme;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const router = useRouter();
  const { conversations, loading, refresh, addOrPrepend } = useConversations();
  const pathname = usePathname();

  const handleNewChat = useCallback(() => {
    // Simply go to the landing/start panel; conversation will be created after user submits
    router.push("/");
  }, [router]);

  useEffect(() => {
    void refresh();
    // bootstrap a newly created item
    try {
      const raw = sessionStorage.getItem("beenet:new-conv");
      if (raw) {
        const extra = JSON.parse(raw);
        sessionStorage.removeItem("beenet:new-conv");
        addOrPrepend(extra);
      }
    } catch {}
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
      <div className="flex h-dvh w-full">
        <Sidebar>
          <SidebarHeader className="px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3 whitespace-nowrap">
                {/* Desktop back removed as requested */}
                <Link href="/" aria-label="Home" className="inline-flex items-center">
                  <Image src={Logo} alt="BeeNet" width={64} height={64} priority />
                </Link>
              </div>
              {/* Desktop: Show collapse trigger, Mobile: Hide it */}
              <SidebarTrigger className="hidden md:inline-flex h-8 w-8 shrink-0" aria-label="Toggle sidebar" />
            </div>
          </SidebarHeader>
          
          <SidebarContent className="flex flex-col">
            {/* Conversations in ScrollArea taking 1/2 of available space */}
            <SidebarGroup className="flex-1">
              <div className="flex items-center justify-between px-3 py-2 w-full">
                <SidebarGroupLabel className="text-xs font-medium text-muted-foreground">Conversations</SidebarGroupLabel>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={handleNewChat}
                  aria-label="New chat"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="h-[50vh]">
                <SidebarMenu>
                  {loading && (
                    <SidebarMenuItem>
                      <SidebarMenuButton aria-disabled>Loading…</SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {!loading && conversations.length === 0 && (
                    <SidebarMenuItem>
                      <SidebarMenuButton aria-disabled>Start a conversation…</SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {!loading && conversations.map((c) => (
                    <SidebarMenuItem key={c.conversationId}>
                      <SidebarMenuButton onClick={() => router.push(`/c/${encodeURIComponent(c.threadId)}`)}>
                        <span className="truncate max-w-[180px]">{c.title || c.threadId}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </ScrollArea>
            </SidebarGroup>
            
            <SidebarSeparator />
            
            {/* Navigation Links */}
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/settings">
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          
          <SidebarFooter className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <UserButton />
                <span className="text-xs text-muted-foreground">Signed in</span>
              </div>
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


