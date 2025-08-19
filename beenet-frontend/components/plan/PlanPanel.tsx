"use client";

import { useCoAgent } from "@copilotkit/react-core";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Step = {
  id: string;
  title: string;
  status?: "pending" | "executing" | "completed";
  results?: Array<{ title?: string | null; url?: string | null; score?: number | null }>;
  answers?: string[];
  error?: { type?: string; message?: string; codes?: string[] } | null;
};

export default function PlanPanel() {
  const { state } = useCoAgent<any>({ name: "starterAgent" });
  const plan = (state as any)?.plan;
  const steps: Step[] = Array.isArray(plan?.steps) ? plan.steps : [];

  if (!plan) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">Current plan</CardTitle>
          <div className="flex items-center gap-2">
            {plan?.summary && (
              <Badge variant="secondary" className="text-[10px]">summarized</Badge>
            )}
            {plan?.mode && (
              <Badge variant="outline" className="text-[10px]">{String(plan.mode)}</Badge>
            )}
          </div>
        </div>
        {plan?.summary && (
          <CardDescription className="text-xs">{String(plan.summary)}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {steps.map((s) => {
            const isDone = s.status === "completed";
            const hasErr = !!s.error;
            return (
              <li key={s.id} className="space-y-1">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-foreground/90">{s.title}</span>
                  <Badge
                    variant={hasErr ? "destructive" as any : isDone ? "secondary" : s.status === "executing" ? "default" : "outline"}
                    className="shrink-0 text-[10px]"
                  >
                    {hasErr ? "error" : (s.status || "pending")}
                  </Badge>
                </div>
                {hasErr ? (
                  <div className="text-xs text-red-500/90 whitespace-pre-wrap">{s.error?.message || "This step failed."}</div>
                ) : (
                  <div className="pl-4 text-xs space-y-1">
                    {Array.isArray(s.answers) && s.answers.length > 0 && (
                      <div className="text-foreground/80">Quick findings: {s.answers.slice(0, 3).join(" \n")}</div>
                    )}
                    {Array.isArray(s.results) && s.results.length > 0 && (
                      <ul className="list-disc ml-4">
                        {s.results.slice(0, 3).map((r, i) => (
                          <li key={i} className="truncate">
                            <a href={r.url || undefined} target="_blank" rel="noreferrer" className="underline">
                              {r.title || r.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {steps.length === 0 && (
            <div className="text-xs text-muted-foreground">No steps.</div>
          )}
        </ol>
      </CardContent>
    </Card>
  );
}


