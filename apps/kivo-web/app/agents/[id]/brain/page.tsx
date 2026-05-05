"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth, API_BASE } from "@/lib/auth";

interface AgentMetadata {
  personality?: string; identity?: string; longTermMemory?: string;
  avatarColor?: string; telegramStatus?: string; model?: string;
}
interface Agent {
  id: string; name: string; type: string;
  icon?: string; metadata?: AgentMetadata;
}

export default function AgentBrainPage() {
  const { token }  = useAuth();
  const params     = useParams();
  const agentId    = String(params.id);

  const [agent, setAgent]         = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);

  const [personality, setPersonality]       = useState("");
  const [identity, setIdentity]             = useState("");
  const [longTermMemory, setLongTermMemory] = useState("");

  const authHeaders = useCallback((): HeadersInit => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  useEffect(() => {
    fetch(`${API_BASE}/agents/${agentId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        const a: Agent = d.data;
        setAgent(a);
        setPersonality(a.metadata?.personality ?? "");
        setIdentity(a.metadata?.identity ?? "");
        setLongTermMemory(a.metadata?.longTermMemory ?? "");
      })
      .catch(() => toast.error("Failed to load agent."))
      .finally(() => setIsLoading(false));
  }, [agentId, authHeaders]);

  const save = async () => {
    if (!agent) return;
    setIsSaving(true);
    try {
      const r = await fetch(`${API_BASE}/agents/${agentId}`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({
          metadata: { ...(agent.metadata ?? {}), personality, identity, longTermMemory },
        }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json(); setAgent(d.data);
      toast.success("Brain updated!");
    } catch {
      toast.error("Failed to save brain.");
    } finally { setIsSaving(false); }
  };

  const FIELDS = [
    { id: "brain-personality",   label: "Personality",       hint: "Tone, communication style, and character…",        value: personality,    set: setPersonality   },
    { id: "brain-identity",      label: "Identity & Role",   hint: "The agent's role, focus area, and team position…",  value: identity,       set: setIdentity      },
    { id: "brain-memory",        label: "Long-term Memory",  hint: "Key context this agent should always remember…",    value: longTermMemory, set: setLongTermMemory },
  ];

  if (isLoading) return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;
  if (!agent) return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4">
      <Bot className="size-10 text-muted-foreground" />
      <p className="font-semibold">Agent not found</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href={`/agents/${agentId}`} id="brain-back"
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Back to {agent.name}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Agent Brain</h1>
        <p className="mt-1 text-sm text-muted-foreground">Define this agent&apos;s core personality and memory.</p>
      </div>

      <div className="flex flex-col gap-5">
        {FIELDS.map(({ id, label, hint, value, set }) => (
          <div key={id} className="rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
            <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {label}
            </label>
            <textarea
              id={id}
              rows={4}
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder={hint}
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
        ))}

        <Button id="brain-save-btn" onClick={save} disabled={isSaving} className="w-full font-semibold">
          {isSaving ? <><Loader2 className="size-4 animate-spin mr-2" />Saving…</> : <><Save className="size-4 mr-2" />Save Brain</>}
        </Button>
      </div>
    </div>
  );
}
