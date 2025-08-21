"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import Logo from "@/public/logo.png";
import { CopilotChat } from "@copilotkit/react-ui";
import type { AssistantMessageProps } from "@copilotkit/react-ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import remarkSmartypants from "remark-smartypants";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeExternalLinks from "rehype-external-links";
// rehype-highlight is replaced by react-syntax-highlighter for better control
import rehypeKatex from "rehype-katex";
import { Copy, Check } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCoAgent, useCoAgentStateRender } from "@copilotkit/react-core";
import type { AgentStateTS, ResearchPlanTS, PlanStepTS } from "@/types/agent";
import { useModelStore } from "@/stores/modelStore";
import type { InputProps } from "@copilotkit/react-ui";

// Removed react-virtuoso to prevent auto-scroll jitter
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Search, Loader2, Send, Check as CheckIcon, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
 

export default function CustomChat() {
  // Access co-agent state and runtime info for UI signals
  const { state, setState, running, nodeName } = useCoAgent<AgentStateTS>({
    name: "starterAgent",
    initialState: {
        plan: { mode: "direct", steps: [] } as unknown as ResearchPlanTS,
        error: undefined,
        evidence: [],
    }
  });
  // Stream agent state into the chat as inline generative UI (e.g., plan)
  useCoAgentStateRender<AgentStateTS>({
    name: "starterAgent",
    render: ({ state }) => {
      const plan = state?.plan as ResearchPlanTS | undefined;
      const err = state?.error || (plan && (plan as any).error);
      if (err && typeof err === "object" && typeof err.message === "string" && err.message.trim()) {
        return <ErrorBanner error={err} />;
      }
      if (!plan) return null;
      return <InlinePlan plan={plan} running={running} nodeName={nodeName} />;
    },
  });

  const resetPlanInTheState = () => {
    setState({ plan: { mode: "direct", steps: [] } as unknown as ResearchPlanTS, error: undefined, evidence: [] });
  }


  // No custom message renderer; rely on CopilotKit built-in list for smoothness

  // Remove localStorage hydration; backend is source of truth now

  return (
    <div className="relative h-[calc(100dvh-64px)] lg:h-[100dvh] max-w-4xl mx-auto w-full flex flex-col px-0 sm:px-1 pt-2">
      <div className="flex-1 bg-background overflow-hidden">
        <CopilotChat
          Input={Input}
          AssistantMessage={CustomAssistantMessage}
          UserMessage={UserMessageBubble}
          onSubmitMessage={resetPlanInTheState}
          className="flex h-full flex-col [&>.copilot-kit-chat]:!p-0 [&>.copilot-kit-chat]:!max-w-none [&>.copilot-kit-chat]:!mx-0"
        />
      </div>
    </div>
  );
}

