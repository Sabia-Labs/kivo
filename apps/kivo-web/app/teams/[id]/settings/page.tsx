"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Trash2, Plus, Wand2, Check, Briefcase, 
  FileText, Globe, LayoutTemplate, Send, ChevronDown, CheckCircle2,
  X, Search, Edit2, Info, Star, Filter, Repeat
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
import { useTranslation } from "@/lib/i18n";

// ── Icons & SVGs ─────────────────────────────────────────────────────────────

const SVGS = {
  linear: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5"><path d="M4 12h16M12 4l8 8-8 8"/></svg>,
  jira: <svg viewBox="0 0 24 24" fill="currentColor" className="size-5 text-[#0052CC]"><path d="M11.53 2c0 2.4-1.97 4.35-4.35 4.35h-4.35v4.35c0 2.4-1.97 4.35-4.35 4.35v-8.7C-1.52 4.02 1.02 1.48 4.35 1.48h7.18V2zm10.87 8.7c0 2.4-1.97 4.35-4.35 4.35h-4.35v4.35c0 2.4-1.97 4.35-4.35 4.35v-8.7c0-2.4 1.97-4.35 4.35-4.35h8.7v4.35zM11.53 10.7c0 2.4-1.97 4.35-4.35 4.35H2.83v4.35c0 2.4 1.97 4.35 4.35 4.35h4.35V10.7z"/></svg>,
  trello: <svg viewBox="0 0 24 24" fill="currentColor" className="size-5 text-[#0079BF]"><path d="M2.7 0h18.6C22.78 0 24 1.22 24 2.7v18.6c0 1.48-1.22 2.7-2.7 2.7H2.7C1.22 24 0 22.78 0 21.3V2.7C0 1.22 1.22 0 2.7 0zm8.34 16.48c0 .38-.3.69-.69.69H4.6a.69.69 0 0 1-.69-.69V4.6a.69.69 0 0 1 .69-.69h5.75c.38 0 .69.3.69.69v11.88zm8.96-5.83c0 .38-.3.69-.69.69h-5.75a.69.69 0 0 1-.69-.69V4.6a.69.69 0 0 1 .69-.69h5.75c.38 0 .69.3.69.69v6.05z"/></svg>,
  freshdesk: <svg viewBox="0 0 24 24" fill="currentColor" className="size-5 text-[#12344D]"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.07 17.525c-3.13-.36-5.59-2.935-5.59-6.175 0-3.41 2.765-6.175 6.175-6.175 1.48 0 2.845.525 3.915 1.39l-1.525 1.525a4.01 4.01 0 0 0-2.39-.785c-2.22 0-4.025 1.805-4.025 4.025 0 2.05 1.545 3.75 3.535 3.99v2.205zm5.72-2.12a8.21 8.21 0 0 1-3.6 2.02v-2.205c1.07-.375 1.95-1.12 2.52-2.06l1.635 1.41a6.08 6.08 0 0 0 1.135-1.575l-1.69-1.395v.005a4 4 0 0 0-.255-4.3l1.545-1.545a6.04 6.04 0 0 1 1.055 3.395c0 2.37-1.36 4.41-3.34 5.4v-.005z"/></svg>,
  confluence: <svg viewBox="0 0 24 24" fill="currentColor" className="size-5 text-[#172B4D]"><path d="M19.16 3.12A11.75 11.75 0 0 0 12 0a11.75 11.75 0 0 0-7.16 3.12L0 8.01l12 7.04 12-7.04-4.84-4.89zM12 24a11.75 11.75 0 0 0 7.16-3.12L24 15.99 12 8.95 0 15.99l4.84 4.89A11.75 11.75 0 0 0 12 24z"/></svg>,
  notion: <svg viewBox="0 0 24 24" fill="currentColor" className="size-5"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/></svg>,
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
  id?: string;
  provider: IntegrationProvider;
  apiKey?: string;
  metadata?: Record<string, any>;
  role?: string;
  instructions?: string;
}

interface Capability {
  id: string; 
  name: string; 
  identifier: string; 
  instructions: string;
  inputsDescription: string | null; 
  expectedOutputsDescription: string | null;
  tasksWorkflow: string[] | null; 
  type: "task_template" | "workflow" | "human_approval" | "foreach";
  isEnabled: boolean; 
  scheduleConfig: Record<string, any> | null;
  assignedAgentId: string | null; 
  assignedRole: string | null; 
  isFavorite: boolean;
}

