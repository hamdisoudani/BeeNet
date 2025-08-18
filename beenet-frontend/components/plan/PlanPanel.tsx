"use client";

import { useCoAgent } from "@copilotkit/react-core";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Step = { id: string; title: string; status?: "pending" | "executing" | "completed" };

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
          {steps.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3 text-sm">
              <span className="text-foreground/90">{s.title}</span>
              <Badge
                variant={s.status === "completed" ? "secondary" : s.status === "executing" ? "default" : "outline"}
                className="shrink-0 text-[10px]"
              >
                {s.status || "pending"}
              </Badge>
            </li>
          ))}
          {steps.length === 0 && (
            <div className="text-xs text-muted-foreground">No steps.</div>
          )}
        </ol>
      </CardContent>
    </Card>
  );
}


