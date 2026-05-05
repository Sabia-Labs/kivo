"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Bot, Check, ChevronDown, ChevronRight,
  KeyRound, Loader2, Save, Send, Wifi, WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const AVATAR_EMOJIS = [
  "🤖","🦾","⚙️","🧠","🔬","🛠️","🚀","⚡","🔮","🎯",
  "🌐","💡","🦊","🐉","🦅","🦁","🐺","🦋","🌊","🔥",
  "👑","🎭","🎪","🏆","💎","🌟","🎸","🎯","🧬","🔭",
];

const AVATAR_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981",
  "#06b6d4","#ef4444","#3b82f6","#84cc16","#f97316",
];

const ROLE_LABELS: Record<string, string> = {
  team_lead:          "Team Lead",
  software_engineer:  "Software Engineer",
  software_architect: "Software Architect",
  product_manager:    "Product Manager",
};

// Telegram integration lifecycle:
//   not_configured  → token not saved yet
//   pending_pairing → token saved, waiting for pairing code OTP
//   complete        → pairing approved, bot online
type TelegramStatus = "not_configured" | "pending_pairing" | "complete";

interface AgentMetadata {
  avatarColor?: string;
  // hasTelegramToken is returned by the API instead of the raw token (security)
  hasTelegramToken?: boolean;
  telegramStatus?: TelegramStatus;
  personality?: string; identity?: string; longTermMemory?: string; model?: string;
}

interface Agent {
  id: string; name: string; type: string;
  icon?: string; metadata?: AgentMetadata;
  teamId?: string;
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

  // Sync open state if parent status changes
  useEffect(() => {
    if (telegramStatus !== "not_configured") setOpen(true);
  }, [telegramStatus]);

  const handleSaveToken = async () => {
    if (!token.trim()) return;
    setSavingToken(true);
    try {
      await onTokenSaved(token.trim());
      setToken(""); // clear after save — next load will show hasTelegramToken=true
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

  // ── Status badge ─────────────────────────────────────────────────────────────
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
      {/* Row header */}
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center gap-3">
          <span className="text-xl">✈️</span>
          <div>
            <p className="text-sm font-medium text-foreground">Telegram</p>
            <StatusBadge />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            id="channel-toggle-telegram"
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
              (open || telegramStatus !== "not_configured") ? "bg-primary" : "bg-muted-foreground/30"
            )}
            role="switch"
            aria-checked={open || telegramStatus !== "not_configured"}
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

