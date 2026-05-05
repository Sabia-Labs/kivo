"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Trash2, Plus, Wand2, Check, Briefcase, 
  GitBranch, FileText, Globe, LayoutTemplate, Send, ChevronDown, CheckCircle2,
  X, Search, Edit2, Info, Star, Filter
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";

// ── Icons & SVGs ─────────────────────────────────────────────────────────────

const SVGS = {
  linear: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5"><path d="M4 12h16M12 4l8 8-8 8"/></svg>,
  jira: <svg viewBox="0 0 24 24" fill="currentColor" className="size-5 text-[#0052CC]"><path d="M11.53 2c0 2.4-1.97 4.35-4.35 4.35h-4.35v4.35c0 2.4-1.97 4.35-4.35 4.35v-8.7C-1.52 4.02 1.02 1.48 4.35 1.48h7.18V2zm10.87 8.7c0 2.4-1.97 4.35-4.35 4.35h-4.35v4.35c0 2.4-1.97 4.35-4.35 4.35v-8.7c0-2.4 1.97-4.35 4.35-4.35h8.7v4.35zM11.53 10.7c0 2.4-1.97 4.35-4.35 4.35H2.83v4.35c0 2.4 1.97 4.35 4.35 4.35h4.35V10.7z"/></svg>,
  trello: <svg viewBox="0 0 24 24" fill="currentColor" className="size-5 text-[#0079BF]"><path d="M2.7 0h18.6C22.78 0 24 1.22 24 2.7v18.6c0 1.48-1.22 2.7-2.7 2.7H2.7C1.22 24 0 22.78 0 21.3V2.7C0 1.22 1.22 0 2.7 0zm8.34 16.48c0 .38-.3.69-.69.69H4.6a.69.69 0 0 1-.69-.69V4.6a.69.69 0 0 1 .69-.69h5.75c.38 0 .69.3.69.69v11.88zm8.96-5.83c0 .38-.3.69-.69.69h-5.75a.69.69 0 0 1-.69-.69V4.6a.69.69 0 0 1 .69-.69h5.75c.38 0 .69.3.69.69v6.05z"/></svg>,
  freshdesk: <svg viewBox="0 0 24 24" fill="currentColor" className="size-5 text-[#12344D]"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.07 17.525c-3.13-.36-5.59-2.935-5.59-6.175 0-3.41 2.765-6.175 6.175-6.175 1.48 0 2.845.525 3.915 1.39l-1.525 1.525a4.01 4.01 0 0 0-2.39-.785c-2.22 0-4.025 1.805-4.025 4.025 0 2.05 1.545 3.75 3.535 3.99v2.205zm5.72-2.12a8.21 8.21 0 0 1-3.6 2.02v-2.205c1.07-.375 1.95-1.12 2.52-2.06l1.635 1.41a6.08 6.08 0 0 0 1.135-1.575l-1.69-1.395v.005a4 4 0 0 0-.255-4.3l1.545-1.545a6.04 6.04 0 0 1 1.055 3.395c0 2.37-1.36 4.41-3.34 5.4v-.005z"/></svg>,
  confluence: <svg viewBox="0 0 24 24" fill="currentColor" className="size-5 text-[#172B4D]"><path d="M19.16 3.12A11.75 11.75 0 0 0 12 0a11.75 11.75 0 0 0-7.16 3.12L0 8.01l12 7.04 12-7.04-4.84-4.89zM12 24a11.75 11.75 0 0 0 7.16-3.12L24 15.99 12 8.95 0 15.99l4.84 4.89A11.75 11.75 0 0 0 12 24z"/></svg>,
  notion: <svg viewBox="0 0 24 24" fill="currentColor" className="size-5"><path d="M4.6 2.6L20 4v16L4.6 18.6V2.6zm2.4 3.7v10l9.6 1.3v-10l-9.6-1.3z"/></svg>,
  github: <svg viewBox="0 0 24 24" fill="currentColor" className="size-5"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>,
};

