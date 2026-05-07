const fs = require('fs');

const code = `"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Bot, Check, ChevronDown, ChevronRight,
  KeyRound, Loader2, Save, Send, Wifi, WifiOff, MessageSquare, Plus, X, Edit2
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { DisplayStatus } from "@/lib/types";

// ── Constants & Types ────────────────────────────────────────────────────────

const AVATAR_EMOJIS = [
  "🤖","🦾","⚙️","🧠","🔬","🛠️","🚀","⚡","🔮","🎯",
  "🌐","💡","🦊","🐉","🦅","🦁","🐺","🦋","🌊","🔥",
  "👑","🎭","🎪","🏆","💎","🌟","🎸","🎯","🧬","🔭",
];

const AVATAR_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981",
  "#06b6d4","#ef4444","#3b82f6","#84cc16","#f97316",
];

type TelegramStatus = "not_configured" | "pending_pairing" | "complete";

interface AgentMetadata {
  avatarColor?: string;
  hasTelegramToken?: boolean;
  telegramStatus?: TelegramStatus;
  soul?: string;
  identity?: string;
  agents?: string;
  personality?: string;
  [key: string]: any;
}

interface Agent {
  id: string; name: string; type: string;
  icon?: string; metadata?: AgentMetadata;
  teamId?: string;
  k8sStatus?: string;
  availability?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── AvatarPicker ──────────────────────────────────────────────────────────────

function AvatarPicker({ icon, color, onIconChange, onColorChange, onClose }: {
  icon: string; color: string;
  onIconChange: (i: string) => void; onColorChange: (c: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute left-0 top-full z-30 mt-2 w-64 rounded-2xl border border-border bg-card p-3 shadow-xl">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Emoji</p>
      <div className="mb-3 grid grid-cols-10 gap-1">
        {AVATAR_EMOJIS.map((e) => (
          <button key={e} type="button" onClick={() => onIconChange(e)}
            className={cn("flex size-7 items-center justify-center rounded-lg text-sm transition-all hover:scale-110", icon === e && "ring-2 ring-primary ring-offset-1")}>
            {e}
          </button>
        ))}
      </div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Color</p>
      <div className="flex flex-wrap gap-1.5">
        {AVATAR_COLORS.map((c) => (
          <button key={c} type="button" onClick={() => onColorChange(c)} style={{ background: c }}
            className={cn("size-5 rounded-full transition-transform hover:scale-110", color === c && "ring-2 ring-offset-2 ring-foreground scale-110")} />
        ))}
      </div>
    </div>
  );
}

// ── TelegramChannel ───────────────────────────────────────────────────────────

const BOTFATHER_GUIDE = 'Open Telegram, search for @BotFather and send /newbot. Choose a display name and a username ending in "bot". BotFather will reply with a token — paste it below.';

function TelegramChannel({
  agentId,
  hasTelegramToken,
  telegramStatus,
  onTokenSaved,
  onPairingApproved,
}: {
  agentId: string;
  hasTelegramToken: boolean;
  telegramStatus: TelegramStatus;
  onTokenSaved: (token: string) => Promise<void>;
  onPairingApproved: (code: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(telegramStatus !== "not_configured");
  const [token, setToken] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [approvingPairing, setApprovingPairing] = useState(false);

  useEffect(() => {
    if (telegramStatus !== "not_configured") setOpen(true);
  }, [telegramStatus]);

  const handleSaveToken = async () => {
    if (!token.trim()) return;
    setSavingToken(true);
    try {
      await onTokenSaved(token.trim());
      setToken("");
    } finally {
      setSavingToken(false);
    }
  };

  const handleApprovepairing = async () => {
    if (!pairingCode.trim()) return;
    setApprovingPairing(true);
    try {
      await onPairingApproved(pairingCode.trim());
      setPairingCode("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to approve pairing code. Please try again."
      );
    } finally {
      setApprovingPairing(false);
    }
  };

  const StatusBadge = () => {
    if (telegramStatus === "complete") return (
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
        <Wifi className="size-3" /> Online
      </span>
    );
    if (telegramStatus === "pending_pairing") return (
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
        <span className="size-1.5 animate-pulse rounded-full bg-amber-500" /> Awaiting Pairing
      </span>
    );
    return (
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <WifiOff className="size-3" /> Not configured
      </span>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center gap-3">
          <span className="text-xl">✈️</span>
          <div>
            <p className="text-sm font-medium text-foreground">Telegram</p>
            <StatusBadge />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
              (open || telegramStatus !== "not_configured") ? "bg-primary" : "bg-muted-foreground/30"
            )}
            role="switch"
          >
            <span className={cn(
              "pointer-events-none inline-block size-4 rounded-full bg-white shadow transition-transform",
              (open || telegramStatus !== "not_configured") ? "translate-x-4" : "translate-x-0"
            )} />
          </button>
          <ChevronRight className={cn(
            "size-3.5 text-muted-foreground/50 transition-transform duration-200",
            open && "rotate-90"
          )} />
        </div>
      </div>

      {open && (
        <div className="mb-4 rounded-xl border border-border/60 bg-muted/30 p-4">
          {(telegramStatus === "not_configured" || telegramStatus === "complete") && (
            <>
              {telegramStatus === "not_configured" && (
                <p className="mb-4 text-xs text-muted-foreground">{BOTFATHER_GUIDE}</p>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <KeyRound className="size-3.5 text-muted-foreground" />
                  {hasTelegramToken && telegramStatus === "complete" ? "Update Bot Token" : "Bot Token"}
                </label>
                {hasTelegramToken && telegramStatus === "complete" && (
                  <p className="text-xs text-muted-foreground">
                    A token is already saved. Paste a new one below to replace it. This will restart the agent.
                  </p>
                )}
                <div className="flex gap-2">
                  <Input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={hasTelegramToken ? "Paste new token to update…" : "Paste your bot token here…"}
                    className="flex-1 font-mono text-xs"
                    type="password"
                    autoComplete="off"
                  />
                  <Button
                    onClick={handleSaveToken}
                    disabled={savingToken || !token.trim()}
                    size="sm"
                    className="shrink-0 gap-1.5"
                  >
                    {savingToken
                      ? <><Loader2 className="size-3.5 animate-spin" />Saving…</>
                      : <><Send className="size-3.5" />{hasTelegramToken ? "Update" : "Save & Connect"}</>
                    }
                  </Button>
                </div>
              </div>
            </>
          )}

          {telegramStatus === "pending_pairing" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/40 dark:bg-amber-900/20">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-amber-500">
                  <span className="size-2 animate-pulse rounded-full bg-amber-500" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Awaiting Pairing Code</p>
                  <p className="mt-0.5 text-xs text-amber-600/80 dark:text-amber-300/70">
                    Your agent is restarting with the new Telegram token. As soon as it&apos;s ready,
                    send any message to the bot on Telegram — it will reply with a pairing code.
                  </p>
                </div>
              </div>

              <ol className="flex flex-col gap-2">
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">1</span>
                  <p className="text-xs text-muted-foreground pt-0.5">Open Telegram and send any message to your bot</p>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">2</span>
                  <p className="text-xs text-muted-foreground pt-0.5">The bot will reply with a one-time pairing code.</p>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">3</span>
                  <p className="text-xs text-muted-foreground pt-0.5">Paste the code below and click <strong>Approve</strong>.</p>
                </li>
              </ol>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Pairing Code</label>
                <div className="flex gap-2">
                  <Input
                    value={pairingCode}
                    onChange={(e) => setPairingCode(e.target.value)}
                    placeholder="Paste the code your bot sent you…"
                    className="flex-1 font-mono text-sm tracking-widest"
                    autoComplete="off"
                    autoFocus
                  />
                  <Button
                    onClick={handleApprovepairing}
                    disabled={approvingPairing || !pairingCode.trim()}
                    size="sm"
                    className="shrink-0 gap-1.5"
                  >
                    {approvingPairing
                      ? <><Loader2 className="size-3.5 animate-spin" />Approving…</>
                      : <><Check className="size-3.5" />Approve</>
                    }
                  </Button>
                </div>
              </div>

              <details className="group">
                <summary className="cursor-pointer text-xs text-muted-foreground/60 hover:text-muted-foreground select-none list-none flex items-center gap-1">
                  <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                  Wrong token? Change it
                </summary>
                <div className="mt-3 flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <Input
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="Paste new bot token to replace…"
                      className="flex-1 font-mono text-xs"
                      type="password"
                      autoComplete="off"
                    />
                    <Button
                      onClick={handleSaveToken}
                      disabled={savingToken || !token.trim()}
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-1.5"
                    >
                      {savingToken ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                      Update
                    </Button>
                  </div>
                </div>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ChatArea ──────────────────────────────────────────────────────────────────

function ChatArea({ agentId, agentName, agentIcon, agentColor, userName, token, t, newChatTrigger }: any) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conv, setConv] = useState<any>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const headers = useCallback((): HeadersInit => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: \`Bearer \${token}\` } : {}),
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
    const tempId = \`u-\${Date.now()}\`;
    let messageIdInState = tempId;
    
    setMessages(p => [...p, { id: tempId, role: "user", content: text, createdAt: new Date().toISOString(), status: "sending" }]);

    try {
      let cid = conv?.id;
      if (!cid) {
        const r = await fetch(\`\${API_BASE}/conversations\`, {
          method: "POST", headers: headers(),
          body: JSON.stringify({ agentId, counterpartType: "human", counterpartName: userName }),
        });
        if (!r.ok) throw new Error();
        const nc = (await r.json()).data;
        setConv(nc); cid = nc.id;
      }
      
      const res = await fetch(\`\${API_BASE}/conversations/\${cid}/messages\`, { method: "POST", headers: headers(), body: JSON.stringify({ role: "user", content: text }) });
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
          id: resultObj.data.agentMessage.id || \`a-\${Date.now()}\`,
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
    <div className="flex flex-col flex-1 h-full min-h-0 bg-background overflow-hidden">
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
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs" style={{ background: agentColor + "22" }}>
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
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Send a message..." className="bg-background shadow-sm h-10" disabled={sending} />
          <Button type="submit" size="icon" disabled={!input.trim() || sending} className="h-10 w-10 shrink-0">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const params = useParams();
  const agentId = String(params.id);

  const [agent, setAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newChatTrigger, setNewChatTrigger] = useState(0);

  // Editable state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleName, setTitleName] = useState("");
  const [icon, setIcon] = useState("🤖");
  const [color, setColor] = useState("#6366f1");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Brain Editors State
  type BrainField = "soul" | "identity" | "agents";
  const [editingBrainField, setEditingBrainField] = useState<BrainField | null>(null);
  const [brainContent, setBrainContent] = useState("");
  const [isSavingBrain, setIsSavingBrain] = useState(false);

  // Floating Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);

  const authHeaders = useCallback((): HeadersInit => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: \`Bearer \${token}\` } : {}),
  }), [token]);

  const fetchAgent = useCallback(async () => {
    try {
      const r = await fetch(\`\${API_BASE}/agents/\${agentId}\`, { headers: authHeaders() });
      if (r.ok) {
        const d = await r.json();
        const a: Agent = d.data;
        setAgent(a);
        if (!isEditingTitle) setTitleName(a.name);
        setIcon(a.icon ?? "🤖");
        setColor(a.metadata?.avatarColor ?? "#6366f1");
      }
    } catch {
      toast.error("Failed to load agent.");
    } finally {
      setIsLoading(false);
    }
  }, [agentId, authHeaders, isEditingTitle]);

  useEffect(() => {
    fetchAgent();
    const intervalId = setInterval(fetchAgent, 5000);
    return () => clearInterval(intervalId);
  }, [fetchAgent]);

  const saveSettings = async (updates: Partial<Agent>) => {
    if (!agent) return;
    setIsSaving(true);
    try {
      const r = await fetch(\`\${API_BASE}/agents/\${agentId}\`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({
          name: updates.name ?? agent.name,
          icon: updates.icon ?? icon,
          metadata: { ...(agent.metadata ?? {}), ...(updates.metadata ?? {}) },
        }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setAgent(d.data);
      toast.success("Agent saved.");
    } catch {
      toast.error("Failed to save.");
    } finally { setIsSaving(false); }
  };

  const handleUpdateTitle = () => {
    if (!titleName.trim() || titleName === agent?.name) return;
    saveSettings({ name: titleName.trim() });
  };

  const handleUpdateAvatar = (newIcon: string, newColor: string) => {
    setIcon(newIcon);
    setColor(newColor);
    saveSettings({ icon: newIcon, metadata: { avatarColor: newColor } });
  };

  const openBrainEditor = (field: BrainField) => {
    setEditingBrainField(field);
    const meta = agent?.metadata ?? {};
    if (field === "soul") setBrainContent(meta.soul ?? meta.personality ?? "");
    else if (field === "identity") setBrainContent(meta.identity ?? "");
    else if (field === "agents") setBrainContent(meta.agents ?? "");
  };

  const saveBrainContent = async () => {
    if (!editingBrainField || !agent) return;
    setIsSavingBrain(true);
    try {
      const r = await fetch(\`\${API_BASE}/agents/\${agentId}\`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({
          metadata: { 
            ...(agent.metadata ?? {}), 
            [editingBrainField]: brainContent 
          },
        }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setAgent(d.data);
      toast.success(\`\${editingBrainField.toUpperCase()} updated.\`);
      setEditingBrainField(null);
    } catch {
      toast.error("Failed to update brain.");
    } finally { setIsSavingBrain(false); }
  };

  const saveTelegramToken = async (newToken: string) => {
    if (!agent) return;
    const r = await fetch(\`\${API_BASE}/agents/\${agentId}\`, {
      method: "PUT", headers: authHeaders(),
      body: JSON.stringify({
        metadata: { ...(agent.metadata ?? {}), telegramBotToken: newToken },
      }),
    });
    if (!r.ok) throw new Error("Failed to save token");
    setAgent((prev) => prev ? {
      ...prev,
      metadata: {
        ...prev.metadata,
        hasTelegramToken: true,
        telegramStatus: "pending_pairing" as TelegramStatus,
      },
    } : prev);
    toast.success("Token saved! Restarting agent...");
  };

  const approveTelegramPairing = async (code: string) => {
    const r = await fetch(\`\${API_BASE}/agents/\${agentId}/telegram/approve-pairing\`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ code }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err?.message ?? "Failed to approve pairing");
    }
    const d = await r.json();
    setAgent((prev) => prev ? { ...prev, metadata: { ...prev.metadata, telegramStatus: "complete" } } : prev);
    toast.success("Telegram connected!");
  };

  if (isLoading) return <div className="flex min-h-svh items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (!agent) return null;

  const status = computeDisplayStatus(agent);
  const roleLabel = agent.type.replace("_", " ");
  
  const statusLabels: Record<DisplayStatus, string> = {
    available: "Available", busy: "Processing", blocked: "Blocked",
    provisioning: "Provisioning", offline: "Offline"
  };

  const hasTelegramToken = Boolean(agent.metadata?.hasTelegramToken);
  const telegramStatus: TelegramStatus = agent.metadata?.telegramStatus ?? (hasTelegramToken ? "pending_pairing" : "not_configured");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12 pb-32">
      <Link href={agent.teamId ? \`/teams/\${agent.teamId}\` : "/teams"} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-3.5" />
        Back to Squad
      </Link>

      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
        <div className="flex items-center gap-4 relative">
          <div>
            <button 
              type="button" 
              onClick={() => setAvatarOpen(!avatarOpen)}
              className="flex size-14 shrink-0 items-center justify-center rounded-xl text-3xl border shadow-sm transition-transform hover:scale-105" 
              style={{ backgroundColor: color + "15" }}
            >
              {icon}
            </button>
            {avatarOpen && (
              <AvatarPicker 
                icon={icon} color={color}
                onIconChange={(i) => handleUpdateAvatar(i, color)}
                onColorChange={(c) => handleUpdateAvatar(icon, c)}
                onClose={() => setAvatarOpen(false)} 
              />
            )}
          </div>
          
          <div>
            {isEditingTitle ? (
              <div className="flex items-center gap-2 mb-1">
                <Input 
                  value={titleName} 
                  onChange={e => setTitleName(e.target.value)} 
                  autoFocus
                  className="text-2xl font-bold h-10 w-[250px] px-2"
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      setIsEditingTitle(false);
                      handleUpdateTitle();
                    }
                  }}
                />
                <Button size="icon" variant="ghost" className="shrink-0 size-8" onClick={() => {
                  setIsEditingTitle(false);
                  handleUpdateTitle();
                }}>
                  <Check className="size-5 text-emerald-500" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group mb-1">
                <h1 className="text-2xl font-bold tracking-tight">{agent.name}</h1>
                <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity size-6 shrink-0" onClick={() => setIsEditingTitle(true)}>
                  <Edit2 className="size-3 text-muted-foreground" />
                </Button>
              </div>
            )}
            
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
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl border bg-card overflow-hidden">
            <div className="border-b px-5 py-3.5 bg-muted/20 flex items-center gap-2">
              <Brain className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Brain & Memory</h3>
            </div>
            <div className="p-5">
              <p className="text-sm text-muted-foreground mb-4">
                Configure the core personality, identity, and operational rules for this agent.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Button variant="outline" className={cn("h-auto flex-col items-start p-4 text-left transition-all", editingBrainField === "soul" && "ring-2 ring-primary")} onClick={() => openBrainEditor("soul")}>
                  <span className="font-semibold mb-1">SOUL</span>
                  <span className="text-xs text-muted-foreground font-normal whitespace-normal line-clamp-3">Defines personality, values, tone, and behavioral boundaries.</span>
                </Button>
                <Button variant="outline" className={cn("h-auto flex-col items-start p-4 text-left transition-all", editingBrainField === "identity" && "ring-2 ring-primary")} onClick={() => openBrainEditor("identity")}>
                  <span className="font-semibold mb-1">IDENTITY</span>
                  <span className="text-xs text-muted-foreground font-normal whitespace-normal line-clamp-3">Contains surface-level details like name, role, and voice.</span>
                </Button>
                <Button variant="outline" className={cn("h-auto flex-col items-start p-4 text-left transition-all", editingBrainField === "agents" && "ring-2 ring-primary")} onClick={() => openBrainEditor("agents")}>
                  <span className="font-semibold mb-1">AGENTS</span>
                  <span className="text-xs text-muted-foreground font-normal whitespace-normal line-clamp-3">Operational instructions and rules governing agent behavior.</span>
                </Button>
              </div>

              {editingBrainField && (
                <div className="mt-5 border rounded-xl p-4 bg-muted/10 animate-in fade-in slide-in-from-top-2">
                   <div className="flex justify-between items-center mb-3">
                      <h4 className="font-semibold text-sm tracking-wide uppercase">{editingBrainField} Content</h4>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEditingBrainField(null)}><X className="size-4" /></Button>
                   </div>
                   <textarea 
                     value={brainContent} 
                     onChange={e => setBrainContent(e.target.value)}
                     className="w-full min-h-[250px] p-4 text-sm font-mono bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                     placeholder={\`Write the markdown content for \${editingBrainField.toUpperCase()} here...\`}
                   />
                   <div className="mt-3 flex justify-end">
                     <Button onClick={saveBrainContent} disabled={isSavingBrain}>
                       {isSavingBrain ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
                       Save
                     </Button>
                   </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Side Column */}
        <div className="space-y-6">
          <section className="rounded-xl border bg-card overflow-hidden">
             <div className="border-b px-5 py-3.5 bg-muted/20">
              <h3 className="text-sm font-semibold">Communication Channels</h3>
            </div>
            <div className="p-5">
              <div className="mb-4">
                <p className="text-xs text-muted-foreground">
                  Connect your agent to messaging platforms so users can interact with it directly.
                </p>
              </div>
              <div className="divide-y divide-border/60">
                <TelegramChannel
                  agentId={agentId}
                  hasTelegramToken={hasTelegramToken}
                  telegramStatus={telegramStatus}
                  onTokenSaved={saveTelegramToken}
                  onPairingApproved={approveTelegramPairing}
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Floating Chat Window */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
        {isChatOpen && (
          <div className="w-[380px] h-[600px] max-h-[80vh] rounded-2xl shadow-2xl border bg-card flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
            <div className="flex items-center justify-between p-3 border-b bg-muted/30 shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-full text-xs" style={{ background: color + "22" }}>
                  {icon}
                </div>
                <span className="text-sm font-semibold">{agent.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setNewChatTrigger(p => p + 1)} title="New Chat">
                   <Plus className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setIsChatOpen(false)}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <ChatArea 
              agentId={agentId} agentName={agent.name} agentIcon={icon} agentColor={color} 
              userName={user?.name ?? "You"} token={token} t={t} newChatTrigger={newChatTrigger} 
            />
          </div>
        )}
        
        {!isChatOpen && (
          <Button 
            onClick={() => setIsChatOpen(true)}
            className="size-14 rounded-full shadow-xl hover:scale-105 transition-transform"
            style={{ backgroundColor: color }}
          >
            <MessageSquare className="size-6 text-white" />
          </Button>
        )}
      </div>

    </div>
  );
}
\`;

fs.writeFileSync('/Users/lourenco/code/kivo/apps/kivo-web/app/agents/[id]/page.tsx', code);