      {/* Expandable body */}
      {open && (
        <div className="mb-4 rounded-xl border border-border/60 bg-muted/30 p-4">

          {/* ── STATE: not_configured or changing token ─────────────────────── */}
          {(telegramStatus === "not_configured" || telegramStatus === "complete") && (
            <>
              {telegramStatus === "not_configured" && (
                <p className="mb-4 text-xs text-muted-foreground">{BOTFATHER_GUIDE}</p>
              )}

              {/* Token input */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="telegram-bot-token" className="flex items-center gap-1.5 text-sm font-medium text-foreground">
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
                    id="telegram-bot-token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={hasTelegramToken ? "Paste new token to update…" : "Paste your bot token here…"}
                    className="flex-1 font-mono text-xs"
                    type="password"
                    autoComplete="off"
                  />
                  <Button
                    id="telegram-save-btn"
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

          {/* ── STATE: pending_pairing ─────────────────────────────────────── */}
          {telegramStatus === "pending_pairing" && (
            <div className="flex flex-col gap-4">
              {/* Status banner */}
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

              {/* Step instructions */}
              <ol className="flex flex-col gap-2">
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">1</span>
                  <p className="text-xs text-muted-foreground pt-0.5">Open Telegram and send any message to your bot (e.g. <code className="rounded bg-muted px-1">hello</code>)</p>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">2</span>
                  <p className="text-xs text-muted-foreground pt-0.5">The bot will reply with a one-time pairing code — copy it.</p>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">3</span>
                  <p className="text-xs text-muted-foreground pt-0.5">Paste the code below and click <strong>Approve</strong>.</p>
                </li>
              </ol>

              {/* Pairing code input */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="telegram-pairing-code" className="text-sm font-medium text-foreground">
                  Pairing Code
                </label>
                <div className="flex gap-2">
                  <Input
                    id="telegram-pairing-code"
                    value={pairingCode}
                    onChange={(e) => setPairingCode(e.target.value)}
                    placeholder="Paste the code your bot sent you…"
                    className="flex-1 font-mono text-sm tracking-widest"
                    autoComplete="off"
                    autoFocus
                  />
                  <Button
                    id="telegram-pairing-approve-btn"
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

              {/* Allow token change even in pending state */}
              <details className="group">
                <summary className="cursor-pointer text-xs text-muted-foreground/60 hover:text-muted-foreground select-none list-none flex items-center gap-1">
                  <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                  Wrong token? Change it
                </summary>
                <div className="mt-3 flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <Input
                      id="telegram-bot-token-update"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="Paste new bot token to replace…"
                      className="flex-1 font-mono text-xs"
                      type="password"
                      autoComplete="off"
                    />
                    <Button
                      id="telegram-token-update-btn"
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AgentGeneralPage() {
  const { token }  = useAuth();
  const params     = useParams();
  const agentId    = String(params.id);

  const [agent, setAgent]         = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  // local editable state
  const [name, setName]   = useState("");
  const [icon, setIcon]   = useState("🤖");
  const [color, setColor] = useState("#6366f1");

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
        setName(a.name);
        setIcon(a.icon ?? "🤖");
        setColor(a.metadata?.avatarColor ?? "#6366f1");
      })
      .catch(() => toast.error("Failed to load agent."))
      .finally(() => setIsLoading(false));
  }, [agentId, authHeaders]);

  const save = async () => {
    if (!name.trim() || !agent) return;
    setIsSaving(true);
    try {
      const r = await fetch(`${API_BASE}/agents/${agentId}`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({
          name: name.trim(),
          icon,
          metadata: { ...(agent.metadata ?? {}), avatarColor: color },
        }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setAgent(d.data);
      toast.success("Agent settings saved.");
    } catch {
      toast.error("Failed to save settings.");
    } finally { setIsSaving(false); }
  };

  const saveTelegramToken = async (newToken: string) => {
    if (!agent) return;
    const r = await fetch(`${API_BASE}/agents/${agentId}`, {
      method: "PUT", headers: authHeaders(),
      body: JSON.stringify({
        metadata: {
          ...(agent.metadata ?? {}),
          telegramBotToken: newToken,
        },
      }),
    });
    if (!r.ok) throw new Error("Failed to save token");
    // Transition state immediately — don't wait for a re-fetch.
    // The server also sets pending_pairing but the PUT response is
    // the raw DB record before the second update runs.
    setAgent((prev) => prev ? {
      ...prev,
      metadata: {
        ...prev.metadata,
        hasTelegramToken: true,
        telegramStatus: "pending_pairing" as TelegramStatus,
      },
    } : prev);
    toast.success("Token saved! Agent is restarting… send it a message on Telegram to get your pairing code.", {
      duration: 6000,
    });
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
    toast.success("🎉 Telegram connected! Your agent is now online.", { duration: 5000 });
    return d;
  };

  if (isLoading) return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;
  if (!agent) return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4">
      <Bot className="size-10 text-muted-foreground" />
      <p className="font-semibold">Agent not found</p>
    </div>
  );

  const backHref = `/agents/${agentId}`;
  const hasTelegramToken = Boolean(agent.metadata?.hasTelegramToken);
  const telegramStatus: TelegramStatus = agent.metadata?.telegramStatus ?? (hasTelegramToken ? "pending_pairing" : "not_configured");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* Back */}
      <Link href={backHref} id="general-back"
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Back to {agent.name}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">General Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Update this agent&apos;s name, avatar, and communication channels.</p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Avatar section */}
        <div className="rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Avatar</p>
          <div className="flex items-center gap-5">
            <div className="relative">
              <button id="general-avatar-btn" type="button" onClick={() => setAvatarOpen((v) => !v)}
                className="flex size-16 items-center justify-center rounded-2xl text-3xl shadow-sm transition-all hover:scale-105 active:scale-95"
                style={{ background: color + "22" }}>
                {icon}
              </button>
              {avatarOpen && (
                <AvatarPicker icon={icon} color={color}
                  onIconChange={(i) => setIcon(i)}
                  onColorChange={(c) => setColor(c)}
                  onClose={() => setAvatarOpen(false)} />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{agent.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{ROLE_LABELS[agent.type] ?? agent.type}</p>
              <p className="text-xs text-muted-foreground mt-2">Click the avatar to change emoji and color.</p>
            </div>
          </div>
        </div>

        {/* Name / Identity */}
        <div className="rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Identity</p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="general-agent-name" className="text-sm font-medium text-foreground">
                Agent name
              </label>
              <Input
                id="general-agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alice, Max, Kivo Lead…"
              />
            </div>
            <Button id="general-save-btn" onClick={save} disabled={isSaving || !name.trim()} className="w-full font-semibold">
              {isSaving ? <><Loader2 className="size-4 animate-spin mr-2" />Saving…</> : <><Save className="size-4 mr-2" />Save</>}
            </Button>
          </div>
        </div>

        {/* ── Communication Channels ───────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
          <div className="mb-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Communication Channels</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Connect your agent to messaging platforms so users can interact with it directly.
            </p>
          </div>

          <div className="mt-4 divide-y divide-border/60">
            {/* Telegram */}
            <TelegramChannel
              agentId={agentId}
              hasTelegramToken={hasTelegramToken}
              telegramStatus={telegramStatus}
              onTokenSaved={saveTelegramToken}
              onPairingApproved={approveTelegramPairing}
            />

            {/* Coming soon channels */}
            {[
              { icon: "💬", name: "WhatsApp" },
              { icon: "🟢", name: "WeChat" },
              { icon: "🔷", name: "Slack" },
              { icon: "🎮", name: "Discord" },
            ].map((ch) => (
              <div key={ch.name} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{ch.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground/60">{ch.name}</p>
                    <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wide">Coming Soon</p>
                  </div>
                </div>
                <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                  Soon
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