const AVATAR_EMOJIS = ["🤖","🦾","⚙️","🧠","🔬","🛠️","🚀","⚡","🔮","🎯","🌐","💡","🦊","🐉","🦅","🦁","🐺","🦋","🌊","🔥","👑","🎭","🎪","🏆","💎","🌟","🎸","🧬","🔭"];
const TT_EMOJIS = ["✅","🐛","✨","📅","📌","💡","🔧","🔥","💬","📈","🎨","🧪","🚀","⚙️","📝"];
const AVATAR_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#06b6d4","#ef4444","#3b82f6","#84cc16","#f97316"];
// High contrast dark colors for labels with white text
const LABEL_COLORS = ["#1e3a8a", "#064e3b", "#450a0a", "#4a044e", "#0f172a", "#312e81", "#14532d", "#831843", "#7f1d1d", "#4c1d95", "#065f46", "#b45309"];

// ── Types ─────────────────────────────────────────────────────────────────────

type IntegrationProvider = keyof typeof SVGS;

interface Integration {
  id?: string; provider: IntegrationProvider; apiKey?: string; metadata?: Record<string, any>;
}

interface Capability {
  id: string; name: string; identifier: string; instructions: string;
  inputsDescription: string | null; expectedOutputsDescription: string | null;
  tasksWorkflow: string[] | null; isEnabled: boolean; scheduleConfig: Record<string, any> | null;
  assignedAgentId: string | null; assignedRole: string | null; isFavorite: boolean;
}


const ALL_INTEGRATIONS: { key: IntegrationProvider; label: string; icon: React.ReactNode; category: string }[] = [
  { key: "linear", label: "Linear", icon: SVGS.linear, category: "Project Management" },
  { key: "jira", label: "Jira", icon: SVGS.jira, category: "Project Management" },
  { key: "trello", label: "Trello", icon: SVGS.trello, category: "Project Management" },
  { key: "github", label: "GitHub", icon: SVGS.github, category: "Version Control" },
  { key: "notion", label: "Notion", icon: SVGS.notion, category: "Documentation" },
  { key: "confluence", label: "Confluence", icon: SVGS.confluence, category: "Documentation" },
  { key: "freshdesk", label: "Freshdesk", icon: SVGS.freshdesk, category: "Customer Support" },
];

const TIMEZONES = Intl.supportedValuesOf('timeZone');

// ── Sub-components ───────────────────────────────────────────────────────────