function NodeTypeBadge({ type }: { type: Capability["type"] }) {
  if (type === "human_approval") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
        👤 Human Approval
      </span>
    );
  }
  if (type === "foreach") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
        <Repeat className="size-3" /> Foreach Loop
      </span>
    );
  }
  if (type === "workflow") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
        🔀 Multi-step Flow
      </span>
    );
  }
  return null;
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
  const { t } = useTranslation();
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
        <span className="text-xs font-semibold text-primary flex items-center gap-1"><Wand2 className="size-3"/> {t.teamSettings.general.aiAssistant}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-3"/></button>
      </div>
      <div className="p-4 flex-1 max-h-60 overflow-y-auto space-y-3 text-sm">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex flex-col", m.role === 'ai' ? "items-start" : "items-end")}>
            <div className={cn("px-3 py-2 rounded-2xl max-w-[90%]", m.role === 'ai' ? "bg-muted/50 text-foreground" : "bg-primary text-primary-foreground")}>
              {m.content}
            </div>
            {m.role === 'ai' && i > 0 && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs mt-1 text-primary" onClick={() => onApply(m.content)}>{t.teamSettings.general.insert}</Button>
            )}
          </div>
        ))}
        {isTyping && <div className="text-xs text-muted-foreground italic flex items-center gap-1"><Loader2 className="size-3 animate-spin"/> {t.teamSettings.general.aiThinking}</div>}
      </div>
      <div className="p-2 border-t bg-muted/20 flex gap-2">
        <Input size={1} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder={t.teamSettings.general.reply} className="h-8 text-xs" />
        <Button size="icon" className="h-8 w-8" onClick={handleSend}><Send className="size-3"/></Button>
      </div>
    </div>
  );
}

const PROVIDER_ICONS: Record<IntegrationProvider, React.ReactNode> = {
  linear: SVGS.linear,
  jira: SVGS.jira,
  trello: SVGS.trello,
  freshdesk: SVGS.freshdesk,
  confluence: SVGS.confluence,
  notion: SVGS.notion,
  github: SVGS.github,
};

interface ExternalToolConfigSectionProps {
  role: string;
  integration?: Integration;
  onSave: (data: { provider: string; apiKey?: string; metadata?: any; instructions?: string }) => Promise<void>;
  teamIntegrations: Integration[];
  teamId: string;
  initialProvider?: string;
}

