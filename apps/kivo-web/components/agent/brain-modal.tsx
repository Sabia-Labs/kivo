"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, X, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BrainFields {
  personality?: string;
  identity?: string;
  longTermMemory?: string;
}

interface BrainModalProps {
  agentName: string;
  fields: BrainFields;
  onSave: (fields: BrainFields) => Promise<void>;
  onClose: () => void;
  t: {
    title: string;
    subtitle: string;
    personality: string;
    personalityPlaceholder: string;
    identity: string;
    identityPlaceholder: string;
    longTermMemory: string;
    longTermMemoryPlaceholder: string;
    save: string;
    saving: string;
    saved: string;
  };
}

/**
 * BrainModal — editable panel for Personality, Identity & Role, and Long-term Memory.
 * Renders as a slide-in panel from the right side.
 */
export function BrainModal({ agentName, fields, onSave, onClose, t }: BrainModalProps) {
  const [personality, setPersonality] = useState(fields.personality ?? "");
  const [identity, setIdentity] = useState(fields.identity ?? "");
  const [longTermMemory, setLongTermMemory] = useState(fields.longTermMemory ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ personality, identity, longTermMemory });
      toast.success(t.saved);
      onClose();
    } catch {
      toast.error("Failed to save brain fields.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-background shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
              <Brain className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">{t.title}</h2>
              <p className="text-xs text-muted-foreground">{agentName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="px-6 pt-4 text-sm text-muted-foreground">{t.subtitle}</p>

        {/* Fields */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
          <BrainField
            label={t.personality}
            placeholder={t.personalityPlaceholder}
            value={personality}
            onChange={setPersonality}
            accent="violet"
          />
          <BrainField
            label={t.identity}
            placeholder={t.identityPlaceholder}
            value={identity}
            onChange={setIdentity}
            accent="cyan"
          />
          <BrainField
            label={t.longTermMemory}
            placeholder={t.longTermMemoryPlaceholder}
            value={longTermMemory}
            onChange={setLongTermMemory}
            accent="emerald"
          />
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4">
          <Button
            id="brain-save-btn"
            className="w-full gap-2"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t.saving}
              </>
            ) : (
              <>
                <Check className="size-4" />
                {t.save}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-component: BrainField ─────────────────────────────────────────────────

type AccentColor = "violet" | "cyan" | "emerald";

const accentStyles: Record<AccentColor, string> = {
  violet: "border-violet-400/40 focus:border-violet-400 focus:ring-violet-400/20",
  cyan: "border-cyan-400/40 focus:border-cyan-400 focus:ring-cyan-400/20",
  emerald: "border-emerald-400/40 focus:border-emerald-400 focus:ring-emerald-400/20",
};

const accentLabelStyles: Record<AccentColor, string> = {
  violet: "text-violet-600 dark:text-violet-400",
  cyan: "text-cyan-600 dark:text-cyan-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
};

interface BrainFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  accent: AccentColor;
}

function BrainField({ label, placeholder, value, onChange, accent }: BrainFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className={cn("text-xs font-semibold uppercase tracking-wide", accentLabelStyles[accent])}>
        {label}
      </label>
      <textarea
        className={cn(
          "min-h-[120px] w-full resize-none rounded-xl border bg-muted/30 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 transition-all",
          accentStyles[accent]
        )}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