function TimezoneCombobox({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = TIMEZONES.filter(tz => tz.toLowerCase().includes(query.toLowerCase())).slice(0, 50);

  return (
    <div ref={ref} className="relative w-full">
      <div 
        onClick={() => setOpen(true)} 
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background cursor-pointer"
      >
        <span>{value || "Select Timezone..."}</span>
        <ChevronDown className="size-4 opacity-50" />
      </div>
      {open && (
        <div className="absolute top-11 z-50 w-full rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in zoom-in-95">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 size-4 shrink-0 opacity-50" />
            <input 
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" 
              placeholder="Search timezone..." 
              value={query} onChange={e => setQuery(e.target.value)} autoFocus 
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? <div className="py-6 text-center text-sm">No timezone found.</div> : null}
            {filtered.map(tz => (
              <div 
                key={tz} 
                onClick={() => { onChange(tz); setOpen(false); setQuery(""); }}
                className={cn("relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground", tz === value && "bg-accent text-accent-foreground font-medium")}
              >
                <Check className={cn("mr-2 size-4", tz === value ? "opacity-100" : "opacity-0")} />
                {tz}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AvatarPicker({ icon, color, onIconChange, onColorChange, onClose }: {
  icon: string; color: string; onIconChange: (i: string) => void; onColorChange: (c: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-border bg-card p-3 shadow-xl">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Emoji</p>
      <div className="mb-3 grid grid-cols-10 gap-1">
        {AVATAR_EMOJIS.map((e) => (
          <button key={e} type="button" onClick={() => { onIconChange(e); onClose(); }} className={cn("flex size-6 items-center justify-center rounded-lg text-sm transition-all hover:scale-110", icon === e && "ring-2 ring-primary ring-offset-1")}>{e}</button>
        ))}
      </div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Color</p>
      <div className="flex flex-wrap gap-1.5">
        {AVATAR_COLORS.map((c) => (
          <button key={c} type="button" onClick={() => { onColorChange(c); onClose(); }} style={{ background: c }} className={cn("size-5 rounded-full transition-transform hover:scale-110", color === c && "ring-2 ring-offset-2 ring-foreground scale-110")} />
        ))}
      </div>
    </div>
  );
}


function AIInsightsChat({ field, value, onApply, onClose }: { field: string, value: string, onApply: (val: string) => void, onClose: () => void }) {
  const [messages, setMessages] = useState<{role: 'ai'|'user', content: string}[]>([
    { role: 'ai', content: field === 'mission' ? 'What outcome should this team create for the customer or business?' : 'How should this team make decisions, communicate progress, and handle quality?' }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  
  const handleSend = () => {
    if (!input.trim()) return;
    setMessages(p => [...p, { role: 'user', content: input }]);
    setInput("");
    setIsTyping(true);
    
    setTimeout(() => {
      let suggestion = "";
      if (field === 'mission') suggestion = `To continuously deliver highly reliable, scalable, and user-centric features related to ${input}, fostering a culture of innovation.`;
      else suggestion = `1. Async-first communication regarding ${input}. 2. Code reviews within 24h. 3. Blameless post-mortems for any incident.`;
      setMessages(p => [...p, { role: 'ai', content: suggestion }]);
      setIsTyping(false);
    }, 1200);
  };

  return (
    <div className="absolute right-0 top-10 z-30 w-80 rounded-2xl border border-border bg-card shadow-xl overflow-hidden flex flex-col">
      <div className="bg-primary/5 px-4 py-2 border-b flex justify-between items-center">
        <span className="text-xs font-semibold text-primary flex items-center gap-1"><Wand2 className="size-3"/> AI Assistant</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-3"/></button>
      </div>
      <div className="p-4 flex-1 max-h-60 overflow-y-auto space-y-3 text-sm">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex flex-col", m.role === 'ai' ? "items-start" : "items-end")}>
            <div className={cn("px-3 py-2 rounded-2xl max-w-[90%]", m.role === 'ai' ? "bg-muted/50 text-foreground" : "bg-primary text-primary-foreground")}>
              {m.content}
            </div>
            {m.role === 'ai' && i > 0 && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs mt-1 text-primary" onClick={() => onApply(m.content)}>Insert</Button>
            )}
          </div>
        ))}
        {isTyping && <div className="text-xs text-muted-foreground italic flex items-center gap-1"><Loader2 className="size-3 animate-spin"/> AI is thinking...</div>}
      </div>
      <div className="p-2 border-t bg-muted/20 flex gap-2">
        <Input size={1} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Reply..." className="h-8 text-xs" />
        <Button size="icon" className="h-8 w-8" onClick={handleSend}><Send className="size-3"/></Button>
      </div>
    </div>
  );
}

function IntegrationConfig({ providerKey, integration, onSave }: { providerKey: string, integration?: Integration, onSave: (data: Partial<Integration>) => Promise<void> }) {
  const isConfigured = providerKey === "github" ? !!integration?.metadata?.appId : !!integration?.apiKey;
  const [isEditing, setIsEditing] = useState(!isConfigured);
  
  const [appId, setAppId] = useState(integration?.metadata?.appId || "");
  const [installationId, setInstallationId] = useState(integration?.metadata?.installationId || "");
  const [apiKey, setApiKey] = useState(integration?.apiKey || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    if (providerKey === "github") {
      await onSave({ apiKey, metadata: { ...integration?.metadata, appId, installationId } });
    } else {
      await onSave({ apiKey });
    }
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setAppId(integration?.metadata?.appId || "");
    setInstallationId(integration?.metadata?.installationId || "");
    setApiKey(integration?.apiKey || "");
  };

  if (providerKey === "github") {
    if (!isEditing && isConfigured) {
      return (
        <div className="flex items-center">
          <Button variant="link" size="sm" onClick={() => setIsEditing(true)} className="h-auto p-0 text-primary">
            <Edit2 className="size-3 mr-1" /> Edit GitHub Configuration
          </Button>
        </div>
      );
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">App ID</label>
          <Input value={appId} onChange={e => setAppId(e.target.value)} placeholder="123456" autoComplete="off" className="font-mono" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Installation ID</label>
          <Input value={installationId} onChange={e => setInstallationId(e.target.value)} placeholder="78901234" autoComplete="off" className="font-mono" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Private Key (PEM)</label>
          <textarea value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="-----BEGIN RSA PRIVATE KEY-----..." className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]" autoComplete="off" />
        </div>
        <div className="sm:col-span-2 flex justify-start gap-2 mt-2">
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            Save Configuration
          </Button>
          {isConfigured && (
            <Button variant="ghost" onClick={handleCancel} size="sm">
              Cancel
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!isEditing && isConfigured) {
    return (
      <div className="flex items-center">
        <Button variant="link" size="sm" onClick={() => { setApiKey(""); setIsEditing(true); }} className="h-auto p-0 text-primary">
          <Edit2 className="size-3 mr-1" /> Change Key
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-md">
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">API Token / Key</label>
      <div className="flex gap-2 items-start">
        <Input 
          type="text" 
          placeholder="Enter token to authenticate..." 
          value={apiKey} 
          onChange={e => setApiKey(e.target.value)} 
          autoComplete="off"
          data-1p-ignore
          className="flex-1 font-mono"
        />
        <Button onClick={handleSave} disabled={isSaving || !apiKey} size="default" className="shrink-0">
          {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
          Save
        </Button>
        {isConfigured && (
          <Button variant="ghost" onClick={handleCancel} size="default" className="shrink-0">
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function TeamSettingsPage() {
  const { token, isLoading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const teamId = String(params.id);

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"general" | "workflow" | "integrations">("general");

  // General Settings
  const [teamName, setTeamName] = useState("");
  const [icon, setIcon] = useState("");
  const [iconColor, setIconColor] = useState("#6366f1");
  const [timezone, setTimezone] = useState("UTC");
  const [mission, setMission] = useState("");
  const [waysOfWorking, setWaysOfWorking] = useState("");
  
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [activeAiChat, setActiveAiChat] = useState<"mission" | "waysOfWorking" | null>(null);

  // Workflow Settings
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [agents, setAgents] = useState<{id: string, name: string, type: string}[]>([]);

  const [showOnlyEnabled, setShowOnlyEnabled] = useState(false);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [capSearch, setCapSearch] = useState("");
  

  // Integrations Settings
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [enabledIntegrations, setEnabledIntegrations] = useState<Record<string, boolean>>({});

  // ── Data Fetching ───────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [teamRes, capRes, intRes, agentsRes] = await Promise.all([
        fetch(`${API_BASE}/teams/${teamId}`, { headers }),
        fetch(`${API_BASE}/teams/${teamId}/capabilities`, { headers }),
        fetch(`${API_BASE}/teams/${teamId}/integrations`, { headers }),
        fetch(`${API_BASE}/agents?teamId=${teamId}`, { headers })
      ]);

      if (teamRes.ok) {
        const d = await teamRes.json();
        setTeamName(d.data.name || "");
        setIcon(d.data.icon || "🚀");
        if (d.data.metadata?.iconColor) setIconColor(d.data.metadata.iconColor);
        setTimezone(d.data.metadata?.timezone || "UTC");
        setMission(d.data.mission || "");
        setWaysOfWorking(d.data.waysOfWorking || "");
      }
      if (capRes.ok) setCapabilities((await capRes.json()).data || []);

      if (agentsRes.ok) setAgents((await agentsRes.json()).data || []);
      if (intRes.ok) {
        const ints = (await intRes.json()).data || [];
        setIntegrations(ints);
        const en: Record<string, boolean> = {};
        ints.forEach((i: Integration) => { en[i.provider] = true; });
        setEnabledIntegrations(en);
      }
    } catch (err) { toast.error("Failed to load settings data."); } 
    finally { setIsLoading(false); }
  }, [teamId, token]);

  useEffect(() => {
    if (!authLoading) {
      if (!token) router.replace("/login");
      else fetchData();
    }
  }, [authLoading, token, fetchData, router]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const updateTeamField = async (field: string, value: any, isMeta = false) => {
    if (!token) return;
    try {
      const body = isMeta ? { metadata: { [field]: value } } : { [field]: value };
      const res = await fetch(`${API_BASE}/teams/${teamId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      if (res.ok) toast.success(`${field} updated`);
    } catch (e) { toast.error(`Failed to update ${field}`); }
  };

  const updateCapability = async (id: string, updates: Partial<Capability>) => {
    if (!token) return;
    try {
      const isNew = id === "new";
      const url = isNew ? `${API_BASE}/teams/${teamId}/capabilities` : `${API_BASE}/teams/${teamId}/capabilities/${id}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const saved = (await res.json()).data;
        if (isNew) setCapabilities([...capabilities, saved]);
        else setCapabilities(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
        toast.success(`Capability ${isNew ? 'created' : 'updated'}`);
      }
    } catch (e) { toast.error("Failed to save capability"); }
  };

  const saveIntegration = async (provider: IntegrationProvider, data: Partial<Integration>) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/teams/${teamId}/integrations/${provider}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const updated = await res.json();
        setIntegrations(prev => {
          const exists = prev.find(i => i.provider === provider);
          if (exists) return prev.map(i => i.provider === provider ? updated.data : i);
          return [...prev, updated.data];
        });
        toast.success("Integration saved", {
          description: "The integration has been configured and the agents are being notified so they can use the integration accordingly. It should be ready in a minute."
        });
      }
    } catch (e) { toast.error(`Failed to save integration`); }
  };

  const toggleIntegrationState = (provider: string, on: boolean) => {
    setEnabledIntegrations(p => ({ ...p, [provider]: on }));
  };


  // ── Render ──────────────────────────────────────────────────────────────────

  if (authLoading || isLoading) return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;

  const filteredCapabilities = capabilities.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(capSearch.toLowerCase()) || c.instructions.toLowerCase().includes(capSearch.toLowerCase());
    if (!matchesSearch) return false;
    
    if (showOnlyEnabled && !c.isEnabled) return false;
    if (showOnlyFavorites && !c.isFavorite) return false;

    return true;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <Link href={`/teams/${teamId}`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-3.5" /> Back to Team
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Team Settings</h1>
        <p className="mt-1 text-muted-foreground text-sm">Configure how this team works, what it can do, and which external tools it can access.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <nav className="flex md:w-64 shrink-0 flex-col gap-1">
          <button onClick={() => setActiveTab("general")} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", activeTab === "general" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <LayoutTemplate className="size-4" /> General
          </button>
          <button onClick={() => setActiveTab("workflow")} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", activeTab === "workflow" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <Briefcase className="size-4" /> Workflow
          </button>
          <button onClick={() => setActiveTab("integrations")} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", activeTab === "integrations" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <Globe className="size-4" /> Integrations
          </button>
        </nav>

        {/* Content Area */}
        <div className="flex-1 space-y-6 max-w-4xl pb-20">
          
          {/* GENERAL */}
          {activeTab === "general" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-6">
                <div><h2 className="text-lg font-semibold">Identity</h2><p className="text-sm text-muted-foreground">Basic information about the team.</p></div>
                <div className="flex gap-6 items-start">
                  <div className="relative pt-6">
                    <button type="button" onClick={() => setAvatarOpen(!avatarOpen)} className="flex size-16 items-center justify-center rounded-2xl text-3xl shadow-sm transition-all hover:scale-105 active:scale-95" style={{ background: iconColor + "22" }}>{icon}</button>
                    {avatarOpen && <AvatarPicker icon={icon} color={iconColor} onIconChange={i => {setIcon(i); updateTeamField('icon', i);}} onColorChange={c => {setIconColor(c); updateTeamField('iconColor', c, true);}} onClose={() => setAvatarOpen(false)} />}
                  </div>
                  <div className="flex-1 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Team Name</label>
                      <Input value={teamName} onChange={e => setTeamName(e.target.value)} onBlur={e => updateTeamField('name', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Timezone</label>
                      <TimezoneCombobox value={timezone} onChange={v => { setTimezone(v); updateTeamField('timezone', v, true); }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-6">
                <div><h2 className="text-lg font-semibold">Purpose & Practices</h2><p className="text-sm text-muted-foreground">Define the mission and ways of working for this team.</p></div>
                <div className="space-y-4">
                  <div className="space-y-1.5 relative">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium">Mission</label>
                      <Button variant="ghost" size="sm" onClick={() => setActiveAiChat('mission')} className="h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1"><Wand2 className="size-3" /> AI Insights</Button>
                    </div>
                    <textarea className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]" value={mission} onChange={e => setMission(e.target.value)} onBlur={e => updateTeamField('mission', e.target.value)} placeholder="What outcome should this team create?" />
                    {activeAiChat === 'mission' && <AIInsightsChat field="mission" value={mission} onApply={(v) => {setMission(v); updateTeamField('mission', v); setActiveAiChat(null);}} onClose={() => setActiveAiChat(null)} />}
                  </div>

                  <div className="space-y-1.5 relative">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium">Ways of Working</label>
                      <Button variant="ghost" size="sm" onClick={() => setActiveAiChat('waysOfWorking')} className="h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1"><Wand2 className="size-3" /> AI Insights</Button>
                    </div>
                    <textarea className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[120px]" value={waysOfWorking} onChange={e => setWaysOfWorking(e.target.value)} onBlur={e => updateTeamField('waysOfWorking', e.target.value)} placeholder="How should this team communicate?" />
                    {activeAiChat === 'waysOfWorking' && <AIInsightsChat field="waysOfWorking" value={waysOfWorking} onApply={(v) => {setWaysOfWorking(v); updateTeamField('waysOfWorking', v); setActiveAiChat(null);}} onClose={() => setActiveAiChat(null)} />}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* WORKFLOW */}
          {activeTab === "workflow" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-lg font-semibold">What this team can do</h2>
                    <p className="text-sm text-muted-foreground">Manage the active capabilities of your agents.</p>
                  </div>
                  <Link href={`/teams/${teamId}/settings/capabilities/wizard`}>
                    <Button>
                      <Plus className="size-4 mr-2" /> New Capability
                    </Button>
                  </Link>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="h-9 gap-2 text-muted-foreground w-full sm:w-auto justify-start shadow-sm">
                        <Filter className="size-3.5" />
                        Filters
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuLabel>Status</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem 
                        checked={showOnlyEnabled} 
                        onCheckedChange={setShowOnlyEnabled}
                      >
                        Only enabled capabilities
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Favorites</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem 
                        checked={showOnlyFavorites} 
                        onCheckedChange={setShowOnlyFavorites}
                      >
                        Only favorites
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="relative w-full sm:max-w-xs sm:ml-auto">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search capabilities..." className="pl-8 h-9" value={capSearch} onChange={e => setCapSearch(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2 border rounded-xl overflow-hidden bg-background">
                  {filteredCapabilities.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">No capabilities found matching your criteria.</div>
                  ) : filteredCapabilities.map(cap => (
                    <div key={cap.id} className={cn("flex items-center justify-between p-3 border-b last:border-b-0 transition-colors", cap.isEnabled ? "bg-card" : "bg-muted/40 opacity-80")}>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateCapability(cap.id, { isFavorite: !cap.isFavorite })}
                            className="text-muted-foreground hover:text-amber-500 transition-colors"
                          >
                            <Star className={cn("size-4", cap.isFavorite ? "fill-amber-500 text-amber-500" : "")} />
                          </button>
                          <span className="font-medium text-sm text-foreground">{cap.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground truncate max-w-lg">{cap.instructions}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <Link href={`/teams/${teamId}/settings/capabilities/${cap.id}`} className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"><Info className="size-3"/> Details</Link>
                        <label className="flex items-center cursor-pointer">
                          <div className="relative">
                            <input type="checkbox" className="sr-only" checked={cap.isEnabled} onChange={(e) => updateCapability(cap.id, { isEnabled: e.target.checked })} />
                            <div className={cn("block w-8 h-5 rounded-full transition-colors", cap.isEnabled ? "bg-primary" : "bg-muted-foreground/30")}></div>
                            <div className={cn("dot absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform", cap.isEnabled && "transform translate-x-3")}></div>
                          </div>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* INTEGRATIONS */}
          {activeTab === "integrations" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="rounded-xl border border-border bg-card shadow-sm p-6">
                <div><h2 className="text-lg font-semibold">Integrations</h2><p className="text-sm text-muted-foreground">Connect external services to give this team more context and tools.</p></div>
                
                {["Project Management", "Documentation", "Customer Support", "Version Control"].map(category => {
                  const categoryIntegrations = ALL_INTEGRATIONS.filter(i => i.category === category);
                  if (categoryIntegrations.length === 0) return null;
                  return (
                    <div key={category} className="mt-8">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">{category}</h3>
                      <div className="space-y-4">
                        {categoryIntegrations.map(provider => {
                          const integration = integrations.find(i => i.provider === provider.key);
                          const isConfigured = !!integration?.apiKey || (provider.key === 'github' && !!integration?.metadata?.appId);
                          const isToggledOn = enabledIntegrations[provider.key] || isConfigured;
                          
                          return (
                            <div key={provider.key} className={cn("border rounded-xl p-5 transition-colors", isToggledOn ? "bg-card" : "bg-muted/10")}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="flex size-10 items-center justify-center rounded-lg bg-background border shadow-sm text-foreground">{provider.icon}</div>
                                  <div>
                                    <h3 className="font-semibold">{provider.label}</h3>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  {isConfigured && <span className="text-xs font-medium text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-1 rounded-full flex items-center gap-1"><Check className="size-3"/> Configured</span>}
                                  <label className="flex items-center cursor-pointer">
                                    <div className="relative">
                                      <input type="checkbox" className="sr-only" checked={isToggledOn} onChange={(e) => toggleIntegrationState(provider.key, e.target.checked)} />
                                      <div className={cn("block w-10 h-6 rounded-full transition-colors", isToggledOn ? "bg-primary" : "bg-muted-foreground/30")}></div>
                                      <div className={cn("dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform", isToggledOn && "transform translate-x-4")}></div>
                                    </div>
                                  </label>
                                </div>
                              </div>

                              {isToggledOn && (
                                <div className="mt-5 pt-5 border-t animate-in slide-in-from-top-2 duration-200">
                                  <IntegrationConfig 
                                    providerKey={provider.key} 
                                    integration={integration} 
                                    onSave={async (data) => {
                                      await saveIntegration(provider.key, data);
                                    }} 
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
}
