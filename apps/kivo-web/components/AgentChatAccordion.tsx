"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronDown, Crown, Bot, ArrowRight, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AgentChatArea } from "@/components/AgentChatArea";
import { TeamLeaderChat } from "@/components/TeamLeaderChat"; // We'll adapt it or just use its internals
import { useAuth } from "@/lib/auth";

function computeHealth(k8sStatus?: string): "online" | "offline" | "starting" {
  if (k8sStatus === "running") return "online";
  if (k8sStatus === "failed" || k8sStatus === "terminated") return "offline";
  return "starting";
}

// Inner component for Team Leader so we don't repeat the header
import { useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { API_BASE } from "@/lib/auth";
import { toast } from "sonner";

function TeamLeaderChatArea({ teamId, token, newChatTrigger }: { teamId: string, token: string, newChatTrigger: number }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [lastTrigger, setLastTrigger] = useState(newChatTrigger);

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
    if (newChatTrigger > lastTrigger) {
      setLastTrigger(newChatTrigger);
      setMessages([]);
    }
  }, [newChatTrigger, lastTrigger]);

  useEffect(() => {
    if (!token || !teamId) return;
    fetch(`${API_BASE}/teams/${teamId}/leader-chat`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (!data.error && Array.isArray(data.data)) {
          setMessages(data.data);
        }
      })
      .catch(console.error);
  }, [teamId, token]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-background overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-6" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center opacity-50 select-none">
            <Bot className="size-8 text-muted-foreground mb-2" />
            <p className="text-xs">Say hi to your team leader!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.filter(m => !(m.role === "user" && m.message.startsWith("[SYSTEM:"))).map(m => (
              <div key={m.id} className={cn("flex items-end gap-2", m.role === "user" ? "flex-row-reverse" : "")}>
                <div className={cn("px-4 py-2.5 rounded-2xl max-w-[80%] text-sm", 
                  m.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"
                )}>
                  {m.message}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-end gap-2">
                <div className="px-4 py-2.5 rounded-2xl rounded-bl-sm bg-muted flex items-center gap-1.5">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-3 border-t bg-muted/10 shrink-0">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
          <Input 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            placeholder="Ask your team leader..." 
            className="flex-1 text-sm h-10 bg-background"
            disabled={loading}
            autoComplete="off"
          />
          <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!input.trim() || loading}>
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

export function AgentChatAccordion({ agents, teamId }: { agents: any[], teamId: string }) {
  const { token, user } = useAuth();
  const [openAgentId, setOpenAgentId] = useState<string | null>(agents.length > 0 ? agents[0].id : null);
  const [newChatTriggers, setNewChatTriggers] = useState<Record<string, number>>({});

  const handleNewChat = (e: React.MouseEvent, agentId: string) => {
    e.stopPropagation();
    setNewChatTriggers(prev => ({ ...prev, [agentId]: (prev[agentId] || 0) + 1 }));
    if (openAgentId !== agentId) {
      setOpenAgentId(agentId);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {agents.map((agent) => {
        const isOpen = openAgentId === agent.id;
        const health = computeHealth(agent.k8sStatus);
        const newChatTrigger = newChatTriggers[agent.id] || 0;
        const isLeader = agent.isLeader;
        
        return (
          <div key={agent.id} className="rounded-xl border bg-card overflow-hidden shadow-sm transition-all">
            <div 
              className={cn(
                "flex items-center justify-between p-3 cursor-pointer select-none transition-colors hover:bg-muted/30",
                isOpen && "bg-muted/20 border-b"
              )}
              onClick={() => setOpenAgentId(isOpen ? null : agent.id)}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="flex size-10 items-center justify-center rounded-full bg-muted text-lg">
                    {agent.icon || "🤖"}
                  </div>
                  <span className={cn(
                    "absolute bottom-0 right-0 size-2.5 rounded-full ring-2 ring-card",
                    health === "online" ? "bg-emerald-500" : health === "starting" ? "bg-amber-500 animate-pulse" : "bg-red-500"
                  )} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold">{agent.name}</p>
                    {isLeader && <Crown className="size-3 text-amber-500" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                    {(agent.roleId || "agent").replace(/-/g, " ")}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={(e) => handleNewChat(e, agent.id)}
                >
                  <RefreshCcw className="size-3.5 mr-1.5" />
                  New Chat
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 text-xs text-muted-foreground hover:text-foreground" 
                  asChild
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link href={`/agents/${agent.id}`}>
                    Profile <ArrowRight className="size-3.5 ml-1.5" />
                  </Link>
                </Button>
                <div className="w-px h-4 bg-border mx-1" />
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
              </div>
            </div>
            
            {isOpen && (
              <div className="h-[400px] flex flex-col bg-background/50">
                {isLeader ? (
                  <TeamLeaderChatArea teamId={teamId} token={token || ""} newChatTrigger={newChatTrigger} />
                ) : (
                  <AgentChatArea 
                    agentId={agent.id}
                    agentName={agent.name}
                    agentIcon={agent.icon || "🤖"}
                    agentColor={agent.metadata?.avatarColor || "#6366f1"}
                    userName={user?.name || "You"}
                    token={token}
                    newChatTrigger={newChatTrigger}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

