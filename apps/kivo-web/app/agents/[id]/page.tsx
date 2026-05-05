"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Bot, Brain, ChevronRight, Gauge,
  History, Loader2, Send, Settings, ShieldCheck, Wrench, Plus,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { DisplayStatus, Agent, ChatMessage, Conversation } from "@/lib/types";

function computeDisplayStatus(a: any): DisplayStatus {
  const k8s = a.k8sStatus;
  if (k8s === "failed" || k8s === "terminated") return "offline";
  if (k8s !== "running") return "provisioning";
  return a.availability || "available";
}

function StatusIndicator({ status }: { status: DisplayStatus }) {
  return (
    <span className={cn(
      "relative flex size-2 shrink-0 rounded-full",
      status === "available"    && "bg-emerald-500",
      status === "provisioning" && "bg-amber-400 animate-pulse",
      status === "busy"         && "bg-blue-500",
      status === "blocked"      && "bg-red-500",
      status === "offline"      && "bg-red-500",
    )} />
  );
}

function ChatArea({ agentId, agentName, agentIcon, agentColor, userName, token, t, newChatTrigger }: any) {
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
        toast.error("Failed to send message.");
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
    } catch {
      setMessages(p => p.map(m => m.id === messageIdInState ? { ...m, status: "error" } : m));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[500px]">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {isInitializing ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 select-none opacity-50">
            <Bot className="size-8 text-muted-foreground" />
            <p className="text-xs">Start a conversation...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map(m => (
              <div key={m.id} className={cn("flex items-end gap-2", m.role === "user" ? "flex-row-reverse" : "")}>
                {m.role !== "user" && (
                  <div className="flex size-6 items-center justify-center rounded-full text-xs" style={{ background: agentColor + "22" }}>
                    {agentIcon}
                  </div>
                )}
                <div className={cn("px-4 py-2.5 rounded-2xl max-w-[80%] text-sm", 
                  m.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm",
                  m.status === "error" && "bg-destructive/10 text-destructive-foreground"
                )}>
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
               <div className="flex items-end gap-2">
                 <div className="flex size-6 items-center justify-center rounded-full text-xs" style={{ background: agentColor + "22" }}>{agentIcon}</div>
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

      <div className="p-3 border-t bg-muted/10">
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Send a message..." className="bg-background shadow-sm h-10" disabled={sending} />
          <Button type="submit" size="icon" disabled={!input.trim() || sending} className="h-10 w-10 shrink-0">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function AgentPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const params = useParams();
  const agentId = String(params.id);

  const [agent, setAgent] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newChatTrigger, setNewChatTrigger] = useState(0);

  const authHeaders = useCallback((): HeadersInit => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  useEffect(() => {
    const fetchAgent = () => {
      fetch(`${API_BASE}/agents/${agentId}`, { headers: authHeaders() })
        .then((r) => r.json())
        .then((d) => setAgent(d.data))
        .catch(() => toast.error("Failed to load agent."))
        .finally(() => setIsLoading(false));
    };
    fetchAgent();
    const intervalId = setInterval(fetchAgent, 5000);
    return () => clearInterval(intervalId);
  }, [agentId, authHeaders]);

  if (isLoading) return <div className="flex min-h-svh items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (!agent) return null;

  const icon = agent.icon ?? "🤖";
  const color = agent.metadata?.avatarColor ?? "#6366f1";
  const status = computeDisplayStatus(agent);
  const roleLabel = agent.type.replace("_", " ");
  
  const statusLabels: Record<DisplayStatus, string> = {
    available: "Available", busy: "Processing", blocked: "Blocked",
    provisioning: "Provisioning", offline: "Offline"
  };
  
  const NAV_ITEMS = [
    { href: `/agents/${agentId}/general`,   icon: <Settings className="size-4" />, title: "General Settings" },
    { href: `/agents/${agentId}/brain`,     icon: <Brain className="size-4" />, title: "Brain & Memory" },
    { href: `/agents/${agentId}/tools`,     icon: <Wrench className="size-4" />, title: "Tools & Skills" },
    { href: `/agents/${agentId}/security`,  icon: <ShieldCheck className="size-4" />, title: "Security Rules" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <Link href={agent.teamId ? `/teams/${agent.teamId}` : "/teams"} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-3.5" />
        Back to Squad
      </Link>

      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl text-3xl border shadow-sm" style={{ backgroundColor: color + "15" }}>
            {icon}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{agent.name}</h1>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground capitalize">{roleLabel}</span>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <StatusIndicator status={status} />
                <span className="text-xs font-medium text-foreground">{statusLabels[status]}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <section className="rounded-xl border bg-card overflow-hidden">
            <div className="border-b px-5 py-3.5 flex items-center justify-between bg-muted/20">
              <h3 className="text-sm font-semibold">Agent Chat</h3>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setNewChatTrigger(p => p + 1)}>New Chat</Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
                  <Link href={`/agents/${agentId}/history`}>History</Link>
                </Button>
              </div>
            </div>
            <ChatArea agentId={agentId} agentName={agent.name} agentIcon={icon} agentColor={color} userName={user?.name ?? "You"} token={token} t={t} newChatTrigger={newChatTrigger} />
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border bg-card overflow-hidden">
             <div className="border-b px-5 py-3.5 bg-muted/20">
              <h3 className="text-sm font-semibold">Configuration</h3>
            </div>
            <div className="divide-y">
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="text-muted-foreground group-hover:text-foreground transition-colors">{item.icon}</div>
                    <span className="text-sm font-medium">{item.title}</span>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
