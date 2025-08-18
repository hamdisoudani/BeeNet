"use client";

import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import Link from "next/link";
import Image from "next/image";
import Logo from "@/public/logo.png";
import { Alert } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useConversations } from "@/context/conversations";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { usePendingTurnStore } from "@/stores/pendingTurn";
import { useModelStore } from "@/stores/modelStore";
import { Send, Paperclip, Sparkles, ChevronUp } from "lucide-react";

export default function Home() {
  return (
    <>
      <SignedOut>
        <Landing />
      </SignedOut>
      <SignedIn>
        <ChatWithSidebar />
      </SignedIn>
    </>
  );
}

function Landing() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center text-center px-6">
      <div className="max-w-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Live AI agent with streaming plan UI
        </div>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">Build faster with Beenet</h1>
        <p className="mt-4 text-muted-foreground">
          Sign in to start a new chat. Your agent plans, researches, and responds with a modern UI.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <SignInButton mode="modal">
            <Button size="lg">Sign in</Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="lg" variant="outline">Create account</Button>
          </SignUpButton>
          <Link href="https://github.com" target="_blank" className="text-sm text-muted-foreground hover:underline">
            Learn more
          </Link>
        </div>
      </div>
    </main>
  );
}

function ChatWithSidebar() { return (<><StartPanel /><Toaster richColors /></>); }

function StartPanel() {
  const router = useRouter();
  const [val, setVal] = useState("");
  const { addOrPrepend } = useConversations();
  const { ready, hasTavilyKey } = useModelStore();

  // Status bootstrapped globally in Providers; no local fetch here

  const onSend = async () => {
    const text = val.trim();
    if (!text) return;
    if (!ready || !hasTavilyKey) {
      toast.error('Please configure a model and Tavily key in Settings before starting a chat.');
      router.push('/settings');
      return;
    }
    try {
      const queue = usePendingTurnStore.getState();
      // Request a server-generated chat id and route
      const res = await fetch("/api/conversations/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: text.slice(0, 120) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.threadId) {
        toast.error("Failed to create conversation");
        return;
      }
      const id: string | undefined = data?.threadId || data?.id;
      if (id) {
        try {
          const detail = {
            conversationId: data?.conversationId,
            threadId: id,
            title: text.slice(0, 120),
            lastMessageAt: new Date().toISOString(),
            messageCount: 0,
          };
          // Update global store immediately
          addOrPrepend(detail);
          toast.success("Conversation created");
        } catch {}
        // Queue the first user message for reliable handoff after navigation
        // Queue the first user message securely in the in-memory store
        queue.queuePendingTurn(id, {
          id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
          content: text,
          createdAt: Date.now(),
        });
        // Navigate without query params; Chat page will consume the queued message
        router.push(`/c/${id}`);
      }
    } catch {}
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-6">
            <Image src={Logo} alt="BeeNet" width={84} height={84} priority />
          </div>
          <h1 className="text-2xl md:text-3xl font-medium text-foreground/90 mb-2">
            Where knowledge begins
          </h1>
          <p className="text-sm text-muted-foreground">
            Ask anything and get intelligent answers with real-time research
          </p>
        </div>

        {/* Main Input Area - Clean Professional Design */}
        <div className="relative">
          <div className="group relative rounded-2xl border border-border bg-background hover:border-border/80 transition-all duration-300 focus-within:border-primary/40 focus-within:shadow-lg backdrop-blur-sm">
            {/* Input Area */}
            <div className="relative">
              <textarea
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                placeholder="Ask anything to start..."
                rows={1}
                disabled={!ready || !hasTavilyKey}
                className="w-full resize-none bg-transparent border-0 outline-none py-4 px-4 text-sm md:text-base placeholder:text-sm placeholder:text-foreground/40 text-foreground min-h-[80px] max-h-[200px] leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  fieldSizing: 'content',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none'
                } as any}
              />
              
              {/* Bottom Bar */}
              <div className="flex items-center justify-between px-4 pb-4">
                <div className="flex items-center gap-3 text-xs text-foreground/50">
                  <button 
                    type="button"
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md text-foreground/60 hover:text-foreground hover:bg-background/50 transition-colors"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                  </button>
                  <span className="hidden sm:inline">Press Ctrl + Enter to send</span>
                  <span className="sm:hidden">Ctrl + Enter</span>
                </div>
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!val.trim() || !ready || !hasTavilyKey}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 text-sm font-medium shadow-lg disabled:shadow-none"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
            </div>
          </div>

          {/* Suggestions */}
          <div className="mt-6 flex flex-wrap gap-2 justify-center px-4">
            {["Explain quantum physics", "Write a Python script", "Summarize latest AI news"].map((suggestion, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setVal(suggestion)}
                className="inline-flex items-center px-3 py-2 rounded-lg border border-white/10 bg-background/50 backdrop-blur hover:border-white/20 hover:bg-background/70 transition-all duration-200 text-xs text-foreground/70 hover:text-foreground"
              >
                <span className="truncate max-w-[120px] sm:max-w-none">{suggestion}</span>
              </button>
            ))}
          </div>
        </div>
        {(!ready || !hasTavilyKey) && (
          <div className="mt-4">
            <Alert variant={"destructive"}>
              <AlertTriangle className="mt-0.5" />
              <div className="col-start-2 flex items-center gap-2 text-sm">
                <span className="font-medium">Setup required:</span>
                <span>Add a model and your Tavily API key to start chatting.</span>
                <Link href="/settings" className="underline">Settings</Link>
              </div>
            </Alert>
          </div>
        )}
      </div>
    </div>
  );
}
