"use client";

import { useState, useEffect } from "react";
import { useTranslation, languages } from "@/lib/i18n";
import { useAuth, API_BASE } from "@/lib/auth";
import { Settings, Globe, Shield, BrainCircuit, ExternalLink, Cpu, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";

const PLAN_PRESETS = {
  free: {
    leader: { model: "qwen3:8b", provider: "local", cost: 0.1 },
    executor: { model: "qwen2.5-coder:1.5b", provider: "local", cost: 0.1 }
  },
  basic: {
    leader: { model: "gpt-5.4-mini", provider: "openai", cost: 0.5 },
    executor: { model: "gemini-1.5-flash", provider: "gemini", cost: 0.5 }
  },
  pro: {
    leader: { model: "gpt-5.5", provider: "openai", cost: 2.0 },
    executor: { model: "claude-3-5-sonnet-latest", provider: "anthropic", cost: 3.0 }
  }
};

export default function SettingsPage() {
  const { t, lang, setLang } = useTranslation();
  const { user, token, workspaceId } = useAuth();
  
  const [dbModels, setDbModels] = useState<{ id: string; name: string; provider: string }[]>([]);

  const [leaderLlmMode, setLeaderLlmMode] = useState<"platform" | "byok">("platform");
  const [leaderLlmProvider, setLeaderLlmProvider] = useState<string>("openai");
  const [leaderLlmModel, setLeaderLlmModel] = useState<string>("gpt-5.4-mini");
  const [leaderApiKey, setLeaderApiKey] = useState<string>("");

  const [executorLlmMode, setExecutorLlmMode] = useState<"platform" | "byok">("platform");
  const [executorLlmProvider, setExecutorLlmProvider] = useState<string>("openai");
  const [executorLlmModel, setExecutorLlmModel] = useState<string>("gpt-5.4-mini");
  const [executorApiKey, setExecutorApiKey] = useState<string>("");

  const [existingKeys, setExistingKeys] = useState<Record<string, boolean>>({});

  const [aiCreditsLimit, setAiCreditsLimit] = useState(10);
  const [aiCreditsUsed, setAiCreditsUsed] = useState(0);
  const [workspaceTier, setWorkspaceTier] = useState("free");

  useEffect(() => {
    if (workspaceId && token) {
      Promise.all([
        fetch(`${API_BASE}/workspaces/${workspaceId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch(`${API_BASE}/workspaces/${workspaceId}/llm-keys`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch(`${API_BASE}/workspaces/${workspaceId}/available-models`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
      ]).then(([wsData, keysData, modelsData]) => {
        let loadedModels: any[] = [];
        if (!modelsData.error && Array.isArray(modelsData.data)) {
          loadedModels = modelsData.data;
          setDbModels(loadedModels);
        }

        if (!keysData.error && Array.isArray(keysData.data)) {
          const keyMap: Record<string, boolean> = {};
          keysData.data.forEach((k: any) => {
            if (k.provider) keyMap[k.provider] = true;
          });
          setExistingKeys(keyMap);
        }

        if (!wsData.error && wsData.data) {
          const ws = wsData.data;
          setLeaderLlmMode(ws.leaderLlmMode || "platform");
          setExecutorLlmMode(ws.executorLlmMode || "platform");
          
          const leaderModel = ws.plannerLlmModel || "gpt-5.4-mini";
          const execModel = ws.executorLlmModel || "gpt-5.4-mini";
          
          setLeaderLlmModel(leaderModel);
          setExecutorLlmModel(execModel);

          const leaderModelObj = loadedModels.find(m => m.id === leaderModel);
          setLeaderLlmProvider(leaderModelObj ? leaderModelObj.provider : "openai");

          const execModelObj = loadedModels.find(m => m.id === execModel);
          setExecutorLlmProvider(execModelObj ? execModelObj.provider : "openai");

          setAiCreditsLimit(ws.aiCreditsLimit || 10);
          setAiCreditsUsed(ws.aiCreditsUsed || 0);
          setWorkspaceTier(ws.tier || "free");
        }
      }).catch(console.error);
    }
  }, [workspaceId, token]);

  const isBothByok = leaderLlmMode === "byok" && executorLlmMode === "byok";
  const creditPercent = Math.min(100, (aiCreditsUsed / aiCreditsLimit) * 100);

  const currentTier = (workspaceTier || "free") as keyof typeof PLAN_PRESETS;
  const presetsForTier = PLAN_PRESETS[currentTier] || PLAN_PRESETS.free;
  const leaderPreset = presetsForTier.leader;
  const executorPreset = presetsForTier.executor;

  const byokProviders = Array.from(new Set(dbModels.map((m: any) => m.provider).filter(p => p && p !== "local")));
  const formatProviderName = (p: string) => {
    const names: Record<string, string> = {
      openai: "OpenAI",
      gemini: "Google Gemini",
      anthropic: "Anthropic Claude",
      deepseek: "DeepSeek",
      moonshot: "Moonshot Kimi",
      qwen: "Qwen (Alibaba)",
      zhipu: "Zhipu AI",
    };
    return names[p] || p.charAt(0).toUpperCase() + p.slice(1);
  };

  const getModelOptions = (provider: string) => {
    return dbModels
      .filter((m: any) => m.provider === provider)
      .map((m: any) => ({ id: m.id, name: m.name || m.id }));
  };

  const getPlatformModelOptions = () => {
    const allowedTiers = (() => {
      const wTier = workspaceTier || "free";
      if (wTier === "pro") return ["free", "standard", "basic", "premium", "pro"];
      if (wTier === "basic") return ["free", "standard", "basic"];
      return ["free"]; 
    })();

    return dbModels
      .filter((m: any) => allowedTiers.includes(m.tier))
      .map((m: any) => ({ id: m.id, name: m.name || m.id, provider: m.provider, cost: m.costPerCall }));
  };

  const handleSaveModels = async () => {
    if (!workspaceId || !token) return;

    if (leaderLlmMode === "byok") {
      if (!byokProviders.includes(leaderLlmProvider)) {
        toast.error("Invalid provider for Planner in BYOK mode.");
        return;
      }
      if (!existingKeys[leaderLlmProvider] && !leaderApiKey) {
        toast.error(`Please enter an API Key for ${formatProviderName(leaderLlmProvider)} (Planner).`);
        return;
      }
      if (!leaderLlmModel) {
        toast.error("Please select a model for the Planner.");
        return;
      }
    } else {
      if (!leaderLlmModel) {
        toast.error("Please select a Kivo Preset Model for the Planner.");
        return;
      }
    }

    if (executorLlmMode === "byok") {
      if (!byokProviders.includes(executorLlmProvider)) {
        toast.error("Invalid provider for Executor in BYOK mode.");
        return;
      }
      if (!existingKeys[executorLlmProvider] && !executorApiKey) {
        toast.error(`Please enter an API Key for ${formatProviderName(executorLlmProvider)} (Executor).`);
        return;
      }
      if (!executorLlmModel) {
        toast.error("Please select a model for the Executor.");
        return;
      }
    } else {
      if (!executorLlmModel) {
        toast.error("Please select a Kivo Preset Model for the Executor.");
        return;
      }
    }

    try {
      const payload: any = {
        leaderLlmMode,
        executorLlmMode,
      };

      payload.leaderLlmProvider = leaderLlmProvider;
      payload.plannerLlmModel = leaderLlmModel;
      if (leaderLlmMode === "byok" && leaderApiKey) {
        payload.leaderApiKey = leaderApiKey;
      }

      payload.executorLlmProvider = executorLlmProvider;
      payload.executorLlmModel = executorLlmModel;
      if (executorLlmMode === "byok" && executorApiKey) {
        payload.executorApiKey = executorApiKey;
      }

      const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/models`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.error) {
        toast.success(t.systemSettings.modelsSavedToast || "Models successfully updated!");
        
        // Refresh existing keys if we saved new ones
        if (leaderApiKey || executorApiKey) {
          const keysRes = await fetch(`${API_BASE}/workspaces/${workspaceId}/llm-keys`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const keysData = await keysRes.json();
          if (!keysData.error && Array.isArray(keysData.data)) {
            const keyMap: Record<string, boolean> = {};
            keysData.data.forEach((k: any) => {
              if (k.provider) keyMap[k.provider] = true;
            });
            setExistingKeys(keyMap);
          }
          setLeaderApiKey("");
          setExecutorApiKey("");
        }

        if (data.data) {
          setWorkspaceTier(data.data.tier || "free");
          setAiCreditsLimit(data.data.aiCreditsLimit || 10);
          setAiCreditsUsed(data.data.aiCreditsUsed || 0);
        }
      } else {
        toast.error(data.error?.message || "Failed to update LLM configuration");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred");
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12 w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* ── HEADER ── */}
      <header className="flex flex-col gap-4 border-b pb-6 border-border/40">
        <div className="flex items-center gap-2">
          <Settings className="size-5 text-primary animate-spin-slow" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t.nav.settings}
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">
          {t.teamsPage.settings}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t.systemSettings.subtitle}
        </p>
      </header>

      {/* ── SETTINGS BOXES ── */}
      <div className="space-y-6">
        {/* ── LANG PREFERENCES ── */}
        <section className="rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border">
              <Globe className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">{t.systemSettings.langRegionTitle}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.systemSettings.langRegionDesc}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {languages.map((l) => {
              const isActive = lang === l.code;
              return (
                <button
                  key={l.code}
                  onClick={async () => {
                    setLang(l.code);
                    if (workspaceId && token) {
                      try {
                        await fetch(`${API_BASE}/workspaces/${workspaceId}/language`, {
                          method: "PUT",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                          },
                          body: JSON.stringify({ language: l.code })
                        });
                      } catch (err) {
                        console.error("Failed to sync language to workspace settings in DB", err);
                      }
                    }
                    toast.success(t.systemSettings.langChangedToast.replace("{label}", l.label));
                  }}
                  className={`flex items-center justify-between p-4 border rounded-xl bg-card hover:bg-accent/40 transition-all text-sm font-semibold ${
                    isActive
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg leading-none">{l.flag}</span>
                    <span>{l.label}</span>
                  </div>
                  {isActive && (
                    <span className="size-2 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── PLANS & SUBSCRIPTION ── */}
        <section className="rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border">
                <Shield className="size-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight">{t.systemSettings.plansTitle}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t.systemSettings.plansDesc}
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/pricing">
                {t.systemSettings.viewPlansButton} <ExternalLink className="ml-2 size-3" />
              </Link>
            </Button>
          </div>

          {/* AI Credits utilization bar */}
          {!isBothByok && (
            <div className="border-t pt-5 flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Shield className="size-4 text-primary" />
                  {t.systemSettings.dailyCreditsTitle || "Daily AI Credits Utilization"}
                </span>
                <span className="text-foreground font-mono">
                  {aiCreditsUsed.toFixed(1)} / {aiCreditsLimit} Credits
                </span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden border">
                <div 
                  className="h-full bg-primary transition-all duration-500 rounded-full" 
                  style={{ width: `${creditPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground italic">
                {t.systemSettings.dailyCreditsHelper || "Credits reset daily. Different models consume different amounts of credits per invocation based on their size and cost."}
              </p>
            </div>
          )}
        </section>

        {/* ── AGENT ROUTING & MODELS ── */}
        <section className="rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border">
              <BrainCircuit className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">{t.systemSettings.agentRoutingTitle || "Agent Capabilities & Routing"}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.systemSettings.agentRoutingDesc || "Configure the LLM models and API credentials for your workspace agents."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ── LEADER ROUTING ── */}
            <div className="space-y-4 rounded-lg border bg-muted/20 p-5 flex flex-col">
              <div>
                <h3 className="font-semibold text-sm">{t.systemSettings.leaderTitle || "Lead Agents / Planner"}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.systemSettings.leaderDesc || "Responsible for planning, orchestrating, and decision-making."}
                </p>
              </div>

              {/* Mode Toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg border text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setLeaderLlmMode("platform");
                    const validOptions = getPlatformModelOptions();
                    if (!validOptions.some((m: any) => m.id === leaderLlmModel)) {
                      setLeaderLlmModel(leaderPreset.model);
                    }
                  }}
                  className={`py-1.5 px-3 rounded-md transition-all ${
                    leaderLlmMode === "platform"
                      ? "bg-card shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Kivo Platform
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLeaderLlmMode("byok");
                    let prov = leaderLlmProvider;
                    if (!byokProviders.includes(prov)) {
                      prov = byokProviders[0] || "openai";
                      setLeaderLlmProvider(prov);
                    }
                    const modelBelongs = dbModels.some((m: any) => m.id === leaderLlmModel && m.provider === prov);
                    if (!modelBelongs) {
                      setLeaderLlmModel("");
                    }
                  }}
                  className={`py-1.5 px-3 rounded-md transition-all ${
                    leaderLlmMode === "byok"
                      ? "bg-card shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Use My Own Key (BYOK)
                </button>
              </div>

              {leaderLlmMode === "platform" ? (
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                      <span>{(t.systemSettings as any).kivoPresetModel || "Kivo Preset Model"}</span>
                      <span className="text-[10px] bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded capitalize">{workspaceTier || "free"} tier</span>
                    </label>
                    <select
                      value={leaderLlmModel}
                      onChange={(e) => {
                        const newModelId = e.target.value;
                        setLeaderLlmModel(newModelId);
                        const selected = dbModels.find((m: any) => m.id === newModelId);
                        if (selected) {
                           setLeaderLlmProvider(selected.provider);
                        }
                      }}
                      className="text-xs bg-background border rounded-lg p-2 focus:ring-1 focus:ring-primary outline-none"
                    >
                      <option value="" disabled>Select a model...</option>
                      {getPlatformModelOptions().map((m: any) => (
                        <option key={m.id} value={m.id}>
                          {m.name} • Cost: {m.cost} credits/call
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground">Provider</label>
                    <select
                      value={leaderLlmProvider}
                      onChange={(e) => {
                        const newProvider = e.target.value;
                        setLeaderLlmProvider(newProvider);
                        setLeaderLlmModel(dbModels.find((m: any) => m.provider === newProvider)?.id || "");
                      }}
                      className="text-xs bg-background border rounded-lg p-2 focus:ring-1 focus:ring-primary outline-none"
                    >
                      {byokProviders.map(p => (
                        <option key={p} value={p}>{formatProviderName(p)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                      <span>API Key</span>
                      {existingKeys[leaderLlmProvider] && (
                        <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">Configured</span>
                      )}
                    </label>
                    <input
                      type="password"
                      value={leaderApiKey}
                      onChange={(e) => setLeaderApiKey(e.target.value)}
                      placeholder={existingKeys[leaderLlmProvider] ? "•••••••• (Keep empty to reuse existing key)" : "Enter API Key"}
                      className="text-xs bg-background border rounded-lg p-2 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground">Model</label>
                    <select
                      value={leaderLlmModel}
                      onChange={(e) => setLeaderLlmModel(e.target.value)}
                      className="text-xs bg-background border rounded-lg p-2 focus:ring-1 focus:ring-primary outline-none"
                    >
                      <option value="" disabled>Select a model...</option>
                      {getModelOptions(leaderLlmProvider).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* ── EXECUTOR ROUTING ── */}
            <div className="space-y-4 rounded-lg border bg-muted/20 p-5 flex flex-col">
              <div>
                <h3 className="font-semibold text-sm">{t.systemSettings.executorTitle || "Team Members / Executors"}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.systemSettings.executorDesc || "Responsible for task execution and agent chat."}
                </p>
              </div>

              {/* Mode Toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg border text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setExecutorLlmMode("platform");
                    const validOptions = getPlatformModelOptions();
                    if (!validOptions.some((m: any) => m.id === executorLlmModel)) {
                      setExecutorLlmModel(executorPreset.model);
                    }
                  }}
                  className={`py-1.5 px-3 rounded-md transition-all ${
                    executorLlmMode === "platform"
                      ? "bg-card shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Kivo Platform
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExecutorLlmMode("byok");
                    let prov = executorLlmProvider;
                    if (!byokProviders.includes(prov)) {
                      prov = byokProviders[0] || "openai";
                      setExecutorLlmProvider(prov);
                    }
                    const modelBelongs = dbModels.some((m: any) => m.id === executorLlmModel && m.provider === prov);
                    if (!modelBelongs) {
                      setExecutorLlmModel("");
                    }
                  }}
                  className={`py-1.5 px-3 rounded-md transition-all ${
                    executorLlmMode === "byok"
                      ? "bg-card shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Use My Own Key (BYOK)
                </button>
              </div>

              {executorLlmMode === "platform" ? (
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                      <span>{(t.systemSettings as any).kivoPresetModel || "Kivo Preset Model"}</span>
                      <span className="text-[10px] bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded capitalize">{workspaceTier || "free"} tier</span>
                    </label>
                    <select
                      value={executorLlmModel}
                      onChange={(e) => {
                        const newModelId = e.target.value;
                        setExecutorLlmModel(newModelId);
                        const selected = dbModels.find((m: any) => m.id === newModelId);
                        if (selected) {
                           setExecutorLlmProvider(selected.provider);
                        }
                      }}
                      className="text-xs bg-background border rounded-lg p-2 focus:ring-1 focus:ring-primary outline-none"
                    >
                      <option value="" disabled>Select a model...</option>
                      {getPlatformModelOptions().map((m: any) => (
                        <option key={m.id} value={m.id}>
                          {m.name} • Cost: {m.cost} credits/call
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground">Provider</label>
                    <select
                      value={executorLlmProvider}
                      onChange={(e) => {
                        const newProvider = e.target.value;
                        setExecutorLlmProvider(newProvider);
                        setExecutorLlmModel(dbModels.find((m: any) => m.provider === newProvider)?.id || "");
                      }}
                      className="text-xs bg-background border rounded-lg p-2 focus:ring-1 focus:ring-primary outline-none"
                    >
                      {byokProviders.map(p => (
                        <option key={p} value={p}>{formatProviderName(p)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                      <span>API Key</span>
                      {existingKeys[executorLlmProvider] && (
                        <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">Configured</span>
                      )}
                    </label>
                    <input
                      type="password"
                      value={executorApiKey}
                      onChange={(e) => setExecutorApiKey(e.target.value)}
                      placeholder={existingKeys[executorLlmProvider] ? "•••••••• (Keep empty to reuse existing key)" : "Enter API Key"}
                      className="text-xs bg-background border rounded-lg p-2 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground">Model</label>
                    <select
                      value={executorLlmModel}
                      onChange={(e) => setExecutorLlmModel(e.target.value)}
                      className="text-xs bg-background border rounded-lg p-2 focus:ring-1 focus:ring-primary outline-none"
                    >
                      <option value="" disabled>Select a model...</option>
                      {getModelOptions(executorLlmProvider).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSaveModels}>
              Save Changes
            </Button>
          </div>
        </section>

      </div>
    </div>
  );
}