function CustomAssistantMessage(props: AssistantMessageProps) {
  const { message, isLoading, markdownTagRenderers, onRegenerate, onCopy, isCurrentMessage } = props as AssistantMessageProps & {
    // allow unknown extra props without breaking rendering
    [key: string]: unknown;
  };
  const content: string =
    typeof message === "string"
      ? message
      : typeof (message as any)?.content === "string"
      ? (message as any).content
      : typeof (message as any)?.text === "string"
      ? (message as any).text
      : "";
  const subUI = (message as any)?.generativeUI?.();
  const [copiedResponse, setCopiedResponse] = React.useState(false);

  async function handleCopyResponse(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      onCopy?.(text);
      setCopiedResponse(true);
      setTimeout(() => setCopiedResponse(false), 1500);
    } catch {
      // ignore
    }
  }

  // Intersection observer to avoid rendering heavy markdown until visible
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = React.useState<boolean>(false);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e && e.isIntersecting) setInView(true);
      },
      { root: null, threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Map markdown elements to shadcn UI components for consistent styling
  const mdComponents: any = React.useMemo(() => ({
    // Headings
    h1: ({ children }: any) => (
      <h1 className="mt-6 mb-3 text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="mt-6 mb-3 text-xl md:text-2xl font-semibold tracking-tight text-foreground">
        {children}
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="mt-5 mb-2 text-lg md:text-xl font-medium text-foreground">
        {children}
      </h3>
    ),
    h4: ({ children }: any) => (
      <h4 className="mt-4 mb-2 text-base md:text-lg font-medium text-foreground">
        {children}
      </h4>
    ),
    p: ({ children }: any) => (
      <p className="my-3 leading-relaxed text-foreground/90">{children}</p>
    ),
    hr: () => (
      <hr className="my-6 border-t border-border" />
    ),
    ul: ({ children }: any) => (
      <ul className="my-3 ml-5 list-disc space-y-1">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="my-3 ml-5 list-decimal space-y-1">{children}</ol>
    ),
    li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
    table: ({ children }: any) => (
      <div className="w-full overflow-x-auto my-4 rounded-md border shadow-sm">
        <Table className="w-full">{children}</Table>
      </div>
    ),
    thead: ({ children }: any) => <TableHeader className="bg-muted/50">{children}</TableHeader>,
    tbody: ({ children }: any) => <TableBody>{children}</TableBody>,
    tr: ({ children }: any) => <TableRow className="hover:bg-muted/30 transition-colors">{children}</TableRow>,
    th: ({ children }: any) => (
      <TableHead className="font-medium text-foreground whitespace-pre-wrap h-10 px-4 text-left align-middle">
        {children}
      </TableHead>
    ),
    td: ({ children }: any) => <TableCell className="p-3 align-middle whitespace-pre-wrap">{children}</TableCell>,
    a: ({ children, href, ...rest }: any) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline underline-offset-2 transition-colors font-medium"
        {...rest}
      >
        {children}
      </a>
    ),
    img: ({ src, alt }: any) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt || ""}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="max-w-full h-auto rounded-md shadow-sm my-4 mx-auto"
      />
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-primary/30 pl-4 py-1 my-4 italic text-muted-foreground bg-muted/20 rounded-r-md">
        {children}
      </blockquote>
    ),
    code: ({ inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || "");
      const codeString = String(children ?? "").replace(/\n$/, "");
      const [expanded, setExpanded] = React.useState<boolean>(false);
      const long = codeString.length > 800 || codeString.split('\n').length > 30;
      const display = !expanded && long ? codeString.split('\n').slice(0, 30).join('\n') + "\n…" : codeString;
      if (!inline && match) {
        return (
          <div className="relative my-6">
            <SyntaxHighlighter
              language={match[1]}
              style={oneDark as any}
              PreTag="div"
              customStyle={{ margin: 0, borderRadius: 8, fontSize: 13 }}
              showLineNumbers={false}
              wrapLongLines
              {...props}
            >
              {display}
            </SyntaxHighlighter>
            <CopyButton text={codeString} />
            {long && (
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  className="text-xs rounded-md border px-2 py-1 hover:bg-accent"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                >
                  {expanded ? "Collapse" : "Expand"}
                </button>
              </div>
            )}
          </div>
        );
      }
      return (
        <code className={`px-1.5 py-0.5 rounded font-mono text-primary bg-primary/10 text-sm ${className || ""}`} {...props}>
          {children}
        </code>
      );
    },
  }), []);

  // Safe HTML whitelist with extras for class/rel/target on links and table attrs
  const sanitizeSchema: any = React.useMemo(() => ({
    ...defaultSchema,
    attributes: {
      ...(defaultSchema as any).attributes,
      a: [
        ...(((defaultSchema as any).attributes?.a) || []),
        ["className"],
        ["target"],
        ["rel"],
      ],
      img: [
        ...(((defaultSchema as any).attributes?.img) || []),
        ["className"],
      ],
      table: [
        ...(((defaultSchema as any).attributes?.table) || []),
        ["className"],
      ],
      th: [
        ...(((defaultSchema as any).attributes?.th) || []),
        ["className"],
      ],
      td: [
        ...(((defaultSchema as any).attributes?.td) || []),
        ["className"],
      ],
      blockquote: [
        ...(((defaultSchema as any).attributes?.blockquote) || []),
        ["className"],
      ],
      code: [
        ...(((defaultSchema as any).attributes?.code) || []),
        ["className"],
      ],
    },
  }), []);
  const shouldRender = isCurrentMessage || inView || isLoading;
  const markdownElement = React.useMemo(() => (
    <ReactMarkdown
      // Cast plugins to any to avoid type conflicts between nested deps
      remarkPlugins={[
        remarkGfm as any,
        remarkBreaks as any,
        remarkMath as any,
        remarkSmartypants as any,
      ]}
      rehypePlugins={[
        rehypeRaw as any,
        [rehypeSanitize as any, sanitizeSchema],
        rehypeSlug as any,
        [rehypeExternalLinks as any, { target: "_blank", rel: ["noopener", "noreferrer"] }],
        rehypeKatex as any,
      ]}
      components={{
        ...(markdownTagRenderers as any),
        ...mdComponents,
      }}
    >
      {content}
    </ReactMarkdown>
  ), [content, mdComponents, sanitizeSchema, markdownTagRenderers]);
  return (
    <div ref={containerRef} className="pb-3 w-full">
      {(content || isLoading) && (
        <div className="p-1 text-sm text-foreground/90 w-full overflow-hidden">
          {content && shouldRender && (
            <div className="prose prose-sm dark:prose-invert w-full break-words overflow-hidden">{markdownElement}</div>
          )}
          {content && !shouldRender && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          )}
          {isLoading && <BeeLoader />}
          {!isLoading && content && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <button
                type="button"
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 transition-colors ${copiedResponse ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'hover:bg-accent'}`}
                onClick={() => handleCopyResponse(content)}
                aria-label="Copy response"
                aria-live="polite"
              >
                {copiedResponse ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedResponse ? 'Copied!' : 'Copy'}
              </button>
              {/* Regenerate button temporarily commented out */}
              {/* {isCurrentMessage && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent transition-colors"
                  onClick={() => onRegenerate?.()}
                  aria-label="Regenerate response"
                >
                  <RefreshCcw className="h-3.5 w-3.5" /> Regenerate
                </button>
              )} */}
            </div>
          )}
        </div>
      )}
      {subUI && <div className="mt-2">{subUI}</div>}
    </div>
  );
}

function BeeLoader() {
  return (
    <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-xs text-primary shadow-sm">
      <span className="relative inline-block h-4 w-4">
        <Image src={Logo} alt="BeeNet" fill className="object-contain animate-[beeBuzz_900ms_ease-in-out_infinite]" />
      </span>
      <span className="font-medium">Thinking…</span>
      <style jsx>{`
        @keyframes beeBuzz {
          0% { transform: translate(0, 0) rotate(0deg); }
          20% { transform: translate(2px, -1px) rotate(-8deg); }
          40% { transform: translate(-1px, 2px) rotate(6deg); }
          60% { transform: translate(1px, -2px) rotate(-6deg); }
          80% { transform: translate(-2px, 1px) rotate(8deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {}
      }}
      className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border bg-background/70 px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
      aria-label={copied ? "Copied" : "Copy code"}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
    </button>
  );
}

function InlinePlan({ plan, running, nodeName }: { plan: ResearchPlanTS; running?: boolean; nodeName?: string }) {
  const isDirect = plan?.mode === "direct";
  
  // Early return BEFORE any hooks are called
  if (!plan) {
    return null;
  }
  
  if (isDirect) {
    return <DirectPlan plan={plan} running={running} />;
  } else {
    return <SearchPlan plan={plan} running={running} />;
  }
}

function ErrorBanner({ error }: { error: any }) {
  try {
    const message: string | undefined = typeof error?.message === "string" ? error.message : undefined;
    const type: string | undefined = typeof error?.type === "string" ? error.type : undefined;
    const codes: string[] = Array.isArray(error?.codes) ? error.codes : [];
    if (!message) return null;
    return (
      <div className="w-full">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
          <div className="text-sm font-medium">{message}</div>
          <div className="mt-1 text-xs text-destructive/80">
            {(type || codes.length > 0) && (
              <span>
                {type ? `${type}` : ''}{type && codes.length > 0 ? ' · ' : ''}{codes.length > 0 ? `codes: ${codes.join(', ')}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  } catch {
    return null;
  }
}

function DirectPlan({ plan, running }: { plan: ResearchPlanTS; running?: boolean }) {
  const reason = (typeof plan?.reason === "string" && plan.reason.trim().length > 0)
    ? String(plan.reason)
    : "Direct response";
  
  const step = { 
    key: "direct-1", 
    id: "direct-1", 
    title: reason, 
    status: "completed", 
    queries: [], 
    results: [], 
    answer: undefined 
  };

  return (
    <div className="w-full">
      <div className="relative rounded-xl shadow-sm border overflow-hidden bg-card">
        {/* Mode indicator */}
        <span className="absolute top-2 left-2 text-[10px] px-2 rounded-full border bg-background/80 backdrop-blur text-foreground/70">
          direct
        </span>
        
        {/* Progress indicator */}
        <span className="absolute top-2 right-2 text-[11px] text-muted-foreground">
          1/1
        </span>
        
        {/* Progress bar */}
        <div className="px-2 md:px-3 pt-7">
          <div className="h-1.5 w-full rounded bg-border overflow-hidden">
            <div className="h-full bg-primary transition-[width] duration-300" style={{ width: "100%" }} />
          </div>
        </div>
        
        {/* Steps content */}
        <div className="p-2 md:p-3">
          <ul className="flex flex-col gap-2">
            <StepCard 
              step={step} 
              isActive={false} 
              collapsible={false}
            />
          </ul>
        </div>
      </div>
    </div>
  );
}

function SearchPlan({ plan, running }: { plan: ResearchPlanTS; running?: boolean }) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  
  // Early return if no steps
  if (steps.length === 0) {
    return null;
  }
  
  const normalized = React.useMemo(() => {
    return steps.map((s: any, i: number) => {
      if (typeof s === "string") {
        return { 
          key: `step-${i}`, 
          id: `step-${i}`, 
          title: s, 
          status: undefined, 
          queries: [], 
          results: [], 
          error: undefined 
        };
      }
      const id = typeof s?.id === "string" ? s.id : `step-${i}`;
      const title = s?.title ?? String(s ?? "");
      const status = typeof s?.status === "string" ? s.status : undefined;
      const queries = Array.isArray(s?.queries) ? s.queries : [];
      const results = Array.isArray(s?.results) ? s.results : [];
      const error = typeof s?.error === "object" ? s.error : undefined;
      return { key: id, id, title, status, queries, results, error };
    });
  }, [steps]);

  const activeIndex = React.useMemo(() => {
    const readingIdx = normalized.findIndex((s: any) => s.status === "reading");
    if (readingIdx >= 0) return readingIdx;
    const searchingIdx = normalized.findIndex((s: any) => s.status === "searching");
    if (searchingIdx >= 0) return searchingIdx;
    const pendIdx = normalized.findIndex((s: any) => !s.status || s.status === "pending");
    return pendIdx >= 0 ? pendIdx : -1;
  }, [normalized]);

  const completedCount = normalized.filter((s: any) => s.status === 'completed').length;
  const totalCount = Math.max(1, normalized.length);
  const percent = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="w-full">
      <div className="relative rounded-xl shadow-sm border overflow-hidden bg-card">
        {/* Mode indicator */}
        <span className="absolute top-2 left-2 text-[10px] px-2 rounded-full border bg-background/80 backdrop-blur text-foreground/70">
          search
        </span>
        
        {/* Progress indicator */}
        <span className="absolute top-2 right-2 text-[11px] text-muted-foreground">
          {completedCount}/{totalCount}
        </span>
        
        {/* Reason section */}
        {typeof plan?.reason === 'string' && plan.reason && (
          <div className="px-2 md:px-3 pt-7 text-xs text-muted-foreground break-words">
            {String(plan.reason)}
          </div>
        )}
        
        {/* Progress bar */}
        <div className="px-2 md:px-3 pt-2">
          <div className="h-1.5 w-full rounded bg-border overflow-hidden">
            <div 
              className="h-full bg-primary transition-[width] duration-300" 
              style={{ width: `${percent}%` }} 
            />
          </div>
        </div>
        
        {/* Steps content */}
        <div className="p-2 md:p-3">
          <ul className="flex flex-col gap-2">
            {normalized.map((s: any, idx: number) => (
              <StepCard 
                key={`${s.key}-${idx}`} 
                step={s} 
                isActive={idx === activeIndex} 
                collapsible={true}
              />
            ))}
            {normalized.length === 0 && (
              <div className="text-xs text-muted-foreground">No steps.</div>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function StepCard({ step, isActive, collapsible = true }: { step: any; isActive: boolean; collapsible?: boolean }) {
  const status: string = typeof step?.status === 'string' ? step.status : 'pending';
  const [open, setOpen] = React.useState<boolean>(!!isActive);
  React.useEffect(() => setOpen(!!isActive), [isActive]);
  const Pill = () => {
    if (step?.error) return (<div className="h-5 w-5 rounded-full bg-red-500 text-white grid place-items-center shrink-0"><span className="text-[10px] font-bold">!</span></div>);
    if (status === 'completed') return (<div className="h-5 w-5 rounded-full bg-emerald-500 text-white grid place-items-center shrink-0"><CheckIcon className="h-3.5 w-3.5" /></div>);
    if (status === 'reading' || status === 'searching') return (<div className="h-5 w-5 rounded-full bg-primary text-primary-foreground grid place-items-center shrink-0"><Loader2 className="h-3.5 w-3.5 animate-spin" /></div>);
    return (<div className="h-5 w-5 rounded-full border border-muted-foreground/40 bg-background shrink-0" />);
  };
  const headerPadding = "p-2";
  const Header = (
    <div className={`flex items-center gap-2 ${headerPadding}`}>
      <Pill />
      {collapsible ? (
        <CollapsibleTrigger className="group flex items-center gap-2 text-left w-full">
          <span className="text-foreground/90 break-words w-full min-w-0 text-xs md:text-sm">{step.title}</span>
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
      ) : (
        <div className="text-left w-full">
          <span className="text-foreground/90 break-words w-full min-w-0 text-xs md:text-sm">{step.title}</span>
        </div>
      )}
    </div>
  );

  const Body = (
    <div className="px-2 pb-2 space-y-2">
          {step?.error ? (
            <div className="text-xs text-red-600 whitespace-pre-wrap border rounded-md p-2 bg-red-50">
              {typeof step.error?.message === 'string' ? step.error.message : 'This step failed.'}
              {Array.isArray(step.error?.codes) && step.error.codes.length > 0 && (
                <div className="mt-1 text-[11px] opacity-80">codes: {step.error.codes.slice(0,3).join(', ')}</div>
              )}
            </div>
          ) : null}
          {Array.isArray(step.queries) && step.queries.length > 0 && (
            <div className="-mx-2 px-2 overflow-x-auto">
              <div className="flex items-center gap-2 py-1 w-max">
                {step.queries.slice(0, 8).map((q: string, idx: number) => (
                  <span key={`q-${step.id || 'step'}-${idx}-${q}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground border border-border whitespace-nowrap">
                    <Search className="h-3 w-3 opacity-60" />
                    {q}
                  </span>
                ))}
              </div>
            </div>
          )}
          {Array.isArray(step.results) && step.results.length > 0 && (
            <div className="max-h-48 overflow-y-auto pr-1 md:pr-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              <div className="grid grid-cols-1 gap-2">
                {step.results.map((r: any, idx: number) => (
                  <SourceCard key={`res-${step.id || 'step'}-${idx}-${r?.url || idx}`} result={r} />
                ))}
              </div>
            </div>
          )}
          {/* provider short answers removed */}
    </div>
  );

  return (
    <li className="rounded-lg border bg-background">
      {collapsible ? (
        <Collapsible open={open} onOpenChange={setOpen}>
          {Header}
          <CollapsibleContent>{Body}</CollapsibleContent>
        </Collapsible>
      ) : (
        <div>
          {Header}
          {Body}
        </div>
      )}
    </li>
  );
}

function SourceCard({ result }: { result: any }) {
  try {
    const url: string | undefined = typeof result?.url === "string" ? result.url : undefined;
    const title: string = typeof result?.title === "string" && result.title.trim().length > 0 ? result.title : (url || "Untitled");
    const favicon: string | undefined = typeof result?.favicon === "string" ? result.favicon : undefined;
    const domain = (() => {
      try { return url ? new URL(url).hostname : undefined; } catch { return undefined; }
    })();
    const Card = (
      <div className="w-full border rounded-md p-2 hover:bg-accent/40 transition">
        <div className="flex items-start gap-2">
          {favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={favicon} alt="" className="h-4 w-4 rounded-sm mt-0.5" />
          ) : (
            <div className="h-4 w-4 rounded-sm bg-muted mt-0.5" />
          )}
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium">{title}</div>
            {domain && <div className="text-[10px] text-muted-foreground truncate">{domain}</div>}
          </div>
        </div>
      </div>
    );
    return url ? (
      <a href={url} target="_blank" rel="noreferrer noopener">{Card}</a>
    ) : (
      Card
    );
  } catch {
    return null;
  }
}

