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
import { useState, useEffect } from "react";
import { useConversations } from "@/context/conversations";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { usePendingTurnStore } from "@/stores/pendingTurn";
import { useModelStore } from "@/stores/modelStore";
import { Send, Paperclip, Sparkles, ChevronUp, ChevronDown } from "lucide-react";
import { GooeyText } from "@/components/ui/gooey-text";
import { HeroGeometric } from "@/components/ui/hero-geometric";
import { Features } from "@/components/ui/features";

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
  const [currentSection, setCurrentSection] = useState(0);
  const sections = [
    { id: 'hero', label: 'Home' },
    { id: 'comparison', label: 'Compare' },
    { id: 'security', label: 'Security' },
    { id: 'features', label: 'Features' },
    { id: 'cta', label: 'Get Started' }
  ];

  const scrollToSection = (index: number) => {
    const section = document.getElementById(sections[index].id);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
      setCurrentSection(index);
    }
  };

  useEffect(() => {
    // Use Intersection Observer for better performance and accuracy
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const sectionId = entry.target.id;
            const index = sections.findIndex(section => section.id === sectionId);
            if (index !== -1) {
              setCurrentSection(index);
            }
          }
        });
      },
      {
        threshold: 0.5, // Trigger when 50% of the section is visible
        rootMargin: '-10% 0px -10% 0px' // Add some margin to avoid rapid switching
      }
    );

    // Observe all sections
    sections.forEach(section => {
      const element = document.getElementById(section.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [sections]);

  return (
    <main className="overflow-x-hidden snap-y snap-mandatory h-screen overflow-y-scroll scrollbar-hide">
      {/* Section Navigation Dots */}
      <div className="fixed right-4 md:right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-3">
        {sections.map((section, index) => (
          <button
            key={section.id}
            onClick={() => scrollToSection(index)}
            className={`group relative w-3 h-3 md:w-4 md:h-4 rounded-full border-2 transition-all duration-300 ${
              currentSection === index
                ? 'bg-primary border-primary scale-125'
                : 'bg-transparent border-muted-foreground/50 hover:border-primary/70'
            }`}
            aria-label={`Go to ${section.label} section`}
          >
            <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none hidden md:block">
              <div className="bg-background/90 backdrop-blur-sm border rounded-lg px-3 py-1 text-xs font-medium whitespace-nowrap">
                {section.label}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Hero Section - Full Screen */}
      <section id="hero" className="h-screen snap-start relative overflow-hidden flex flex-col">
        {/* Navigation */}
        <nav className="relative z-50 bg-transparent">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image src={Logo} alt="BeeNet" width={32} height={32} priority />
              <span className="text-lg font-bold">BeeNet</span>
            </div>
            <div className="flex items-center gap-3">
              <SignInButton mode="modal">
                <Button variant="ghost" size="sm">Sign in</Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button size="sm">Get Started</Button>
              </SignUpButton>
            </div>
          </div>
        </nav>

        <HeroGeometric>
          <div className="text-center flex-1 flex flex-col justify-center min-h-0">
            {/* Main Hero Title */}
            <div className="mb-6">
              <h1 className="text-3xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-4">
                <span className="block bg-gradient-to-r from-primary via-foreground to-accent bg-clip-text text-transparent">
                  Your AI Research
                </span>
                <span className="block bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-transparent">
                  Without Limits
                </span>
              </h1>
            </div>
            
            <p className="text-base md:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed px-4">
              Unlike Perplexity's restrictions, BeeNet gives you unlimited research with your own API keys, 
              custom models, and enterprise-grade security.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
              <SignUpButton mode="modal">
                <Button size="lg" className="text-lg px-8 py-4 rounded-full">
                  Start Free Research
                  <Sparkles className="ml-2 h-5 w-5" />
                </Button>
              </SignUpButton>
              <SignInButton mode="modal">
                <Button size="lg" variant="outline" className="text-lg px-8 py-4 rounded-full">
                  Sign In
                </Button>
              </SignInButton>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 bg-background/20 backdrop-blur-sm rounded-full px-3 py-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Bank-grade encryption
              </div>
              <div className="flex items-center gap-2 bg-background/20 backdrop-blur-sm rounded-full px-3 py-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                Your own API keys
              </div>
              <div className="flex items-center gap-2 bg-background/20 backdrop-blur-sm rounded-full px-3 py-1">
                <span className="h-2 w-2 rounded-full bg-purple-500" />
                Unlimited searches
              </div>
            </div>

            {/* Animated Scroll Down Arrow */}
            <div className="mt-auto pb-8 flex flex-col items-center gap-2 z-30">
              <span className="text-sm text-muted-foreground hidden md:block">Scroll to explore</span>
              <button 
                onClick={() => scrollToSection(1)}
                className="group flex flex-col items-center gap-1 p-2 rounded-full hover:bg-background/20 transition-all duration-300"
                aria-label="Scroll to next section"
              >
                <ChevronDown className="h-6 w-6 text-muted-foreground group-hover:text-primary animate-bounce" />
              </button>
            </div>
          </div>
        </HeroGeometric>
      </section>

      {/* Comparison Section - Fixed height and centering */}
      <section id="comparison" className="h-screen snap-start flex items-center justify-center bg-muted/5 relative overflow-auto">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-6xl py-8 md:py-12">
          <div className="text-center mb-6 md:mb-8">
            <h2 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold mb-3 md:mb-4 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
              Why Choose BeeNet?
            </h2>
            <p className="text-sm md:text-base lg:text-lg text-muted-foreground max-w-2xl mx-auto">
              See how we compare to other AI research platforms
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4 md:gap-6 lg:gap-8">
            {/* Perplexity Column */}
            <div className="bg-muted/30 rounded-lg md:rounded-xl p-3 md:p-4 lg:p-5 border relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 md:w-24 md:h-24 bg-red-500/5 rounded-full -translate-y-10 translate-x-10 md:-translate-y-12 md:translate-x-12" />
              
              <div className="flex items-center gap-2 mb-3 md:mb-4">
                <div className="w-7 h-7 md:w-8 md:h-8 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-base md:text-lg">🔒</span>
                </div>
                <h3 className="text-base md:text-lg font-semibold text-muted-foreground">Perplexity & Others</h3>
              </div>
              
              <ul className="space-y-2 md:space-y-3">
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 text-sm md:text-base">❌</span>
                  <span className="text-xs md:text-sm">Limited to 5-20 searches per month</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 text-sm md:text-base">❌</span>
                  <span className="text-xs md:text-sm">No custom model selection</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 text-sm md:text-base">❌</span>
                  <span className="text-xs md:text-sm">Expensive monthly subscriptions</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 text-sm md:text-base">❌</span>
                  <span className="text-xs md:text-sm">Your data used for training</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 text-sm md:text-base">❌</span>
                  <span className="text-xs md:text-sm">No control over API costs</span>
                </li>
              </ul>
            </div>

            {/* BeeNet Column */}
            <div className="bg-primary/5 rounded-lg md:rounded-xl p-3 md:p-4 lg:p-5 border border-primary/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 md:w-24 md:h-24 bg-primary/10 rounded-full -translate-y-10 translate-x-10 md:-translate-y-12 md:translate-x-12" />
              <div className="absolute top-2 right-2 bg-primary text-primary-foreground px-2 py-0.5 md:px-3 md:py-1 rounded-full text-xs font-medium">
                Better Choice
              </div>
              
              <div className="flex items-center gap-2 mb-3 md:mb-4">
                <Image src={Logo} alt="BeeNet" width={28} height={28} className="md:w-8 md:h-8" />
                <h3 className="text-base md:text-lg font-semibold text-primary">BeeNet</h3>
              </div>
              
              <ul className="space-y-2 md:space-y-3">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 text-sm md:text-base">✅</span>
                  <span className="text-xs md:text-sm"><strong>Unlimited</strong> research with your Serper key</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 text-sm md:text-base">✅</span>
                  <span className="text-xs md:text-sm"><strong>Choose any model:</strong> GPT-4, Claude, Llama, Groq</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 text-sm md:text-base">✅</span>
                  <span className="text-xs md:text-sm"><strong>Pay only</strong> for what you use</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 text-sm md:text-base">✅</span>
                  <span className="text-xs md:text-sm"><strong>Your data stays private</strong> - never used for training</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 text-sm md:text-base">✅</span>
                  <span className="text-xs md:text-sm"><strong>Full transparency</strong> on API usage & costs</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section - Optimized */}
      <section id="security" className="h-screen snap-start flex items-center justify-center bg-gradient-to-br from-background via-muted/5 to-background relative overflow-auto">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 text-center max-w-6xl py-8 md:py-12">
          <div className="mb-6 md:mb-8">
            <h2 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold mb-3 md:mb-4 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
              Enterprise-Grade Security
            </h2>
            <p className="text-sm md:text-base lg:text-lg text-muted-foreground max-w-3xl mx-auto">
              Your API keys and data are protected with military-grade encryption techniques
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-4 md:gap-6">
            <div className="bg-background/50 backdrop-blur-sm border rounded-xl md:rounded-2xl p-4 md:p-6 hover:bg-background/80 transition-all duration-300">
              <div className="w-10 h-10 md:w-12 md:h-12 lg:w-16 lg:h-16 bg-blue-500/10 rounded-xl md:rounded-2xl flex items-center justify-center mx-auto mb-3 md:mb-4">
                <span className="text-xl md:text-2xl lg:text-3xl">🔐</span>
              </div>
              <h3 className="text-base md:text-lg lg:text-xl font-semibold mb-2 md:mb-3">AES-256-GCM Encryption</h3>
              <p className="text-xs md:text-sm lg:text-base text-muted-foreground">
                All API keys encrypted with bank-grade AES-256-GCM encryption with unique initialization vectors
              </p>
            </div>
            
            <div className="bg-background/50 backdrop-blur-sm border rounded-xl md:rounded-2xl p-4 md:p-6 hover:bg-background/80 transition-all duration-300">
              <div className="w-10 h-10 md:w-12 md:h-12 lg:w-16 lg:h-16 bg-green-500/10 rounded-xl md:rounded-2xl flex items-center justify-center mx-auto mb-3 md:mb-4">
                <span className="text-xl md:text-2xl lg:text-3xl">🛡️</span>
              </div>
              <h3 className="text-base md:text-lg lg:text-xl font-semibold mb-2 md:mb-3">Zero-Knowledge Architecture</h3>
              <p className="text-xs md:text-sm lg:text-base text-muted-foreground">
                We never see your decrypted API keys or conversation data - true end-to-end privacy
              </p>
            </div>
            
            <div className="bg-background/50 backdrop-blur-sm border rounded-xl md:rounded-2xl p-4 md:p-6 hover:bg-background/80 transition-all duration-300">
              <div className="w-10 h-10 md:w-12 md:h-12 lg:w-16 lg:h-16 bg-purple-500/10 rounded-xl md:rounded-2xl flex items-center justify-center mx-auto mb-3 md:mb-4">
                <span className="text-xl md:text-2xl lg:text-3xl">🔒</span>
              </div>
              <h3 className="text-base md:text-lg lg:text-xl font-semibold mb-2 md:mb-3">HMAC Authentication</h3>
              <p className="text-xs md:text-sm lg:text-base text-muted-foreground">
                Secure proxy communication with cryptographic HMAC signatures for tamper-proof requests
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - Optimized */}
      <section id="features" className="min-h-screen snap-start">
        <Features />
      </section>

      {/* CTA Section - Optimized */}
      <section id="cta" className="h-screen snap-start flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 relative overflow-auto">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 text-center max-w-4xl py-8 md:py-12">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold mb-4 md:mb-6 bg-gradient-to-r from-primary via-foreground to-accent bg-clip-text text-transparent">
              Ready to Research Without Limits?
            </h2>
            <p className="text-sm md:text-base lg:text-lg text-muted-foreground mb-6 md:mb-8 max-w-2xl mx-auto">
              Join thousands of researchers, developers, and professionals who've made the switch to BeeNet
            </p>
            
            <div className="flex flex-wrap items-center justify-center gap-4 mb-6 md:mb-8">
              <SignUpButton mode="modal">
                <Button size="lg" className="text-base md:text-lg px-6 md:px-8 lg:px-12 py-3 md:py-4 lg:py-6 rounded-full">
                  Start Free Today
                  <ChevronUp className="ml-2 h-4 w-4 md:h-5 md:w-5 lg:h-6 lg:w-6 rotate-45" />
                </Button>
              </SignUpButton>
            </div>
            
            <p className="text-xs md:text-sm lg:text-base text-muted-foreground">
              No credit card required • Set up in 2 minutes • Cancel anytime
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function ChatWithSidebar() { return (<><StartPanel /><Toaster richColors /></>); }

function StartPanel() {
  const router = useRouter();
  const [val, setVal] = useState("");
  const { addOrPrepend } = useConversations();
  const { ready, hasSerperKey } = useModelStore();

  // Status bootstrapped globally in Providers; no local fetch here

  const onSend = async () => {
    const text = val.trim();
    if (!text) return;
    if (!ready || !hasSerperKey) {
      toast.error('Please configure a model and Serper key in Settings before starting a chat.');
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
                disabled={!ready || !hasSerperKey}
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
                  disabled={!val.trim() || !ready || !hasSerperKey}
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
        {/* Only show after status has been fetched from backend (ready/hasSerperKey not undefined) */}
        {((ready === false) || (hasSerperKey === false)) && (
          <div className="mt-4">
            <Alert variant={"destructive"}>
              <AlertTriangle className="mt-0.5" />
              <div className="col-start-2 flex items-center gap-2 text-sm">
                <span className="font-medium">Setup required:</span>
                <span>Add a model and your Serper API key to start chatting.</span>
                <Link href="/settings" className="underline">Settings</Link>
              </div>
            </Alert>
          </div>
        )}
      </div>
    </div>
  );
}
