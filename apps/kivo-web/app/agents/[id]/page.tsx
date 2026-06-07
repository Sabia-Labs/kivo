"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Bot, Check, ChevronDown, ChevronRight, Brain,
  KeyRound, Loader2, Save, Send, Wifi, WifiOff, MessageSquare, Plus, X, Edit2, LineChart
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { DisplayStatus } from "@/lib/types";
import { AgentChatArea } from "@/components/AgentChatArea";
import { Markdown } from "@/components/Markdown";

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
  id: string; name: string; roleId: string;
  icon?: string; metadata?: AgentMetadata;
  teamId?: string;
  k8sStatus?: string;
  availability?: string;
  soul?: string;
  identity?: string;
  agentsInstructions?: string;
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

// ── ComingSoonChannel ─────────────────────────────────────────────────────────

interface ComingSoonChannelProps {
  name: string;
  icon: React.ReactNode;
}

function ComingSoonChannel({ name, icon }: ComingSoonChannelProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between py-3 opacity-60">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-sm font-medium text-foreground">{name}</p>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t.agentPage.comingSoon}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          className="relative inline-flex h-5 w-9 shrink-0 cursor-not-allowed items-center rounded-full border-2 border-transparent bg-muted-foreground/20 transition-colors focus:outline-none"
          role="switch"
        >
          <span className="pointer-events-none inline-block size-4 translate-x-0 rounded-full bg-white shadow transition-transform" />
        </button>
        <ChevronRight className="size-3.5 text-muted-foreground/30" />
      </div>
    </div>
  );
}

