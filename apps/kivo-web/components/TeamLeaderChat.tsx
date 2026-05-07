"use client";

import React, { useState, useEffect, useRef } from "react";
import { Send, Bot, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  message: string;
}

export function TeamLeaderChat({ teamId, leaderAgent }: { teamId: string, leaderAgent?: any }) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMessage = async (overrideMsg?: string, hidden = false) => {
    const msg = overrideMsg || input.trim();
    if (!msg || !token) return;
    
    if (!overrideMsg) setInput("");
    
    if (!hidden) {
      const tempId = Math.random().toString();
      setMessages(prev => [...prev, { id: tempId, role: "user", message: msg }]);
    }
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/teams/${teamId}/leader-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message: msg })
      });
      const data = await res.json();
      if (!data.error && data.data) {
        setMessages(prev => [...prev, data.data]);
      } else {
        toast.error("Failed to send message: " + (data.error?.message || "Unknown error"));
      }
    } catch (err: any) {
      console.error(err);
      toast.error("An error occurred: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !teamId) return;

    fetch(`${API_BASE}/teams/${teamId}/leader-chat`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (!data.error && Array.isArray(data.data)) {
          if (data.data.length === 0) {
            // First time opening the chat, trigger a welcome message
            sendMessage("[SYSTEM: First interaction. Welcome the user enthusiastically!]", true);
          } else {
            setMessages(data.data);
          }
        }
      })
      .catch(console.error);
  }, [teamId, token]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  if (!leaderAgent) return null;

  return (
    <div className="flex flex-col border border-border bg-card rounded-xl shadow-sm h-[400px]">
      <div className="flex items-center justify-between p-3 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-lg">
            {leaderAgent.icon || "👑"}
          </div>
          <div>
            <p className="text-sm font-semibold">{leaderAgent.name}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Team Leader</p>
          </div>
        </div>
        <Link href={`/agents/${leaderAgent.id}`} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
          Profile <ArrowRight className="size-3" />
        </Link>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 mb-2">
              <Bot className="size-5 text-primary" />
            </div>
            <p className="text-sm font-medium">Say hi to your team leader!</p>
            <p className="text-xs text-muted-foreground max-w-[200px] mt-1">They are ready to help you onboard and connect integrations.</p>
          </div>
        ) : (
          messages.filter(m => !(m.role === "user" && m.message.startsWith("[SYSTEM:"))).map(m => (
            <div key={m.id} className={cn("flex w-max max-w-[85%] flex-col gap-2 rounded-2xl px-4 py-2.5 text-sm", m.role === "user" ? "ml-auto bg-primary text-primary-foreground rounded-br-none" : "bg-muted rounded-bl-none")}>
              {m.message}
            </div>
          ))
        )}
        {loading && (
          <div className="flex w-max max-w-[80%] flex-col gap-2 rounded-2xl px-4 py-2.5 text-sm bg-muted rounded-bl-none">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="p-3 border-t bg-muted/10">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
          <Input 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            placeholder="Ask about telegram integration..." 
            className="flex-1 text-sm h-10 rounded-full bg-background"
            disabled={loading}
            autoComplete="off"
          />
          <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-full" disabled={!input.trim() || loading}>
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
