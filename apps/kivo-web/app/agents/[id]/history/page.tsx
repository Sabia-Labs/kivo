"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot, Loader2, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth, API_BASE } from "@/lib/auth";

import { cn } from "@/lib/utils";

interface Conversation {
  id: string; agentId: string;
  counterpartType: string; counterpartName: string;
  createdAt: string; updatedAt: string;
}

interface ChatMessage {
  id: string; role: "user" | "assistant";
  content: string; createdAt: string;
}

export default function AgentHistoryPage() {
  const { token }  = useAuth();
  const params     = useParams();
  const agentId    = String(params.id);

  const [agentName, setAgentName]         = useState("Agent");
  const [agentColor, setAgentColor]       = useState("#6366f1");
  const [agentIcon, setAgentIcon]         = useState("🤖");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading]         = useState(true);

  const [selectedConv, setSelectedConv]   = useState<Conversation | null>(null);
  const [messages, setMessages]           = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const authHeaders = useCallback((): HeadersInit => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/agents/${agentId}`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API_BASE}/conversations?agentId=${agentId}`, { headers: authHeaders() }).then((r) => r.json()),
    ])
      .then(([agentData, convData]) => {
        setAgentName(agentData.data?.name ?? "Agent");
        setAgentColor(agentData.data?.metadata?.avatarColor ?? "#6366f1");
        setAgentIcon(agentData.data?.icon ?? "🤖");
        setConversations(convData.data ?? []);
      })
      .catch(() => toast.error("Failed to load history."))
      .finally(() => setIsLoading(false));
  }, [agentId, authHeaders]);

  const loadConversation = async (conv: Conversation) => {
    setSelectedConv(conv);
    setIsLoadingMessages(true);
    setMessages([]);
    try {
      const res = await fetch(`${API_BASE}/conversations/${conv.id}/messages`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setMessages(d.data || []);
    } catch {
      toast.error("Failed to load messages.");
    } finally {
      setIsLoadingMessages(false);
      // Give DOM time to render before scrolling
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  const renderMessages = () => {
    let lastDate = "";
    const els: React.ReactNode[] = [];

    messages.forEach((m) => {
      const d = new Date(m.createdAt);
      const dateStr = d.toLocaleDateString();
      if (dateStr !== lastDate) {
        let label = dateStr;
        const today = new Date();
        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        if (dateStr === today.toLocaleDateString()) label = "Hoje";
        else if (dateStr === yesterday.toLocaleDateString()) label = "Ontem";
        els.push(
          <div key={`date-${dateStr}`} className="flex justify-center my-3">
            <span className="rounded-full bg-muted/60 px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </span>
          </div>
        );
        lastDate = dateStr;
      }
      const isUser = m.role === "user";
      els.push(
        <div key={m.id} className={cn("flex items-end gap-2", isUser && "flex-row-reverse mb-3", !isUser && "mb-3")}>
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
            style={isUser ? { background: "#6366f1", color: "#fff" } : { background: agentColor + "22" }}>
            {isUser ? "U" : agentIcon}
          </div>
          <div className={cn("max-w-[78%] flex flex-col gap-0.5", isUser && "items-end")}>
            <span className="px-1 text-[10px] text-muted-foreground">{isUser ? "You" : agentName}</span>
            <div className={cn("rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
              isUser ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm")}>
              {m.content}
            </div>
            <span className="px-1 text-[9px] text-muted-foreground/60">
              {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      );
    });
    return els;
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href={`/agents/${agentId}`} id="history-back"
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Back to {agentName}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Conversation History</h1>
        <p className="mt-1 text-sm text-muted-foreground">All past conversations with {agentName}.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-muted/20 py-20 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
            <Bot className="size-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No conversations yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* History List */}
          <div className={cn("flex flex-col gap-3", selectedConv && "hidden lg:flex")}>
            {conversations.map((conv) => (
              <button key={conv.id} onClick={() => loadConversation(conv)}
                className={cn("flex items-center gap-4 rounded-2xl border px-5 py-4 shadow-sm text-left transition-colors",
                  selectedConv?.id === conv.id ? "bg-muted border-primary/40 ring-1 ring-primary/20" : "bg-card border-border hover:border-primary/30")}>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <MessageSquare className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{conv.counterpartName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(conv.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Messages Detail View */}
          {selectedConv && (
            <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-border bg-card shadow-sm flex flex-col h-[650px]">
              {/* Header */}
              <div className="border-b border-border px-5 py-3.5 flex items-center justify-between shadow-sm z-10 bg-card">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <MessageSquare className="size-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{selectedConv.counterpartName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(selectedConv.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                <button title="Close details" onClick={() => setSelectedConv(null)}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <X className="size-4" />
                </button>
              </div>

              {/* Message List */}
              <div className="flex-1 overflow-y-auto px-4 py-5 bg-card">
                {isLoadingMessages ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                    <MessageSquare className="size-8 opacity-20 mb-2" />
                    <p className="text-sm">No messages recovered directly to this conversation.</p>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {renderMessages()}
                    <div ref={bottomRef} className="h-1" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