function Input({ inProgress, onSend, isVisible }: InputProps) {
  const [val, setVal] = React.useState("");
  const { setState } = useCoAgent<any>({ name: "starterAgent" });
  const { ready, hasSerperKey } = useModelStore();
  if (!isVisible) return null;
  return (
    <div className="p-0 order-2 bg-transparent">
      <div className="mx-auto w-full">
        <div className="group relative rounded-2xl border border-border bg-background hover:border-border/80 transition-all duration-300 focus-within:border-primary/40 focus-within:shadow-lg backdrop-blur-sm mx-2 mb-3">
          {/* Input Area */}
          <div className="relative">
            <textarea
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  if (val.trim()) {
                    if (!ready || !hasSerperKey) {
                      toast.error('Please configure a model and Serper key in Settings.');
                      return;
                    }
                    setState({ plan: { mode: "direct", steps: [] } as unknown as ResearchPlanTS, error: undefined, evidence: [] });
                    onSend(val);
                    setVal("");
                  }
                }
              }}
              placeholder="Message Beenet..."
              rows={1}
              disabled={inProgress || !ready || !hasSerperKey}
              className="w-full resize-none bg-transparent border-0 outline-none py-4 px-4 text-xs md:text-sm placeholder:text-xs placeholder:text-foreground/40 text-foreground min-h-[60px] max-h-[120px] leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ 
                fieldSizing: 'content',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              } as any}
            />
            
            {/* Bottom Bar */}
            <div className="flex items-center justify-between px-4 pb-4">
              <div className="flex items-center gap-3 text-xs text-foreground/50">
                <span className="hidden sm:inline">Press ⌘ + Enter to send</span>
                <span className="sm:hidden">⌘ + Enter</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (val.trim()) {
                    if (!ready || !hasSerperKey) {
                      toast.error('Please configure a model and Serper key in Settings.');
                      return;
                    }
                    setState({ plan: { mode: "direct", steps: [] } as unknown as ResearchPlanTS, error: undefined, evidence: [] });
                    onSend(val);
                    setVal("");
                  }
                }}
                disabled={inProgress || !val.trim() || !ready || !hasSerperKey}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 text-sm font-medium shadow-lg disabled:shadow-none"
                aria-label="Send message"
              >
                {inProgress ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">
                  {inProgress ? "Sending..." : "Send"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Centered, Perplexity-style query pill for user messages
function UserMessageBubble({ message }: any) {
  const content: string =
    typeof message === "string"
      ? message
      : typeof message?.content === "string"
      ? message.content
      : typeof message?.text === "string"
      ? message.text
      : "";
  if (!content) return null;
  const length = content.trim().length;
  const sizeClass = React.useMemo(() => {
    if (length <= 48) return "text-3xl md:text-4xl font-medium leading-tight";
    if (length <= 120) return "text-2xl md:text-3xl font-medium leading-snug";
    if (length <= 260) return "text-xl md:text-2xl leading-snug";
    return "text-base md:text-lg leading-normal";
  }, [length]);
  const [expanded, setExpanded] = React.useState<boolean>(false);
  const shouldCollapse = length > 360;
  const visibleText = React.useMemo(() => {
    if (!shouldCollapse || expanded) return content;
    return content.slice(0, 360) + "…";
  }, [content, expanded, shouldCollapse]);
  return (
    <div className="w-full py-2 flex justify-center">
      <div className="w-full max-w-4xl px-2">
        <p className={`mx-auto w-full text-foreground/90 ${sizeClass}`}>{visibleText}</p>
        {shouldCollapse && (
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 text-xs rounded-md border px-2 py-1 hover:bg-accent"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </div>
  );
}