function ExternalToolConfigSection({
  role,
  integration,
  onSave,
  teamIntegrations,
  teamId,
  initialProvider,
}: ExternalToolConfigSectionProps) {
  const { t } = useTranslation();
  const isNotionConnected = teamIntegrations.some(i => i.provider === "notion");
  const [provider, setProvider] = useState<IntegrationProvider | "">(integration?.provider || (initialProvider as IntegrationProvider) || "");
  const [apiKey, setApiKey] = useState(integration?.apiKey || "");
  const [appId, setAppId] = useState(integration?.metadata?.appId || "");
  const [installationId, setInstallationId] = useState(integration?.metadata?.installationId || "");
  const [instructions, setInstructions] = useState(integration?.instructions || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setProvider(integration?.provider || (initialProvider as IntegrationProvider) || "");
    setApiKey(integration?.apiKey || "");
    setAppId(integration?.metadata?.appId || "");
    setInstallationId(integration?.metadata?.installationId || "");
    setInstructions(integration?.instructions || "");
  }, [integration, initialProvider]);

  const handleSave = async () => {
    if (!provider) {
      toast.error(t.teamSettings?.selectProvider || "Por favor, selecione um provedor.");
      return;
    }
    setIsSaving(true);
    try {
      const metadata = provider === "github" ? { appId, installationId } : undefined;
      await onSave({
        provider,
        apiKey,
        metadata,
        instructions,
      });
    } catch (e) {
      // Error is handled by caller
    } finally {
      setIsSaving(false);
    }
  };

  const activeProviderInfo = ALL_INTEGRATIONS.find(item => item.key === provider);

  // Filter integration list
  const filteredIntegrations = ALL_INTEGRATIONS.filter(item =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group by category
  const categories = Array.from(new Set(filteredIntegrations.map(item => item.category)));

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Provider Selector Control */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">
          {t.teamSettings?.providerLabel || "Provedor de Integração"}
        </label>
        
        {provider ? (
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-primary/20 bg-primary/5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-card border text-foreground shadow-sm shrink-0">
                {PROVIDER_ICONS[provider]}
              </span>
              <div>
                <span className="font-semibold text-sm block">{activeProviderInfo?.label}</span>
                <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">
                  {activeProviderInfo?.category}
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="text-xs h-8"
            >
              {t.agentPage?.model?.change || "Alterar"}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 w-full p-4 rounded-xl border border-dashed border-border/80 hover:border-primary/50 hover:bg-muted/30 text-sm font-medium transition-all text-muted-foreground hover:text-primary animate-pulse"
          >
            <Plus className="size-4" />
            <span>{t.teamSettings?.providersSelectPlaceholder || "Escolha uma integração..."}</span>
          </button>
        )}
      </div>

      {/* Integration Selection Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-start justify-between border-b pb-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {t.teamSettings?.selectProvider || "Selecionar Provedor"}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.teamSettings?.externalToolsDesc || "Configure e dê contexto sobre as ferramentas de apoio que os agentes devem usar."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setSearchQuery("");
                }}
                className="text-muted-foreground hover:text-foreground rounded-lg p-1 hover:bg-muted transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t.teamsPage?.fileSystem?.searchPlaceholder || "Buscar..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 w-full"
                autoFocus
              />
            </div>

            {/* Grid of integrations categorized */}
            <div className="flex-1 overflow-y-auto space-y-5 pr-1 py-1">
              {categories.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Nenhuma integração encontrada.
                </div>
              ) : (
                categories.map(category => {
                  const items = filteredIntegrations.filter(item => item.category === category);
                  return (
                    <div key={category} className="space-y-2">
                      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                        {category}
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {items.map(item => {
                          const isSelected = provider === item.key;
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => {
                                setProvider(item.key);
                                setIsModalOpen(false);
                                setSearchQuery("");
                              }}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-xl border text-sm font-medium transition-all text-left w-full",
                                isSelected
                                  ? "bg-primary/5 border-primary text-primary shadow-sm"
                                  : "bg-background border-border hover:bg-muted/50 text-foreground"
                              )}
                            >
                              <span className="flex size-8 items-center justify-center rounded-lg bg-card border text-foreground shadow-sm shrink-0">
                                {PROVIDER_ICONS[item.key]}
                              </span>
                              <span className="font-semibold">{item.label}</span>
                              {isSelected && <Check className="size-4 ml-auto text-primary" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="border-t pt-4 mt-4 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setIsModalOpen(false);
                  setSearchQuery("");
                }}
              >
                {t.teamsPage?.cancel || "Cancelar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Provider-specific inputs */}
      {provider && (
        <div className="space-y-4 pt-2">
          {provider === "github" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  App ID
                </label>
                <Input
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="Ex: 123456"
                  autoComplete="off"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Installation ID
                </label>
                <Input
                  value={installationId}
                  onChange={(e) => setInstallationId(e.target.value)}
                  placeholder="Ex: 78901234"
                  autoComplete="off"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Private Key (.pem)
                </label>
                <textarea
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="-----BEGIN RSA PRIVATE KEY-----..."
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[100px]"
                  autoComplete="off"
                />
              </div>
            </div>
          ) : provider === "notion" ? (
            isNotionConnected ? (
              <div className="flex items-center gap-3 rounded-md border border-primary/20 bg-primary/5 p-4">
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-primary">
                  <Check className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary">Notion OAuth Connected</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Seu time já está conectado ao Notion. Preencha as instruções abaixo e clique em Salvar.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 p-6 text-center">
                <span className="mb-4 flex size-10 items-center justify-center rounded-full bg-primary/10">
                  {SVGS.notion}
                </span>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Conectar ao Notion</h3>
                <p className="mb-6 max-w-sm text-xs text-muted-foreground">
                  A integração do Notion utiliza OAuth a nível de equipe. Clique abaixo para conectar.
                </p>
                <Button type="button" onClick={() => {
                  const redirectUrl = new URL(window.location.href);
                  redirectUrl.searchParams.set("tab", "integrations");
                  redirectUrl.searchParams.set("openRole", role);
                  redirectUrl.searchParams.set("openProvider", "notion");
                  const url = `${process.env.NEXT_PUBLIC_API_URL}/auth/notion?teamId=${teamId}&redirect=${encodeURIComponent(redirectUrl.toString())}`;
                  window.location.href = url;
                }} className="gap-2 font-semibold">
                  {SVGS.notion} Connect Notion
                </Button>
              </div>
            )
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t.teamSettings?.apiKeyLabel || "Chave de API / Token"}
              </label>
              <Input
                type="password"
                placeholder={t.teamSettings?.apiKeyPlaceholder || "Cole o token de autenticação aqui..."}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                data-1p-ignore
                className="font-mono text-sm"
              />
            </div>
          )}


          {/* Context / Instructions */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t.teamSettings?.instructionsLabel || "Instruções de Uso para este Papel"}
            </label>
            <textarea
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={
                provider === "linear"
                  ? t.teamSettings?.instructionsPlaceholderLinear
                  : provider === "notion"
                  ? t.teamSettings?.instructionsPlaceholderNotion
                  : provider === "github"
                  ? t.teamSettings?.instructionsPlaceholderGithub
                  : "Ex: Use esta integração para ler e atualizar as informações necessárias de forma segura."
              }
            />
            <p className="text-[10px] text-muted-foreground">
              {t.teamSettings?.instructionsDesc || "Estas instruções serão inseridas no prompt do agente para direcioná-lo no uso correto desta ferramenta."}
            </p>
          </div>

          {/* Action button */}
          <div className="pt-2 flex justify-start">
            <Button onClick={handleSave} disabled={isSaving} className="shadow-sm">
              {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              {t.teamSettings?.saveConfigButton || "Salvar Configuração"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function TeamSettingsPage() {
  const { token, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const teamId = String(params.id);

  const translate = useCallback((key: string) => {
    if (!key) return "";
    if (!key.includes(".")) return key; // Not a translation key
    const parts = key.split(".");
    let current: any = t;
    for (const part of parts) {
      if (!current || current[part] === undefined) return key;
      current = current[part];
    }
    return typeof current === "string" ? current : key;
  }, [t]);

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"general" | "workflow" | "integrations" | "danger">("general");
  const [openRoleParam, setOpenRoleParam] = useState<string>("");
  const [openProviderParam, setOpenProviderParam] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "general" || tab === "workflow" || tab === "integrations" || tab === "danger") {
        setActiveTab(tab);
      }
      setOpenRoleParam(params.get("openRole") || "");
      setOpenProviderParam(params.get("openProvider") || "");
    }
  }, []);

  const [team, setTeam] = useState<any>(null);

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

  // Danger Zone
  const [confirmName, setConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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
        setTeam(d.data);
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
        ints.forEach((i: any) => { 
          if (i.role) {
            en[i.role] = true; 
          }
        });
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const openRole = params.get("openRole");
          if (openRole) {
            en[openRole] = true;
          }
        }
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

  const saveIntegration = async (role: string, data: { provider: string; apiKey?: string; metadata?: any; instructions?: string }) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/teams/${teamId}/integrations/${encodeURIComponent(role)}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const responseData = await res.json();
        
        if (data.provider === "" || !data.provider) {
          setIntegrations(prev => prev.filter(i => i.role !== role));
          toast.success("Integration removed successfully.");
          return;
        }

        const updated = responseData.data;
        setIntegrations(prev => {
          const exists = prev.find(i => i.role === role);
          if (exists) return prev.map(i => i.role === role ? updated : i);
          return [...prev, updated];
        });
        toast.success("Integration saved successfully.");
      }
    } catch (e) { toast.error(`Failed to save integration`); }
  };

  const toggleIntegrationState = (role: string, on: boolean) => {
    setEnabledIntegrations(p => ({ ...p, [role]: on }));
  };

  const handleDeleteTeam = async () => {
    if (!token) return;
    if (confirmName !== teamName) {
      toast.error(t.teamSettings.dangerZone.confirmError);
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/teams/${teamId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        toast.success("Team permanently deleted.");
        router.replace("/teams");
      } else {
        const errorData = await res.json().catch(() => ({}));
        toast.error(errorData.message || "Failed to delete team.");
      }
    } catch (e) {
      toast.error("An unexpected error occurred during team deletion.");
    } finally {
      setIsDeleting(false);
    }
  };


  // ── Render ──────────────────────────────────────────────────────────────────

  if (authLoading || isLoading) return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;

  const filteredCapabilities = capabilities.filter(c => {
    const translatedName = translate(c.name);
    const translatedInstructions = translate(c.instructions);
    
    const matchesSearch = translatedName.toLowerCase().includes(capSearch.toLowerCase()) || 
                          translatedInstructions.toLowerCase().includes(capSearch.toLowerCase());
    
    if (!matchesSearch) return false;
    
    if (showOnlyEnabled && !c.isEnabled) return false;
    if (showOnlyFavorites && !c.isFavorite) return false;

    return true;
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12 w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* ── HEADER ── */}
      <header className="flex flex-col gap-3 border-b pb-6 border-border/40">
        <Link href={`/teams/${teamId}`} className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary hover:text-primary/80 transition-colors">
          <ArrowLeft className="size-3.5" /> {t.teamsPage.backToTeam}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight mt-1">{t.teamSettings.settingsTitle}</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {t.teamSettings.settingsSubtitle}
        </p>
      </header>

      {/* Tabs Menu */}
      <nav className="flex border-b border-border/40 gap-6">
        <button
          onClick={() => setActiveTab("general")}
          className={cn(
            "flex items-center gap-2 pb-4 text-sm font-semibold transition-all relative border-b-2 border-transparent -mb-px",
            activeTab === "general"
              ? "text-primary border-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <LayoutTemplate className="size-4" />
          <span>{t.teamSettings.tabs.general}</span>
        </button>
        <button
          onClick={() => setActiveTab("workflow")}
          className={cn(
            "flex items-center gap-2 pb-4 text-sm font-semibold transition-all relative border-b-2 border-transparent -mb-px",
            activeTab === "workflow"
              ? "text-primary border-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Briefcase className="size-4" />
          <span>{t.teamSettings.tabs.workflow}</span>
        </button>
        <button
          onClick={() => setActiveTab("integrations")}
          className={cn(
            "flex items-center gap-2 pb-4 text-sm font-semibold transition-all relative border-b-2 border-transparent -mb-px",
            activeTab === "integrations"
              ? "text-primary border-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Globe className="size-4" />
          <span>{t.teamSettings.tabs.integrations}</span>
        </button>
        <button
          onClick={() => setActiveTab("danger")}
          className={cn(
            "flex items-center gap-2 pb-4 text-sm font-semibold transition-all relative border-b-2 border-transparent -mb-px",
            activeTab === "danger"
              ? "text-red-500 border-red-500"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Trash2 className="size-4" />
          <span>{t.teamSettings.tabs.dangerZone}</span>
        </button>
      </nav>

      {/* Content Area */}
      <div className="space-y-6 max-w-5xl pb-20">
          
          {/* GENERAL */}
          {activeTab === "general" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-6">
                <div><h2 className="text-lg font-semibold">{t.teamSettings.general.identityTitle}</h2><p className="text-sm text-muted-foreground">{t.teamSettings.general.identityDesc}</p></div>
                <div className="flex gap-6 items-start">
                  <div className="relative pt-6">
                    <button type="button" onClick={() => setAvatarOpen(!avatarOpen)} className="flex size-16 items-center justify-center rounded-2xl text-3xl shadow-sm transition-all hover:scale-105 active:scale-95" style={{ background: iconColor + "22" }}>{icon}</button>
                    {avatarOpen && <AvatarPicker icon={icon} color={iconColor} onIconChange={i => {setIcon(i); updateTeamField('icon', i);}} onColorChange={c => {setIconColor(c); updateTeamField('iconColor', c, true);}} onClose={() => setAvatarOpen(false)} />}
                  </div>
                  <div className="flex-1 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">{t.teamSettings.general.teamName}</label>
                      <Input value={teamName} onChange={e => setTeamName(e.target.value)} onBlur={e => updateTeamField('name', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">{t.teamSettings.general.timezone}</label>
                      <TimezoneCombobox value={timezone} onChange={v => { setTimezone(v); updateTeamField('timezone', v, true); }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-6">
                <div><h2 className="text-lg font-semibold">{t.teamSettings.general.purposeTitle}</h2><p className="text-sm text-muted-foreground">{t.teamSettings.general.purposeDesc}</p></div>
                <div className="space-y-4">
                  <div className="space-y-1.5 relative">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium">{t.teamSettings.general.mission}</label>
                      <Button variant="ghost" size="sm" onClick={() => setActiveAiChat('mission')} className="h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1"><Wand2 className="size-3" /> {t.teamSettings.general.aiInsights}</Button>
                    </div>
                    <textarea className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]" value={mission} onChange={e => setMission(e.target.value)} onBlur={e => updateTeamField('mission', e.target.value)} placeholder={t.teamSettings.general.missionPlaceholder} />
                    {activeAiChat === 'mission' && <AIInsightsChat field="mission" value={mission} onApply={(v) => {setMission(v); updateTeamField('mission', v); setActiveAiChat(null);}} onClose={() => setActiveAiChat(null)} />}
                  </div>

                  <div className="space-y-1.5 relative">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium">{t.teamSettings.general.waysOfWorking}</label>
                      <Button variant="ghost" size="sm" onClick={() => setActiveAiChat('waysOfWorking')} className="h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1"><Wand2 className="size-3" /> {t.teamSettings.general.aiInsights}</Button>
                    </div>
                    <textarea className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[120px]" value={waysOfWorking} onChange={e => setWaysOfWorking(e.target.value)} onBlur={e => updateTeamField('waysOfWorking', e.target.value)} placeholder={t.teamSettings.general.waysOfWorkingPlaceholder} />
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
                    <h2 className="text-lg font-semibold">{t.teamSettings.workflow.title}</h2>
                    <p className="text-sm text-muted-foreground">{t.teamSettings.workflow.desc}</p>
                  </div>
                  <Link href={`/teams/${teamId}/settings/capabilities/wizard`}>
                    <Button>
                      <Plus className="size-4 mr-2" /> {t.teamSettings.workflow.newCapability}
                    </Button>
                  </Link>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="h-9 gap-2 text-muted-foreground w-full sm:w-auto justify-start shadow-sm">
                        <Filter className="size-3.5" />
                        {t.teamSettings.workflow.filters}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuLabel>{t.teamsPage.status}</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem 
                        checked={showOnlyEnabled} 
                        onCheckedChange={setShowOnlyEnabled}
                      >
                        {t.teamSettings.workflow.onlyEnabled}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>{t.teamsPage.favorites}</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem 
                        checked={showOnlyFavorites} 
                        onCheckedChange={setShowOnlyFavorites}
                      >
                        {t.teamSettings.workflow.onlyFavorites}
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="relative w-full sm:max-w-xs sm:ml-auto">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder={t.teamSettings.workflow.searchPlaceholder} className="pl-8 h-9" value={capSearch} onChange={e => setCapSearch(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2 border rounded-xl overflow-hidden bg-background">
                  {filteredCapabilities.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">{t.teamSettings.workflow.noCapsFound}</div>
                  ) : filteredCapabilities.map(cap => (
                    <div key={cap.id} className={cn("flex items-center justify-between p-3 border-b last:border-b-0 transition-colors", cap.isEnabled ? "bg-card" : "bg-muted/40 opacity-80")}>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => updateCapability(cap.id, { isFavorite: !cap.isFavorite })}
                            className="text-muted-foreground hover:text-amber-500 transition-colors"
                          >
                            <Star className={cn("size-4", cap.isFavorite ? "fill-amber-500 text-amber-500" : "")} />
                          </button>
                          <span className="font-medium text-sm text-foreground">{translate(cap.name)}</span>
                          <NodeTypeBadge type={cap.type} />
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Link href={`/teams/${teamId}/settings/capabilities/${cap.id}`} className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"><Info className="size-3"/> {t.teamSettings.workflow.details}</Link>
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
          {activeTab === "integrations" && (() => {
            const recommendedTools = team?.teamType?.externalTools || [];
            return (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold">{t.teamSettings?.externalToolsTitle || "Ferramentas Externas do Time"}</h2>
                    <p className="text-sm text-muted-foreground">{t.teamSettings?.externalToolsDesc || "Configure e dê contexto sobre as ferramentas de apoio que os agentes devem usar."}</p>
                  </div>

                  {recommendedTools.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground border rounded-xl border-dashed">
                      {t.teamSettings?.noRecommendedTools || "Nenhuma ferramenta recomendada registrada para o tipo de time deste workspace."}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {recommendedTools.map((tool: { role: string, description: string }) => {
                        const integration = integrations.find(i => i.role === tool.role);
                        const isToggledOn = enabledIntegrations[tool.role] || !!integration?.provider;

                        return (
                          <div key={tool.role} className={cn("border rounded-2xl p-6 transition-colors space-y-5", isToggledOn ? "bg-card shadow-sm border-primary/20" : "bg-muted/10 border-border/50")}>
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                                  <Briefcase className="size-4.5 text-primary/80" />
                                  {tool.role}
                                </h3>
                                <p className="text-xs text-muted-foreground max-w-xl">{tool.description}</p>
                              </div>
                              <label className="flex items-center cursor-pointer pt-1">
                                <div className="relative">
                                  <input 
                                    type="checkbox" 
                                    className="sr-only" 
                                    checked={isToggledOn} 
                                    onChange={async (e) => {
                                      const checked = e.target.checked;
                                      toggleIntegrationState(tool.role, checked);
                                      if (!checked && integration?.provider) {
                                        await saveIntegration(tool.role, { provider: "" });
                                      }
                                    }} 
                                  />
                                  <div className={cn("block w-10 h-6 rounded-full transition-colors", isToggledOn ? "bg-primary" : "bg-muted-foreground/30")}></div>
                                  <div className={cn("dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform", isToggledOn && "transform translate-x-4")}></div>
                                </div>
                              </label>
                            </div>

                            {isToggledOn && (
                              <div className="pt-4 border-t border-border/40">
                                <ExternalToolConfigSection
                                  role={tool.role}
                                  integration={integration}
                                  teamIntegrations={integrations}
                                  teamId={teamId}
                                  initialProvider={openRoleParam === tool.role ? openProviderParam : ""}
                                  onSave={async (data: { provider: string; apiKey?: string; metadata?: any; instructions?: string }) => {
                                    await saveIntegration(tool.role, data);
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* DANGER ZONE */}
          {activeTab === "danger" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 shadow-sm p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">{t.teamSettings.dangerZone.title}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t.teamSettings.dangerZone.subtitle}
                  </p>
                </div>

                <div className="rounded-xl border border-red-500/30 bg-card p-5 space-y-4 shadow-sm">
                  <div className="flex items-start gap-3.5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/30">
                      <Trash2 className="size-5 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-foreground">{t.teamSettings.dangerZone.deleteTitle}</h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {t.teamSettings.dangerZone.deleteDesc}
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 bg-muted/40 rounded-lg space-y-2 border border-border/40 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      <Info className="size-3.5 text-red-500" />
                      {t.teamSettings.dangerZone.resourcesRemovedTitle}
                    </p>
                    <ul className="list-disc list-inside space-y-1 pl-1">
                      {t.teamSettings.dangerZone.resourcesRemovedList.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      {t.teamSettings.dangerZone.confirmPrompt.replace("{teamName}", "")} <span className="font-mono font-bold text-foreground select-all bg-muted px-1.5 py-0.5 rounded border">{teamName}</span>
                    </label>
                    <Input 
                      placeholder={teamName}
                      value={confirmName} 
                      onChange={e => setConfirmName(e.target.value)} 
                      className="font-mono text-sm max-w-md focus-visible:ring-red-500"
                      disabled={isDeleting}
                      autoComplete="off"
                    />
                  </div>

                  <div className="flex justify-start pt-2">
                    <Button 
                      variant="destructive"
                      onClick={handleDeleteTeam}
                      disabled={confirmName !== teamName || isDeleting}
                      className="shadow-sm font-semibold transition-all animate-pulse"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="size-4 animate-spin mr-2" />
                          {t.teamSettings.dangerZone.deletingButton}
                        </>
                      ) : (
                        t.teamSettings.dangerZone.deleteButton
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
      </div>
      
    </div>
  );
}
