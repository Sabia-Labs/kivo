"use client";

import { useEffect, useState } from "react";
import { History, X, ExternalLink, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE, useAuth } from "@/lib/auth";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  agentId: string;
  counterpartType: "human" | "agent" | "external";
  counterpartId?: string;
  counterpartName: string;
  createdAt: string;
  updatedAt: string;
}

interface ConversationHistoryProps {
  agentId: string;
  /** Called when user clicks a conversation to open it in the chat */
  onSelectConversation: (conv: Conversation) => void;
  onClose: () => void;
  t: {
    title: string;
    empty: string;
    from: string;
    viewAgent: string;
  };
}

/**
 * ConversationHistory — side drawer listing all past conversations for an agent.
 */
export function ConversationHistory({
  agentId,
  onSelectConversation,
  onClose,
  t,
}: ConversationHistoryProps) {
  const { token } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const headers: HeadersInit = {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const res = await fetch(`${API_BASE}/conversations?agentId=${agentId}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setConversations(data.data ?? []);
        }
      } catch {
        toast.error("Failed to load conversation history.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [agentId, token]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 flex h-full w-full max-w-sm flex-col bg-background shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
              <History className="size-5 text-primary" />
            </div>
            <h2 className="text-base font-semibold text-foreground">{t.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-3 p-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
                <MessageSquare className="size-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{t.empty}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 p-3">
              {conversations.map((conv) => (
                <ConversationEntry
                  key={conv.id}
                  conv={conv}
                  onSelect={() => {
                    onSelectConversation(conv);
                    onClose();
                  }}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-component: ConversationEntry ─────────────────────────────────────────

interface ConversationEntryProps {
  conv: Conversation;
  onSelect: () => void;
  t: ConversationHistoryProps["t"];
}

function ConversationEntry({ conv, onSelect, t }: ConversationEntryProps) {
  const timeLabel = formatRelativeTime(conv.updatedAt);
  const isAgent = conv.counterpartType === "agent";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex w-full flex-col rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted/60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Counterpart type badge */}
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              conv.counterpartType === "human" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
              conv.counterpartType === "agent" && "bg-violet-500/10 text-violet-600 dark:text-violet-400",
              conv.counterpartType === "external" && "bg-orange-500/10 text-orange-600 dark:text-orange-400"
            )}
          >
            {conv.counterpartType}
          </span>
          <span className="text-xs text-muted-foreground">{t.from}</span>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">{timeLabel}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="truncate text-sm font-medium text-foreground">{conv.counterpartName}</span>
        {isAgent && conv.counterpartId && (
          <a
            href={`/agents/${conv.counterpartId}`}
            onClick={(e) => e.stopPropagation()}
            title={t.viewAgent}
            className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary"
          >
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </button>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
