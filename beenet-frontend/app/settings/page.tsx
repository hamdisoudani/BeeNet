"use client";

import React from "react";
import * as yup from "yup";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useModelStore, type UserModel } from "@/stores/modelStore";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

type FormValues = {
  providerType: "groq" | "openrouter" | "custom";
  baseUrl: string;
  model: string;
  apiKey: string;
  setAsDefault?: boolean;
};

const schema: yup.ObjectSchema<any> = yup.object({
  providerType: yup.mixed<"groq" | "openrouter" | "custom">().oneOf(["groq", "openrouter", "custom"]).required(),
  baseUrl: yup
    .string()
    .when("providerType", (providerType: any, schema: any) =>
      providerType === "custom"
        ? schema.url("Must be a valid URL").required("Base URL is required")
        : schema.notRequired()
    ),
  model: yup.string().min(2, "Model is required").required("Model is required"),
  apiKey: yup.string().min(10, "API key looks too short").required("API key is required"),
  setAsDefault: yup.boolean().optional(),
});

export default function SettingsPage() {
  const { models, defaultModelId, setModels, setActiveModelId, setStatus, setStatusLoading, setStatusError } = useModelStore();
  const [submitting, setSubmitting] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { providerType: "groq" },
  });

  const PREDEFINED: Record<string, string> = {
    groq: "https://api.groq.com/openai/v1",
    openrouter: "https://openrouter.ai/api/v1",
  };

  // Auto-fill baseUrl for predefined providers and lock the input
  const providerType = watch("providerType");
  React.useEffect(() => {
    if (providerType === "custom") return;
    const url = PREDEFINED[providerType] || "";
    setValue("baseUrl", url, { shouldValidate: true });
  }, [providerType, setValue]);

  const onSave = handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      // Backend performs test + creation in one upsert call; it will return safe models and default id
      const base = values.providerType === "custom" ? values.baseUrl : PREDEFINED[values.providerType];
      const res = await fetch('/api/secrets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ models: [{ baseUrl: base, apiKey: values.apiKey, model: values.model }], setDefaultForNew: !!values.setAsDefault }), credentials: 'include' });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        const reason = mapBackendError(msg?.message) || `Save failed (${res.status})`;
        throw new Error(reason);
      }
      const payload = await res.json().catch(() => ({}));
      if (payload && payload.ok === false) {
        const reason = mapBackendError(payload?.message) || 'Model validation failed';
        throw new Error(reason);
      }
      const safeModels: UserModel[] = Array.isArray(payload?.models) ? (payload.models as UserModel[]) : [];
      const nextDefault: string | undefined = typeof payload?.defaultModelId === 'string' ? payload.defaultModelId : defaultModelId;
      setModels(
        [
          ...models,
          ...safeModels.filter((m: UserModel) => !models.find((x: UserModel) => x.id === m.id)),
        ],
        nextDefault
      );
      reset();
      toast.success("Model saved and tested successfully");
      setOpen(false);
      // Refresh global secrets status so banners/UI update immediately
      try {
        setStatusLoading(true); setStatusError(false);
        const rs = await fetch('/api/secrets/status', { method: 'GET', credentials: 'include', cache: 'no-store' });
        const dj = await rs.json().catch(() => ({}));
        if (rs.ok) setStatus(Boolean(dj?.hasModel), Boolean(dj?.hasTavilyKey)); else setStatusError(true);
      } catch { setStatusError(true); }
      finally { setStatusLoading(false); }
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSubmitting(false);
    }
  });

  // Hydrate models from backend on mount
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/secrets', { method: 'GET', credentials: 'include', cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const safe: UserModel[] = Array.isArray(data?.models) ? data.models : [];
        const defId: string | undefined = typeof data?.defaultModelId === 'string' ? data.defaultModelId : undefined;
        if (mounted) setModels(safe, defId);
      } catch {}
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [setModels]);

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Models</h1>
        <Dialog open={open} onOpenChange={(v) => !loading && setOpen(v)}>
          <DialogTrigger asChild>
            <button className="rounded-md bg-foreground text-background px-3 py-2 text-sm disabled:opacity-50" disabled={loading}>
              {loading ? 'Loading…' : 'Add model'}
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a model</DialogTitle>
              <DialogDescription>We will test the credentials before saving.</DialogDescription>
            </DialogHeader>
            <form className="space-y-3" onSubmit={onSave} autoComplete="off">
              <div>
                <label className="text-sm">Provider</label>
                <div className="flex gap-2 mt-1">
                  {(["groq", "openrouter", "custom"] as const).map((opt) => (
                    <label key={opt} className="inline-flex items-center gap-1 text-sm border rounded-md px-2 py-1">
                      <input type="radio" value={opt} {...register("providerType")} /> {opt}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm">Model</label>
                <input className="w-full rounded-md border px-3 py-2" placeholder="e.g. hf:Qwen/Qwen2.5-7B-Instruct" {...register("model")} autoComplete="off" autoCorrect="off" spellCheck={false} />
                {errors.model && <p className="text-xs text-red-500 mt-1">{errors.model.message}</p>}
              </div>
              <div>
                <label className="text-sm">Base URL</label>
                <input className="w-full rounded-md border px-3 py-2 disabled:opacity-60" placeholder="https://api.example.com/v1" {...register("baseUrl")} disabled={providerType !== 'custom'} autoComplete="off" autoCorrect="off" spellCheck={false} />
                {errors.baseUrl && <p className="text-xs text-red-500 mt-1">{errors.baseUrl.message}</p>}
              </div>
              <div>
                <label className="text-sm">API Key</label>
                <input className="w-full rounded-md border px-3 py-2" type="password" {...register("apiKey")} autoComplete="off" autoCorrect="off" spellCheck={false} />
                {errors.apiKey && <p className="text-xs text-red-500 mt-1">{errors.apiKey.message}</p>}
              </div>
              {models.length > 0 && (
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" {...register("setAsDefault")} /> Set as default
                </label>
              )}
              <div className="flex items-center gap-2">
                <button type="submit" disabled={submitting} className="rounded-md bg-foreground text-background px-3 py-2 text-sm disabled:opacity-50">{submitting ? "Saving…" : "Save"}</button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div>
        <h2 className="text-sm font-medium mb-2">Your models</h2>
        <div className="rounded-md border">
          <ScrollArea className="h-80">
            {loading ? (
              <ul className="space-y-2 p-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <li key={i} className="rounded-md border px-3 py-2">
                    <div className="animate-pulse space-y-2">
                      <div className="h-4 bg-muted rounded w-1/3" />
                      <div className="h-3 bg-muted rounded w-2/3" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : models.length === 0 ? (
              <div className="text-sm text-muted-foreground p-6 text-center">No models yet. Click “Add model” to create one to use the BeeNet agent.</div>
            ) : (
              <ul className="space-y-2 p-2">
                {models.map((m: UserModel) => {
                  const isDefault = defaultModelId === m.id;
                  return (
                    <li
                      key={m.id}
                      className="rounded-md border px-3 py-2 text-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="font-medium flex flex-wrap items-center gap-2">
                          <span className="break-words whitespace-normal">{m.name}</span>
                          {isDefault && (
                            <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] leading-none">Default</span>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs whitespace-normal break-words">
                          {m.provider || "custom"} · {m.model} · {m.baseUrl}
                        </div>
                      </div>
                      <div className="sm:ml-4 flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-md border px-2 py-1 text-xs disabled:opacity-50 w-full sm:w-auto"
                          disabled={isDefault || updatingId === m.id}
                          onClick={async () => {
                            try {
                              setUpdatingId(m.id);
                              const res = await fetch('/api/secrets/default', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({ id: m.id }),
                              });
                              const payload = await res.json().catch(() => ({}));
                              if (!res.ok || payload?.ok === false) {
                                const code = payload?.message || `update_failed_${res.status}`;
                                throw new Error(mapBackendError(code) || 'Failed to set default');
                              }
                              // Re-fetch secrets to hydrate store from backend truth
                              const r2 = await fetch('/api/secrets', { method: 'GET', credentials: 'include', cache: 'no-store' });
                              const data = await r2.json().catch(() => ({}));
                              const safe: UserModel[] = Array.isArray(data?.models) ? data.models : [];
                              const defId: string | undefined = typeof data?.defaultModelId === 'string' ? data.defaultModelId : undefined;
                              setModels(safe, defId);
                              toast.success('Default model updated');
                            } catch (e: any) {
                              toast.error(e?.message || 'Failed to set default');
                            } finally {
                              setUpdatingId(null);
                            }
                          }}
                        >
                          {isDefault ? 'Using' : (updatingId === m.id ? 'Setting…' : 'Use')}
                        </button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                              disabled={isDefault && models.length > 1}
                              onClick={async () => {
                                try {
                                  setUpdatingId(m.id);
                                  // If multiple models and this is default, block delete in UI (guarded server-side too)
                                  if (isDefault && models.length > 1) return;
                                  const res = await fetch('/api/secrets', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'include',
                                    body: JSON.stringify({ _path: '/model/delete', id: m.id }),
                                  });
                                  const payload = await res.json().catch(() => ({}));
                                  if (!res.ok || payload?.ok === false) {
                                    const code = payload?.message || `delete_failed_${res.status}`;
                                    throw new Error(mapBackendError(code) || 'Failed to delete model');
                                  }
                                  // Re-fetch secrets to hydrate from backend truth
                                  const r2 = await fetch('/api/secrets', { method: 'GET', credentials: 'include', cache: 'no-store' });
                                  const data = await r2.json().catch(() => ({}));
                                  const safe: UserModel[] = Array.isArray(data?.models) ? data.models : [];
                                  const defId: string | undefined = typeof data?.defaultModelId === 'string' ? data.defaultModelId : undefined;
                                  setModels(safe, defId);
                                  toast.success('Model deleted');
                                } catch (e: any) {
                                  const msg = String(e?.message || 'Failed to delete model');
                                  toast.error(msg);
                                } finally {
                                  setUpdatingId(null);
                                }
                              }}
                            >
                              <span className="inline-flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Delete</span>
                            </button>
                          </TooltipTrigger>
                          {isDefault && models.length > 1 && (
                            <TooltipContent>Set another default model to delete this one.</TooltipContent>
                          )}
                        </Tooltip>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </div>
      </div>

      <div className="border-t pt-6">
        <TavilySection />
      </div>
    </div>
  );
}

function mapBackendError(code?: string): string | undefined {
  switch (code) {
    case 'server_encryption_error':
      return 'Server encryption failed. Please ensure DATA_KEY is configured and try again.';
    case 'unknown_error':
      return 'Unexpected server error while saving the model.';
    case 'missing_fields':
      return 'Please provide base URL, model, and API key.';
    case 'model_validation_failed':
      return 'We could not verify this model with the provided credentials.';
    case 'provider_error_400':
      return 'Provider rejected the request. Check model name and parameters.';
    case 'provider_error_401':
    case 'provider_error_403':
      return 'Unauthorized: please check that your API key is correct and has access.';
    case 'provider_error_404':
      return 'Model not found at this provider. Double-check the model name.';
    case 'provider_error_429':
      return 'Rate limited by provider. Please try again later.';
    case 'provider_error_500':
      return 'Provider had an internal error. Try again later.';
    case 'invalid_response':
      return 'Provider returned an unexpected response.';
    case 'network_error':
      return 'Network error while contacting the provider. Check the base URL or your connection.';
    default:
      return undefined;
  }
}

function TavilySection() {
  const [apiKey, setApiKey] = React.useState("");
  const [hasKey, setHasKey] = React.useState<boolean>(false);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [saving, setSaving] = React.useState<boolean>(false);
  const { setStatus, setStatusLoading, setStatusError } = useModelStore();
  const [editing, setEditing] = React.useState<boolean>(false);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/secrets', { method: 'GET', credentials: 'include', cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        setHasKey(Boolean(data?.hasTavilyKey));
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  const onSave = async () => {
    const key = apiKey.trim();
    if (!key) { toast.error('Enter an API key'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/secrets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ apiKey: key }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        const msg = mapTavilyError(data?.message) || `Save failed (${res.status})`;
        throw new Error(msg);
      }
      setHasKey(true);
      setApiKey("");
      toast.success('Tavily key validated and saved');
      // Refresh global secrets status so banners/UI update immediately
      try {
        setStatusLoading(true); setStatusError(false);
        const rs = await fetch('/api/secrets/status', { method: 'GET', credentials: 'include', cache: 'no-store' });
        const dj = await rs.json().catch(() => ({}));
        if (rs.ok) setStatus(Boolean(dj?.hasModel), Boolean(dj?.hasTavilyKey)); else setStatusError(true);
      } catch { setStatusError(true); }
      finally { setStatusLoading(false); }
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async () => {
    setSaving(true);
    try {
      const r2 = await fetch('/api/secrets/tavily/remove', { method: 'POST', credentials: 'include' });
      const d2 = await r2.json().catch(() => ({}));
      if (!r2.ok || d2?.ok === false) throw new Error('Failed to remove');
      setHasKey(false);
      toast.success('Tavily key removed');
      // Refresh global secrets status so banners/UI update immediately
      try {
        setStatusLoading(true); setStatusError(false);
        const rs = await fetch('/api/secrets/status', { method: 'GET', credentials: 'include', cache: 'no-store' });
        const dj = await rs.json().catch(() => ({}));
        if (rs.ok) setStatus(Boolean(dj?.hasModel), Boolean(dj?.hasTavilyKey)); else setStatusError(true);
      } catch { setStatusError(true); }
      finally { setStatusLoading(false); }
    } catch (e: any) {
      toast.error(e?.message || 'Remove failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-medium">Tavily</h2>
        <div className="space-y-2 max-w-lg">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium">Tavily</h2>
      <p className="text-xs text-muted-foreground">Provide your Tavily API key to enable web search. We will validate it before saving.</p>
      {!loading && hasKey && !editing && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-emerald-500">Configured</span>
          <button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={() => setEditing(true)}>Update</button>
          <button type="button" onClick={onRemove} disabled={saving} className="rounded-md border px-2 py-1 text-xs inline-flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
        </div>
      )}
      {(!hasKey || editing) && (
        <div className="flex gap-2 items-end max-w-lg">
          <div className="flex-1">
            <label className="text-sm">API Key</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              type="password"
              placeholder="tvly-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onSave} disabled={saving || !apiKey.trim()} className="rounded-md bg-foreground text-background px-3 py-2 text-sm disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            {editing && <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </div>
      )}
      {(!hasKey || editing) && (
        <div className="text-xs text-muted-foreground">Status: {hasKey ? 'Configured' : 'Not configured'}</div>
      )}
    </div>
  );
}

function mapTavilyError(code?: string): string | undefined {
  switch (code) {
    case 'unauthorized':
      return 'Unauthorized: please check that your Tavily key is correct.';
    case 'provider_error_400':
    case 'provider_error_403':
      return 'Tavily rejected the request.';
    case 'provider_error_429':
      return 'Tavily rate limited this request. Try again later.';
    case 'network_error':
      return 'Network error while contacting Tavily.';
    default:
      return undefined;
  }
}