// ── TelegramChannel ───────────────────────────────────────────────────────────

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
  const { t } = useTranslation();
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
        <Wifi className="size-3" /> {t.agents.healthOnline}
      </span>
    );
    if (telegramStatus === "pending_pairing") return (
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
        <span className="size-1.5 animate-pulse rounded-full bg-amber-500" /> {t.agentPage.telegramChannel.awaitingCodeTitle}
      </span>
    );
    return (
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <WifiOff className="size-3" /> {t.agents.telegram.notConfigured}
      </span>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center gap-3">
          <svg className="size-5 text-[#24A1DE] fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.193.926-.446l2.222-2.164 4.606 3.407c.847.466 1.458.225 1.671-.785l2.93-13.791c.301-1.208-.43-1.759-1.165-1.442z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-foreground">{t.agents.telegram.sectionTitle}</p>
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
                <p className="mb-4 text-xs text-muted-foreground">{t.agentPage.telegramChannel.botFatherGuide}</p>
              )}
              {hasTelegramToken && telegramStatus === "complete" ? (
                <details className="group">
                  <summary className="cursor-pointer text-xs text-muted-foreground/60 hover:text-muted-foreground select-none list-none flex items-center gap-1">
                    <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                    {t.agentPage.telegramChannel.updateTokenTitle}
                  </summary>
                  <div className="mt-3 flex flex-col gap-1.5">
                    <p className="text-xs text-muted-foreground">
                      {t.agentPage.telegramChannel.updateTokenDesc}
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder={t.agentPage.telegramChannel.pasteNewPlaceholder}
                        className="flex-1 font-mono text-xs"
                        autoComplete="off"
                      />
                      <Button
                        onClick={handleSaveToken}
                        disabled={savingToken || !token.trim()}
                        size="sm"
                        className="shrink-0 gap-1.5"
                      >
                        {savingToken
                          ? <><Loader2 className="size-3.5 animate-spin" />{t.agentPage.telegramChannel.saving}</>
                          : <><Send className="size-3.5" />{t.agentPage.telegramChannel.updateBtn}</>
                        }
                      </Button>
                    </div>
                  </div>
                </details>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <KeyRound className="size-3.5 text-muted-foreground" />
                    {t.agentPage.telegramChannel.botTokenLabel}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder={t.agentPage.telegramChannel.botTokenPlaceholder}
                      className="flex-1 font-mono text-xs"
                      autoComplete="off"
                    />
                    <Button
                      onClick={handleSaveToken}
                      disabled={savingToken || !token.trim()}
                      size="sm"
                      className="shrink-0 gap-1.5"
                    >
                      {savingToken
                        ? <><Loader2 className="size-3.5 animate-spin" />{t.agentPage.telegramChannel.saving}</>
                        : <><Send className="size-3.5" />{t.agentPage.telegramChannel.saveConnectBtn}</>
                      }
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {telegramStatus === "pending_pairing" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/40 dark:bg-amber-900/20">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-amber-500">
                  <span className="size-2 animate-pulse rounded-full bg-amber-500" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">{t.agentPage.telegramChannel.awaitingCodeTitle}</p>
                  <p className="mt-0.5 text-xs text-amber-600/80 dark:text-amber-300/70">
                    {t.agentPage.telegramChannel.awaitingCodeDesc}
                  </p>
                </div>
              </div>

              <ol className="flex flex-col gap-2">
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">1</span>
                  <p className="text-xs text-muted-foreground pt-0.5">{t.agentPage.telegramChannel.step1}</p>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">2</span>
                  <p className="text-xs text-muted-foreground pt-0.5">{t.agentPage.telegramChannel.step2}</p>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">3</span>
                  <p className="text-xs text-muted-foreground pt-0.5">{t.agentPage.telegramChannel.step3}</p>
                </li>
              </ol>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">{t.agentPage.telegramChannel.pairingCodeLabel}</label>
                <div className="flex gap-2">
                  <Input
                    value={pairingCode}
                    onChange={(e) => setPairingCode(e.target.value)}
                    placeholder={t.agentPage.telegramChannel.pairingCodePlaceholder}
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
                      ? <><Loader2 className="size-3.5 animate-spin" />{t.agentPage.telegramChannel.approving}</>
                      : <><Check className="size-3.5" />{t.agentPage.telegramChannel.approveBtn}</>
                    }
                  </Button>
                </div>
              </div>

              <details className="group">
                <summary className="cursor-pointer text-xs text-muted-foreground/60 hover:text-muted-foreground select-none list-none flex items-center gap-1">
                  <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                  {t.agentPage.telegramChannel.wrongTokenTitle}
                </summary>
                <div className="mt-3 flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <Input
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder={t.agentPage.telegramChannel.wrongTokenPlaceholder}
                      className="flex-1 font-mono text-xs"
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
                      {t.agentPage.telegramChannel.updateBtn}
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
  type BrainField = "soul" | "identity" | "agentsInstructions";
  const [editingBrainField, setEditingBrainField] = useState<BrainField | null>(null);
  const [brainContent, setBrainContent] = useState("");

  const fieldTitleMap: Record<BrainField, string> = {
    soul: t.agentPage.brainFields.soul,
    identity: t.agentPage.brainFields.identity,
    agentsInstructions: t.agentPage.brainFields.process,
  };
  const [isFetchingLive, setIsFetchingLive] = useState(false);

  const authHeaders = useCallback((): HeadersInit => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  const fetchLiveFile = useCallback(async (filename: string) => {
    setIsFetchingLive(true);
    try {
      const r = await fetch(`${API_BASE}/agents/${agentId}/files/${filename}`, { headers: authHeaders() });
      if (r.ok) {
        const d = await r.json();
        return d.data.content;
      }
      return null;
    } catch (err) {
      console.error("Failed to fetch live file:", err);
      return null;
    } finally {
      setIsFetchingLive(false);
    }
  }, [agentId, authHeaders]);

  const openBrainEditor = async (field: BrainField) => {
    setEditingBrainField(field);
    setBrainContent(""); // Clear before loading

    const filenameMap: Record<BrainField, string> = {
      soul: "SOUL.md",
      identity: "IDENTITY.md",
      agentsInstructions: "AGENTS.md"
    };

    const liveContent = await fetchLiveFile(filenameMap[field]);
    
    if (liveContent !== null) {
      setBrainContent(liveContent);
    } else {
      // Fallback to DB data (while migrating or if pod is down)
      if (field === "soul") setBrainContent(agent?.soul ?? "");
      else if (field === "identity") setBrainContent(agent?.identity ?? "");
      else if (field === "agentsInstructions") setBrainContent(agent?.agentsInstructions ?? "");
      toast.info("Showing cached data (Agent pod unreachable)");
    }
  };

  const fetchAgent = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/agents/${agentId}`, { headers: authHeaders() });
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
      const r = await fetch(`${API_BASE}/agents/${agentId}`, {
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

  const saveTelegramToken = async (newToken: string) => {
    if (!agent) return;
    const r = await fetch(`${API_BASE}/agents/${agentId}`, {
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
    const r = await fetch(`${API_BASE}/agents/${agentId}/telegram/approve-pairing`, {
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
  const normalizedRoleKey = (agent.roleId || "").replace(/-/g, "_");
  const roleLabel = (t.agents.roleLabels as any)[normalizedRoleKey] || (agent.roleId || "agent").replace(/[_-]/g, " ");
  
  const statusLabels: Record<DisplayStatus, string> = {
    available: t.agentPage.statusLabels.available,
    busy: t.agentPage.statusLabels.busy,
    blocked: t.agentPage.statusLabels.blocked,
    provisioning: t.agentPage.statusLabels.provisioning,
    offline: t.agentPage.statusLabels.offline,
  };

  const hasTelegramToken = Boolean(agent.metadata?.hasTelegramToken);
  const telegramStatus: TelegramStatus = agent.metadata?.telegramStatus ?? (hasTelegramToken ? "pending_pairing" : "not_configured");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12 pb-32">
      <Link href={agent.teamId ? `/teams/${agent.teamId}` : "/teams"} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-3.5" />
        {t.agentPage.backToSquad}
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
              <span className="text-xs font-medium text-muted-foreground">{roleLabel}</span>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <StatusIndicator status={status} />
                <span className="text-xs font-medium text-foreground">{statusLabels[status]}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Access Button */}
        <div className="shrink-0">
          <Button variant="outline" className="gap-2 shadow-sm" asChild>
            <Link href={`/agents/${agentId}/dashboard`}>
              <LineChart className="size-4 text-primary" />
              <span>{t.agentPage.openDashboard}</span>
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-8">
        {/* Chat Area */}
        <section className="rounded-xl border bg-card overflow-hidden">
          <div className="border-b px-5 py-3.5 flex items-center justify-between bg-muted/20">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{t.agentPage.chatTitle}</h3>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setNewChatTrigger(p => p + 1)}>{t.agentPage.newChat}</Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
                <Link href={`/agents/${agentId}/history`}>{t.agentPage.historyBtn}</Link>
              </Button>
            </div>
          </div>
          <div className="h-[400px]">
            <AgentChatArea 
              agentId={agentId} agentName={agent.name} agentIcon={icon} agentColor={color} 
              userName={user?.name ?? "You"} token={token} t={t} newChatTrigger={newChatTrigger} 
            />
          </div>
        </section>

        {/* Communication Channels */}
        <section className="rounded-xl border bg-card overflow-hidden">
           <div className="border-b px-5 py-3.5 bg-muted/20">
            <h3 className="text-sm font-semibold">{t.agentPage.channelsTitle}</h3>
          </div>
          <div className="p-5">
            <div className="mb-4">
              <p className="text-xs text-muted-foreground">
                {t.agentPage.channelsDesc}
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
              <ComingSoonChannel
                name="WhatsApp"
                icon={
                  <svg className="size-5 text-[#25D366] fill-current" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12.001 2C6.486 2 2 6.485 2 12c0 2.37.817 4.557 2.19 6.279L2.835 22l3.87-1.346A9.91 9.91 0 0 0 12.001 22c5.514 0 10-4.485 10-10s-4.486-10-10-10zm5.358 14.398c-.287.794-1.666 1.464-2.277 1.57-.456.079-1.042.179-3.23-.728-2.678-1.104-4.44-3.874-4.577-4.056-.136-.182-1.117-1.487-1.117-2.837 0-1.35.58-2.016 1.054-2.525.26-.277.587-.367.828-.367.24 0 .48.006.69.014.219.008.52-.083.82.632.298.711 1.018 2.484 1.107 2.665.09.182.145.392.037.632-.108.24-.163.393-.325.575-.163.183-.343.404-.487.545-.145.141-.303.303-.127.603.177.301.785 1.332 1.684 2.158 1.155 1.057 2.137 1.353 2.434 1.493.297.141.474.119.653-.09.18-.21.776-.902.996-1.206.22-.304.442-.255.757-.145.315.111 2.01.954 2.355 1.127.345.174.574.258.658.404.084.146.084.846-.203 1.64z" />
                  </svg>
                }
              />
              <ComingSoonChannel
                name="WeChat"
                icon={
                  <svg className="size-5 text-[#07C160] fill-current" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M11.176 14.429c-2.665 0-4.826-1.8-4.826-4.018 0-2.22 2.159-4.02 4.824-4.02S16 8.191 16 10.411c0 1.21-.65 2.301-1.666 3.036a.32.32 0 0 0-.12.366l.218.81a.6.6 0 0 1 .029.117.166.166 0 0 1-.162.162.2.2 0 0 1-.092-.03l-1.057-.61a.5.5 0 0 0-.256-.074.5.5 0 0 0-.142.021 5.7 5.7 0 0 1-1.576.22M9.064 9.542a.647.647 0 1 0 .557-1 .645.645 0 0 0-.646.647.6.6 0 0 0 .09.353Zm3.232.001a.646.646 0 1 0 .546-1 .645.645 0 0 0-.644.644.63.63 0 0 0 .098.356" />
                    <path d="M0 6.826c0 1.455.781 2.765 2.001 3.656a.385.385 0 0 1 .143.439l-.161.6-.1.373a.5.5 0 0 0-.032.14.19.19 0 0 0 .193.193q.06 0 .111-.029l1.268-.733a.6.6 0 0 1 .308-.088q.088 0 .171.025a6.8 6.8 0 0 0 1.625.26 4.5 4.5 0 0 1-.177-1.251c0-2.936 2.785-5.02 5.824-5.02l.15.002C10.587 3.429 8.392 2 5.796 2 2.596 2 0 4.16 0 6.826m4.632-1.555a.77.77 0 1 1-1.54 0 .77.77 0 0 1 1.54 0m3.875 0a.77.77 0 1 1-1.54 0 .77.77 0 0 1 1.54 0" />
                  </svg>
                }
              />
              <ComingSoonChannel
                name="Slack"
                icon={
                  <svg className="size-5 text-[#E01E5A] fill-current" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1 2.522-2.52A2.528 2.528 0 0 1 13.879 5.042a2.527 2.527 0 0 1-2.522 2.521h-2.523V5.042zM7.563 8.835a2.527 2.527 0 0 1-2.521 2.521 2.527 2.527 0 0 1-2.521-2.521V2.523A2.528 2.528 0 0 1 5.042 0a2.528 2.528 0 0 1 2.521 2.522v6.313zM18.958 8.835a2.528 2.528 0 0 1 2.52 2.522 2.528 2.528 0 0 1-2.52 2.522 2.527 2.527 0 0 1-2.522-2.522v-2.522h2.522zM17.687 8.835a2.527 2.527 0 0 1-2.521 2.522 2.527 2.527 0 0 1-2.521-2.522V2.523A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.313zM15.166 18.958a2.528 2.528 0 0 1-2.522 2.521 2.528 2.528 0 0 1-2.521-2.521 2.527 2.527 0 0 1 2.521-2.522h2.522v2.522zM16.437 15.165a2.527 2.527 0 0 1 2.521 2.522 2.527 2.527 0 0 1-2.521 2.521h-6.313a2.528 2.528 0 0 1-2.522-2.521 2.528 2.528 0 0 1 2.522-2.522h6.313z" />
                  </svg>
                }
              />
            </div>
          </div>
        </section>

        {/* Brain & Memory */}
        <section className="rounded-xl border bg-card overflow-hidden">
          <div className="border-b px-5 py-3.5 bg-muted/20 flex items-center gap-2">
            <Brain className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t.agentPage.brainMemoryTitle}</h3>
          </div>
          <div className="p-5">
            <p className="text-sm text-muted-foreground mb-4">
              {t.agentPage.brainMemoryDesc}
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Button variant="outline" className={cn("h-auto flex-col items-start p-4 text-left transition-all", editingBrainField === "soul" && "ring-2 ring-primary")} onClick={() => openBrainEditor("soul")}>
                <span className="font-semibold mb-1">{t.agentPage.brainFields.soul}</span>
                <span className="text-xs text-muted-foreground font-normal whitespace-normal line-clamp-3">{t.agentPage.brainFields.soulDesc}</span>
              </Button>
              <Button variant="outline" className={cn("h-auto flex-col items-start p-4 text-left transition-all", editingBrainField === "identity" && "ring-2 ring-primary")} onClick={() => openBrainEditor("identity")}>
                <span className="font-semibold mb-1">{t.agentPage.brainFields.identity}</span>
                <span className="text-xs text-muted-foreground font-normal whitespace-normal line-clamp-3">{t.agentPage.brainFields.identityDesc}</span>
              </Button>
              <Button variant="outline" className={cn("h-auto flex-col items-start p-4 text-left transition-all", editingBrainField === "agentsInstructions" && "ring-2 ring-primary")} onClick={() => openBrainEditor("agentsInstructions")}>
                <span className="font-semibold mb-1">{t.agentPage.brainFields.process}</span>
                <span className="text-xs text-muted-foreground font-normal whitespace-normal line-clamp-3">{t.agentPage.brainFields.processDesc}</span>
              </Button>
            </div>

            {editingBrainField && (
              <div className="mt-5 border rounded-xl p-4 bg-muted/10 animate-in fade-in slide-in-from-top-2">
                 <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm tracking-wide uppercase">{fieldTitleMap[editingBrainField]} {t.agentPage.editor.titleSuffix}</h4>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">{t.agentPage.editor.readOnly}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEditingBrainField(null)}><X className="size-4" /></Button>
                 </div>
                 
                 {isFetchingLive ? (
                   <div className="flex flex-col items-center justify-center min-h-[250px] bg-background border rounded-md gap-3">
                     <Loader2 className="size-8 animate-spin text-primary/40" />
                     <p className="text-xs text-muted-foreground animate-pulse">{t.agentPage.editor.readingLive}</p>
                   </div>
                 ) : (
                   <div className="w-full min-h-[250px] p-6 bg-background border rounded-md overflow-auto">
                     {brainContent ? (
                       <Markdown content={brainContent} />
                     ) : (
                       <span className="text-muted-foreground italic">No content found.</span>
                     )}
                   </div>
                 )}
                 
                 <p className="mt-3 text-[10px] text-muted-foreground italic text-right">
                   This data is fetched live from the agent's persistent storage.
                 </p>
              </div>
            )}
          </div>
        </section>
      </div>

    </div>
  );
}
