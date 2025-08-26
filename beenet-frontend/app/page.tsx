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
import { ShaderHero } from "@/components/ui/shader-hero";
import { GlobalShaderBackground } from "@/components/ui/global-shader-background";

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
    <GlobalShaderBackground variant="hero" intensity="medium">
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

      {/* Hero Section - Shader Experience */}
      <section id="hero" className="h-screen snap-start relative overflow-hidden">
        <ShaderHero scrollToSection={scrollToSection} />
      </section>

      {/* Comparison Section - Fixed height and centering */}
      <section id="comparison" className="h-screen snap-start flex items-center justify-center relative overflow-auto">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-6xl py-8 md:py-12">
          <div className="text-center mb-6 md:mb-8">
            <h2 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold mb-3 md:mb-4 bg-gradient-to-r from-white to-amber-200 bg-clip-text text-transparent" style={{ filter: "drop-shadow(0 0 20px rgba(0,0,0,0.8))" }}>
              Why Choose BeeNet?
            </h2>
            <p className="text-sm md:text-base lg:text-lg text-white/70 max-w-2xl mx-auto" style={{ filter: "drop-shadow(0 0 15px rgba(0,0,0,0.8))" }}>
              See how we compare to other AI research platforms
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4 md:gap-6 lg:gap-8">
            {/* Perplexity Column */}
            <div className="bg-white/10 backdrop-blur-lg rounded-lg md:rounded-xl p-3 md:p-4 lg:p-5 border border-white/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 md:w-24 md:h-24 bg-red-500/5 rounded-full -translate-y-10 translate-x-10 md:-translate-y-12 md:translate-x-12" />
              
              <div className="flex items-center gap-2 mb-3 md:mb-4">
                <div className="w-7 h-7 md:w-8 md:h-8 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-base md:text-lg">🔒</span>
                </div>
                <h3 className="text-base md:text-lg font-semibold text-white/80">Perplexity & Others</h3>
              </div>
              
              <ul className="space-y-2 md:space-y-3">
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 text-sm md:text-base">❌</span>
                  <span className="text-xs md:text-sm text-white/70">Limited to 5-20 searches per month</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 text-sm md:text-base">❌</span>
                  <span className="text-xs md:text-sm text-white/70">No custom model selection</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 text-sm md:text-base">❌</span>
                  <span className="text-xs md:text-sm text-white/70">Expensive monthly subscriptions</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 text-sm md:text-base">❌</span>
                  <span className="text-xs md:text-sm text-white/70">Your data used for training</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 text-sm md:text-base">❌</span>
                  <span className="text-xs md:text-sm text-white/70">No control over API costs</span>
                </li>
              </ul>
            </div>

            {/* BeeNet Column */}
            <div className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 backdrop-blur-lg rounded-lg md:rounded-xl p-3 md:p-4 lg:p-5 border border-amber-400/30 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 md:w-24 md:h-24 bg-amber-400/20 rounded-full -translate-y-10 translate-x-10 md:-translate-y-12 md:translate-x-12" />
              <div className="absolute top-2 right-2 bg-gradient-to-r from-amber-400 to-orange-500 text-black px-2 py-0.5 md:px-3 md:py-1 rounded-full text-xs font-medium">
                Better Choice
              </div>
              
              <div className="flex items-center gap-2 mb-3 md:mb-4">
                <Image src={Logo} alt="BeeNet" width={28} height={28} className="md:w-8 md:h-8" />
                <h3 className="text-base md:text-lg font-semibold text-amber-200">BeeNet</h3>
              </div>
              
              <ul className="space-y-2 md:space-y-3">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 text-sm md:text-base">✅</span>
                  <span className="text-xs md:text-sm text-white/90"><strong className="text-amber-200">Unlimited</strong> research with your Serper key</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 text-sm md:text-base">✅</span>
                  <span className="text-xs md:text-sm text-white/90"><strong className="text-amber-200">Choose any model:</strong> GPT-4, Claude, Llama, Groq</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 text-sm md:text-base">✅</span>
                  <span className="text-xs md:text-sm text-white/90"><strong className="text-amber-200">Pay only</strong> for what you use</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 text-sm md:text-base">✅</span>
                  <span className="text-xs md:text-sm text-white/90"><strong className="text-amber-200">Your data stays private</strong> - never used for training</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 text-sm md:text-base">✅</span>
                  <span className="text-xs md:text-sm text-white/90"><strong className="text-amber-200">Full transparency</strong> on API usage & costs</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section - Optimized */}
      <section id="security" className="h-screen snap-start flex items-center justify-center relative overflow-auto">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 text-center max-w-6xl py-8 md:py-12">
          <div className="mb-6 md:mb-8">
            <h2 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold mb-3 md:mb-4 bg-gradient-to-r from-white to-amber-200 bg-clip-text text-transparent" style={{ filter: "drop-shadow(0 0 20px rgba(0,0,0,0.8))" }}>
              Enterprise-Grade Security
            </h2>
            <p className="text-sm md:text-base lg:text-lg text-white/70 max-w-3xl mx-auto" style={{ filter: "drop-shadow(0 0 15px rgba(0,0,0,0.8))" }}>
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
            <h2 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold mb-4 md:mb-6 bg-gradient-to-r from-white to-amber-200 bg-clip-text text-transparent" style={{ filter: "drop-shadow(0 0 20px rgba(0,0,0,0.8))" }}>
              Ready to Research Without Limits?
            </h2>
            <p className="text-sm md:text-base lg:text-lg text-white/70 mb-6 md:mb-8 max-w-2xl mx-auto" style={{ filter: "drop-shadow(0 0 15px rgba(0,0,0,0.8))" }}>
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
    </GlobalShaderBackground>
  );
}

