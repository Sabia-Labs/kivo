"use client";

import { useState } from "react";
import { ChevronDown, Check, Cpu } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Available models ──────────────────────────────────────────────────────────

export interface ModelOption {
  provider: string;
  model: string;
  label: string;
  badge: string;
  color: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { provider: "auto",      model: "auto",              label: "Auto Route",          badge: "Smart",     color: "violet" },
  { provider: "openai",    model: "gpt-4o",            label: "GPT-4o",             badge: "OpenAI",    color: "emerald" },
  { provider: "openai",    model: "gpt-4o-mini",       label: "GPT-4o mini",        badge: "OpenAI",    color: "emerald" },
  { provider: "openai",    model: "o3",                label: "o3",                 badge: "OpenAI",    color: "emerald" },
  { provider: "google",    model: "gemini-2.0-flash",  label: "Gemini 2.0 Flash",   badge: "Google",    color: "blue" },
  { provider: "google",    model: "gemini-2.5-pro",    label: "Gemini 2.5 Pro",     badge: "Google",    color: "blue" },
  { provider: "anthropic", model: "claude-3-7-sonnet", label: "Claude 3.7 Sonnet",  badge: "Anthropic", color: "amber" },
  { provider: "anthropic", model: "claude-3-5-haiku",  label: "Claude 3.5 Haiku",   badge: "Anthropic", color: "amber" },
];

const badgeColors: Record<string, string> = {
  violet:  "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  blue:    "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  amber:   "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface ModelSelectorProps {
  currentModel?: string;
  onSave: (model: string, provider: string) => Promise<void>;
  t: {
    title: string;
    change: string;
    cancel: string;
    save: string;
    saved: string;
  };
}

/**
 * ModelSelector — inline pill that shows the current model and opens a dropdown
 * to switch to another from the curated list.
 */
export function ModelSelector({ currentModel, onSave, t }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ModelOption | null>(
    AVAILABLE_MODELS.find((m) => m.model === currentModel) ?? null
  );
  const [isSaving, setIsSaving] = useState(false);

  const current = selected ?? AVAILABLE_MODELS[0];

  const handleSelect = (opt: ModelOption) => {
    setSelected(opt);
    setOpen(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(current.model, current.provider);
      toast.success(t.saved);
    } catch {
      toast.error("Failed to update model.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Current model pill */}
      <button
        id="model-selector-toggle"
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-1.5 text-sm font-medium transition-all",
          "hover:border-primary/40 hover:bg-muted",
          open && "border-primary/40 bg-muted"
        )}
      >
        <Cpu className="size-3.5 text-muted-foreground" />
        <span className="text-foreground">{current.label}</span>
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", badgeColors[current.color])}>
          {current.badge}
        </span>
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {/* Save button — shown when selection differs from persisted model */}
      {selected && selected.model !== currentModel && (
        <button
          id="model-selector-save"
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isSaving ? "…" : t.save}
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-40 mt-1 w-64 rounded-2xl border border-border bg-card shadow-xl ring-1 ring-black/5"
          style={{ top: "100%" }}
        >
          <div className="p-1.5">
            {/* Auto Route separator */}
            <div className="mb-1">
              {AVAILABLE_MODELS.filter((o) => o.provider === "auto").map((opt) => (
                <button
                  key={opt.model}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-muted",
                    current.model === opt.model && "bg-primary/5"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", badgeColors[opt.color])}>
                      {opt.badge}
                    </span>
                    <div>
                      <span className="font-medium text-foreground">{opt.label}</span>
                      <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Picks the best model for each task</p>
                    </div>
                  </div>
                  {current.model === opt.model && <Check className="size-3.5 text-primary" />}
                </button>
              ))}
            </div>
            <div className="mb-1.5 h-px bg-border" />
            {AVAILABLE_MODELS.filter((o) => o.provider !== "auto").map((opt) => (
              <button
                key={opt.model}
                type="button"
                onClick={() => handleSelect(opt)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-muted",
                  current.model === opt.model && "bg-primary/5"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", badgeColors[opt.color])}>
                    {opt.badge}
                  </span>
                  <span className="font-medium text-foreground">{opt.label}</span>
                </div>
                {current.model === opt.model && <Check className="size-3.5 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
