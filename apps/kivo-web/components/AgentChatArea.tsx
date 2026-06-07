"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Send, Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { useTranslation } from "@/lib/i18n";

export function AgentChatArea({ 
  agentId, 
  agentName, 
  agentIcon, 
  agentColor, 
  userName, 
  token, 
  newChatTrigger 
}: any) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conv, setConv] = useState<any>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const headers = useCallback((): HeadersInit => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  useEffect(() => {
    setIsInitializing(false);
  }, []);

  useEffect(() => {
    if (newChatTrigger > 0) {
      setConv(null);
      setMessages([]);
    }
  }, [newChatTrigger]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput(""); setSending(true);
    const tempId = `u-${Date.now()}`;
    let messageIdInState = tempId;
    
    setMessages(p => [...p, { id: tempId, role: "user", content: text, createdAt: new Date().toISOString(), status: "sending" }]);

    try {
      let cid = conv?.id;
      if (!cid) {
        const r = await fetch(`${API_BASE}/conversations`, {
          method: "POST", headers: headers(),
          body: JSON.stringify({ agentId, counterpartType: "human", counterpartName: userName }),
        });
        if (!r.ok) throw new Error();
        const nc = (await r.json()).data;
        setConv(nc); cid = nc.id;
      }
      
      const res = await fetch(`${API_BASE}/conversations/${cid}/messages`, { method: "POST", headers: headers(), body: JSON.stringify({ role: "user", content: text }) });
      const resultObj = await res.json().catch(() => ({}));
      
      const serverId = resultObj.data?.userMessage?.id;
      if (serverId && serverId !== messageIdInState) {
        setMessages(p => p.map(m => m.id === messageIdInState ? { ...m, id: serverId } : m));
        messageIdInState = serverId;
      }

      if (!res.ok || resultObj.data?.error) {
        setMessages(p => p.map(m => m.id === messageIdInState ? { ...m, status: "error" } : m));
        toast.error("Failed to send message: " + (resultObj.error || "Unknown error"));
        setSending(false);
        return;
      }

      setMessages(p => p.map(m => m.id === messageIdInState ? { ...m, status: "sent" } : m));

      if (resultObj.data?.agentMessage) {
        setMessages(p => [...p, {
          id: resultObj.data.agentMessage.id || `a-${Date.now()}`,
          role: "assistant",
          content: resultObj.data.agentMessage.content,
          createdAt: resultObj.data.agentMessage.createdAt || new Date().toISOString()
        }]);
      }
    } catch (err: any) {
      setMessages(p => p.map(m => m.id === messageIdInState ? { ...m, status: "error" } : m));
    } finally {
      setSending(false);
    }
  };

  // ── Polling ────────────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (cid: string) => {
    try {
      const res = await fetch(`${API_BASE}/conversations/${cid}/messages`, { headers: headers() });
      if (res.ok) {
        const d = await res.json();
        const newMsgs = d.data || [];
        setMessages(prev => {
          // Only update if there are more messages or if content is different
          if (newMsgs.length > prev.length) return newMsgs;
          // Also check for status updates from 'sending' to 'sent'
          const hasChanges = newMsgs.some((m: any, i: number) => prev[i] && m.id !== prev[i].id);
          if (hasChanges) return newMsgs;
          return prev;
        });
      }
    } catch (err) {
      console.error("[AgentChatArea] Polling failed:", err);
    }
  }, [headers]);

  useEffect(() => {
    if (!conv?.id || sending) return;
    const interval = setInterval(() => fetchMessages(conv.id), 3000);
    return () => clearInterval(interval);
  }, [conv?.id, sending, fetchMessages]);

  useEffect(() => {
    if (!token || !agentId || conv?.id) return;
    // Initial fetch to find if there's an existing conversation
    fetch(`${API_BASE}/conversations?agentId=${agentId}`, { headers: headers() })
      .then(res => res.json())
      .then(d => {
        const existing = (d.data || []).find((c: any) => c.counterpartName === userName);
        if (existing) {
          setConv(existing);
          fetchMessages(existing.id);
        }
      })
      .catch(() => {});
  }, [agentId, token, userName, conv?.id, headers, fetchMessages]);

  const isThinking = sending || (messages.length > 0 && messages[messages.length - 1].role === "user");

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-background overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {isInitializing ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 select-none opacity-50">
            <Bot className="size-8 text-muted-foreground" />
            <p className="text-xs">{t.agentPage.chat.emptyTitle}...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map(m => (
              <div key={m.id} className={cn("flex items-end gap-2", m.role === "user" ? "flex-row-reverse" : "")}>
                {m.role !== "user" && (
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs" style={{ background: agentColor + "22" }}>
                    {agentIcon}
                  </div>
                )}
                <div className={cn("px-4 py-2.5 rounded-2xl max-w-[80%] text-sm", 
                  m.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm",
                  m.status === "error" && "bg-destructive/10 text-destructive-foreground"
                )}>
                  {m.role !== "user" ? (
                    <Markdown content={m.content} />
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
            {isThinking && (
               <div className="flex items-end gap-2">
                 <div className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs" style={{ background: agentColor + "22" }}>{agentIcon}</div>
                 <div className="px-4 py-2.5 rounded-2xl rounded-bl-sm bg-muted flex items-center gap-1.5">
                   <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                   <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                   <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                 </div>
               </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="p-3 border-t bg-muted/10 shrink-0">
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.agentPage.chat.placeholder} className="bg-background shadow-sm h-10" disabled={sending} />
          <Button type="submit" size="icon" disabled={!input.trim() || sending} className="h-10 w-10 shrink-0">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