function ChatWithSidebar() { return (<><StartPanel /><Toaster richColors /></>); }

function StartPanel() {
  const router = useRouter();
  const [val, setVal] = useState("");
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
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
    
    // Prevent multiple simultaneous conversation creation
    if (isCreatingConversation) return;
    
    setIsCreatingConversation(true);
    
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
    } catch (error) {
      toast.error("Failed to create conversation");
    } finally {
      setIsCreatingConversation(false);
    }
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Header - Clean & Professional */}
        <div className="text-center mb-16">
          <div className="mb-8">
            <Image src={Logo} alt="BeeNet" width={56} height={56} priority className="mx-auto mb-6" />
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light text-foreground mb-6 tracking-tight">
            Research anything
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-lg mx-auto font-light">
            AI-powered research with unlimited searches using your API keys
          </p>
        </div>

        {/* Main Input Area - Professional with Better Textarea */}
        <div className="relative max-w-3xl mx-auto">
          <div className="relative border border-border/60 rounded-xl bg-background/50 backdrop-blur-sm transition-all duration-200 focus-within:border-border focus-within:shadow-lg focus-within:shadow-black/5">
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
                placeholder="Ask me anything..."
                rows={1}
                disabled={!ready || !hasSerperKey || isCreatingConversation}
                className="w-full resize-none bg-transparent border-0 outline-none py-6 px-6 text-xs md:text-sm placeholder:text-muted-foreground text-foreground min-h-[100px] max-h-[200px] leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  fieldSizing: 'content',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none'
                } as any}
              />
              
              {/* Bottom Bar */}
              <div className="flex items-center justify-between px-6 pb-6">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <button 
                    type="button"
                    onClick={() => toast.info("File attachments coming soon", {
                      description: "Document upload and analysis features in development",
                      duration: 2000,
                    })}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors duration-200"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <div className="hidden sm:flex items-center gap-1 text-xs">
                    <kbd className="px-1.5 py-0.5 bg-muted/50 border border-border/50 rounded">⌘</kbd>
                    <span>+</span>
                    <kbd className="px-1.5 py-0.5 bg-muted/50 border border-border/50 rounded">↵</kbd>
                    <span className="ml-1">to send</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!val.trim() || !ready || !hasSerperKey || isCreatingConversation}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 text-sm font-medium"
                  aria-label="Send message"
                >
                  {isCreatingConversation ? (
                    <>
                      <div className="h-4 w-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                      <span className="hidden sm:inline">Creating...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span className="hidden sm:inline">Send</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Simple Suggestions */}
        <div className="mt-12 max-w-2xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              "Latest AI developments",
              "Climate change research", 
              "Stock market analysis"
            ].map((suggestion, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setVal(suggestion)}
                disabled={isCreatingConversation}
                className="p-3 text-left border border-border/50 rounded-lg bg-background/30 hover:bg-background/50 hover:border-border transition-all duration-200 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
        
        {/* Setup Alert - Clean Design */}
        {((ready === false) || (hasSerperKey === false)) && (
          <div className="mt-8 max-w-2xl mx-auto">
            <div className="border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-orange-800 dark:text-orange-200 mb-1">Setup required</p>
                  <p className="text-orange-700 dark:text-orange-300">
                    Configure your API keys in{" "}
                    <Link href="/settings" className="underline hover:no-underline">
                      Settings
                    </Link>
                    {" "}to start researching
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
