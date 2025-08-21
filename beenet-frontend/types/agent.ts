export type PlanStepStatus = "pending" | "searching" | "reading" | "completed";

export type SearchResultTS = {
  title?: string;
  url?: string;
  favicon?: string;
  score?: number;
};

export type PlanStepTS = {
  id: string;
  title: string;
  queries: string[];
  results: SearchResultTS[];
  status: PlanStepStatus;
  error?: { type?: string; message?: string; codes?: string[] };
};

export type ResearchPlanTS = {
  mode: "direct" | "search";
  steps: Array<PlanStepTS | string>;
  reason?: string;
  error?: { type?: string; message?: string; codes?: string[] };
};

export type AgentStateTS = {
  plan?: ResearchPlanTS | null;
  error?: { type?: string; message: string; codes?: string[] };
  evidence?: Array<{ stepId?: string; url: string; markdown: string; timestamp?: string }>;
};


