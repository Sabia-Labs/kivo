"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Cpu, Minus, Plus, Search, Star, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────

type TeamType = {
  id: string;
  nameI18nKey: string;
  descriptionI18nKey: string;
  featured: boolean;
};

type AgentRole = {
  id: string;
  nameI18nKey: string;
  descriptionI18nKey: string;
  emoji: string;
  emojiBgColor: string;
  suggestedNameI18nKey: string;
};

type TeamTypeRole = {
  role: AgentRole;
  isLeader: boolean;
};



function QuantityControl({ value, onChange, id }: {
  value: number; onChange: (v: number) => void; id: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" id={`${id}-decrease`} disabled={value === 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed">
        <Minus className="size-3.5" />
      </button>
      <span className={cn("w-6 text-center text-sm font-semibold tabular-nums shrink-0", value > 0 ? "text-primary" : "text-muted-foreground")}>
        {value}
      </span>
      <button type="button" id={`${id}-increase`} disabled={value >= 10}
        onClick={() => onChange(Math.min(10, value + 1))}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed">
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({ step, steps }: { step: number; steps: string[] }) {
  return (
    <div className="mb-6 flex items-center justify-center gap-0">
      {steps.map((label, i) => {
        const idx      = i + 1;
        const isDone   = step > idx;
        const isCurrent = step === idx;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={cn(
                "flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                isDone    ? "border-primary bg-primary text-primary-foreground"
                : isCurrent ? "border-primary bg-background text-primary"
                : "border-border bg-background text-muted-foreground"
              )}>
                {isDone ? <Check className="size-4" /> : idx}
              </div>
              <span className={cn("text-xs font-medium", isCurrent ? "text-foreground" : "text-muted-foreground")}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn("mx-2 mb-5 h-px w-10 transition-colors", step > idx ? "bg-primary" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NewTeamPage() {
  const { token, workspaceId } = useAuth();
  const router      = useRouter();
  const { t } = useTranslation();
  
  const translate = useCallback((key: string) => {
    if (!key) return "";
    const parts = key.split(".");
    let current: any = t;
    for (const part of parts) {
      if (current[part] === undefined) return key;
      current = current[part];
    }
    return typeof current === "string" ? current : key;
  }, [t]);


  // Navigation State
  const [step, setStep] = useState(1);
  const stepLabels = ["Template", "Details", "Squad"];
  const [isCreating, setIsCreating] = useState(false);

  // Meta Data State
  const [teamTypes, setTeamTypes] = useState<TeamType[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFetchingTypes, setIsFetchingTypes] = useState(true);

  // Form State
  const [selectedType, setSelectedType] = useState<TeamType | null>(null);
  const [teamName, setTeamName] = useState("");
  const [identifierPrefix, setIdentifierPrefix] = useState("");

  // Roles State
  const [suggestedRoles, setSuggestedRoles] = useState<TeamTypeRole[]>([]);
  const [isFetchingRoles, setIsFetchingRoles] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [agentNames, setAgentNames] = useState<Record<string, string[]>>({});
  const [leaderId, setLeaderId] = useState<string | null>(null);

  // All Roles State (for searching and adding new ones)
  const [allRoles, setAllRoles] = useState<AgentRole[]>([]);
  const [showRoleSearch, setShowRoleSearch] = useState(false);
  const [roleSearchQuery, setRoleSearchQuery] = useState("");

  // 1. Fetch Team Types
  useEffect(() => {
    if (!token) return;
    const fetchTypes = async () => {
      setIsFetchingTypes(true);
      try {
        const url = new URL(`${API_BASE}/meta/team-types`, window.location.origin);
        if (searchQuery.trim()) url.searchParams.append("search", searchQuery.trim());
        const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!data.error) {
          setTeamTypes(data.data);
        } else {
          toast.error(data.error.message || "Failed to fetch team types");
        }
      } catch (err) {
        toast.error("Failed to fetch team types");
      } finally {
        setIsFetchingTypes(false);
      }
    };
    const debounce = setTimeout(fetchTypes, 300);
    return () => clearTimeout(debounce);
  }, [token, searchQuery]);

  // 2. Fetch Roles when Team Type is selected
  useEffect(() => {
    if (!token || !selectedType) return;
    const fetchRoles = async () => {
      setIsFetchingRoles(true);
      try {
        const res = await fetch(`${API_BASE}/meta/team-types/${selectedType.id}/roles`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.error) {
          const roles: TeamTypeRole[] = data.data;
          setSuggestedRoles(roles);

          // Initialize states
          const newQuantities: Record<string, number> = {};
          const newNames: Record<string, string[]> = {};
          let defaultLeader: string | null = null;

          roles.forEach((r) => {
            newQuantities[r.role.id] = 1;
            newNames[r.role.id] = [translate(r.role.suggestedNameI18nKey)];
            if (r.isLeader && !defaultLeader) {
              defaultLeader = `${r.role.id}-0`;
            }
          });

          setQuantities(newQuantities);
          setAgentNames(newNames);
          if (defaultLeader) setLeaderId(defaultLeader);
        }
      } catch (err) {
        toast.error("Failed to fetch team roles");
      } finally {
        setIsFetchingRoles(false);
      }
    };
    fetchRoles();
  }, [token, selectedType, translate]);

  const updateQuantity = useCallback((roleId: string, qty: number, role: AgentRole) => {
    setQuantities((prev) => ({ ...prev, [roleId]: qty }));
    setAgentNames((prev) => {
      const current = prev[roleId] || [];
      if (qty > current.length) {
        return {
          ...prev,
          [roleId]: [...current, ...Array(qty - current.length).fill(translate(role.suggestedNameI18nKey))]
        };
      }
      return { ...prev, [roleId]: current.slice(0, qty) };
    });
    
    // Ensure leader is still valid
    setLeaderId(prevLeader => {
      if (!prevLeader) return prevLeader;
      const [lRole, lIdxStr] = prevLeader.split("-");
      const lIdx = parseInt(lIdxStr, 10);
      if (lRole === roleId && lIdx >= qty) {
        return null; // Leader was removed
      }
      return prevLeader;
    });
  }, [translate]);

  const fetchAllRoles = async () => {
    if (!token) return;
    try {
      const url = new URL(`${API_BASE}/meta/agent-roles`, window.location.origin);
      if (roleSearchQuery.trim()) url.searchParams.append("search", roleSearchQuery.trim());
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!data.error) {
        setAllRoles(data.data);
      }
    } catch (err) {
      toast.error("Failed to fetch all roles");
    }
  };

  useEffect(() => {
    if (showRoleSearch) {
      const debounce = setTimeout(fetchAllRoles, 300);
      return () => clearTimeout(debounce);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRoleSearch, roleSearchQuery, token]);

  const addRoleToSquad = (role: AgentRole) => {
    if (!suggestedRoles.find(r => r.role.id === role.id)) {
      setSuggestedRoles([...suggestedRoles, { role, isLeader: false }]);
      setQuantities(prev => ({ ...prev, [role.id]: 1 }));
      setAgentNames(prev => ({ ...prev, [role.id]: [translate(role.suggestedNameI18nKey)] }));
    } else {
      const currentQty = quantities[role.id] || 0;
      updateQuantity(role.id, currentQty + 1, role);
    }
    setShowRoleSearch(false);
    setRoleSearchQuery("");
  };

  const totalAgents = Object.values(quantities).reduce((a, b) => a + b, 0);

  const handleNameChange = (val: string) => {
    setTeamName(val);
    const words = val.trim().split(/\\s+/).filter(Boolean);
    let prefix = "";
    if (words.length === 1) {
      prefix = words[0].substring(0, 3).toUpperCase();
    } else if (words.length === 2) {
      prefix = (words[0].charAt(0) + words[1].substring(0, 2)).toUpperCase();
    } else if (words.length >= 3) {
      prefix = words.slice(0, 3).map(w => w.charAt(0)).join("").toUpperCase();
    }
    setIdentifierPrefix(prefix);
  };

  const handleCreate = async () => {
    if (!teamName.trim()) { toast.error("Team name is required."); return; }
    if (!identifierPrefix.trim()) { toast.error("Identifier prefix is required."); return; }
    if (!workspaceId) { toast.error("Workspace context not found. Please log in again."); return; }
    if (!selectedType || !token) return;
    
    if (totalAgents === 0) {
      toast.error("You must include at least one agent in the team.");
      return;
    }
    if (!leaderId) {
      toast.error("You must designate a Leader for the team.");
      return;
    }

    // Build agents array
    const agentsToCreate: { name: string; roleId: string; isLeader: boolean }[] = [];
    suggestedRoles.forEach((r) => {
      const qty = quantities[r.role.id] || 0;
      for (let i = 0; i < qty; i++) {
        const agentKey = `${r.role.id}-${i}`;
        agentsToCreate.push({
          name: agentNames[r.role.id]?.[i] || translate(r.role.suggestedNameI18nKey),
          roleId: r.role.id,
          isLeader: agentKey === leaderAgentKey,
        });
      }
    });



    setIsCreating(true);
    try {
      const r = await fetch(`${API_BASE}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspaceId,
          name: teamName.trim(),
          identifierPrefix: identifierPrefix.toUpperCase(),
          templateId: selectedType.id,
          agents: agentsToCreate,
        }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        toast.error(err?.error?.message ?? "Failed to create team.");
        return;
      }
      const d = await r.json();
      toast.success("Team created!");
      router.push(`/teams/${d.data?.team?.id ?? d.data?.id}`);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const goNext = () => setStep((s) => Math.min(s + 1, 3) as 1 | 2 | 3);
  const goBack = () => {
    if (step === 1) { router.push("/teams"); return; }
    setStep((s) => (s - 1) as 1 | 2 | 3);
  };

  const featuredTypes = !searchQuery ? teamTypes.filter(t => t.featured) : [];

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-start justify-center bg-muted/20 px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo / Header */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Link href="/" className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <svg className="size-6" viewBox="0 0 24 24" fill="none">
              <path d="M6 17 L12 6 L18 17 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="6" cy="17" r="2" fill="currentColor" />
              <circle cx="12" cy="6" r="2" fill="currentColor" />
              <circle cx="18" cy="17" r="2" fill="currentColor" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Create a New Team</h1>
            <p className="mt-1 text-sm text-muted-foreground">Set up your agent team in a few steps.</p>
          </div>
        </div>

        {/* Stepper */}
        {step > 1 && <Stepper step={step} steps={stepLabels} />}

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">

          {/* ── Step 1: Template picker ── */}
          {step === 1 && (
            <div className="flex flex-col gap-6" id="newteam-step-1">
              <div>
                <h2 className="font-semibold text-foreground">Choose a template</h2>
                <p className="mt-1 text-sm text-muted-foreground">Pick a featured team or search for another type.</p>
              </div>

              {!searchQuery && featuredTypes.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Featured Templates</h3>
                  {featuredTypes.map((tmpl) => {
                    const isSelected = selectedType?.id === tmpl.id;
                    return (
                      <button key={tmpl.id}
                        type="button"
                        onClick={() => setSelectedType(tmpl)}
                        className={cn(
                          "flex items-center gap-4 rounded-xl border p-4 text-left transition-all",
                          isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"
                        )}>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-semibold", isSelected ? "text-foreground" : "text-muted-foreground")}>
                            {translate(tmpl.nameI18nKey)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{translate(tmpl.descriptionI18nKey)}</p>
                        </div>
                        {isSelected && <Check className="size-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {searchQuery ? "Search Results" : "Search other templates"}
                </h3>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search templates..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                {searchQuery && isFetchingTypes && (
                  <p className="text-sm text-muted-foreground text-center py-4">Searching...</p>
                )}
                {searchQuery && !isFetchingTypes && teamTypes.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No templates found.</p>
                )}
                
                {searchQuery && teamTypes.map((tmpl) => {
                  const isSelected = selectedType?.id === tmpl.id;
                  return (
                    <button key={tmpl.id}
                      type="button"
                      onClick={() => setSelectedType(tmpl)}
                      className={cn(
                        "flex items-center gap-4 rounded-xl border p-4 text-left transition-all",
                        isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"
                      )}>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-semibold", isSelected ? "text-foreground" : "text-muted-foreground")}>
                          {translate(tmpl.nameI18nKey)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{translate(tmpl.descriptionI18nKey)}</p>
                      </div>
                      {isSelected && <Check className="size-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2 mt-2 pt-4 border-t border-border">
                <Button type="button" variant="outline" className="flex-1" onClick={goBack}>
                  <ArrowLeft className="size-4 mr-1.5" /> Cancel
                </Button>
                <Button id="newteam-step1-next" type="button" className="flex-1 font-semibold"
                  disabled={!selectedType} onClick={goNext}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Team details ── */}
          {step === 2 && selectedType && (
            <div className="flex flex-col gap-4" id="newteam-step-2">
              <div>
                <h2 className="font-semibold text-foreground">
                  {translate(selectedType.nameI18nKey)} — Team Details
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Give your team a name and a short identifier prefix.
                </p>
              </div>

              {/* Team name and Prefix */}
              <div className="flex gap-4">
                <div className="flex flex-col gap-1.5 flex-1">
                  <label htmlFor="newteam-name" className="text-sm font-medium">Team name</label>
                  <Input id="newteam-name" value={teamName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Operations, Research, Platform…"
                    autoFocus />
                </div>
                <div className="flex flex-col gap-1.5 w-24">
                  <label htmlFor="newteam-prefix" className="text-sm font-medium">Prefix</label>
                  <Input id="newteam-prefix" value={identifierPrefix}
                    onChange={(e) => setIdentifierPrefix(e.target.value.toUpperCase())}
                    placeholder="ABC" maxLength={5} />
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <Button type="button" variant="outline" className="flex-1" onClick={goBack}>Back</Button>
                <Button id="newteam-step2-next" type="button" className="flex-1 font-semibold"
                  disabled={!teamName.trim() || !identifierPrefix.trim()} onClick={goNext}>
                  Next: Squad →
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Squad builder ── */}
          {step === 3 && selectedType && (
            <div className="flex flex-col gap-4" id="newteam-step-3">
              <div>
                <h2 className="font-semibold text-foreground">Configure Squad</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select the agents, set their names, and designate the team leader.
                </p>
              </div>

              {isFetchingRoles ? (
                <p className="text-sm text-muted-foreground py-4">Loading suggested roles...</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {suggestedRoles.map((ttr) => {
                    const role = ttr.role;
                    const qty = quantities[role.id] || 0;
                    const isSelected = qty > 0;

                    return (
                      <div key={role.id} id={`newteam-role-${role.id}`}
                        className={cn(
                          "flex flex-col gap-3 rounded-xl border p-4 transition-all",
                          isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background hover:border-primary/40 opacity-70"
                        )}>
                        <div className="flex items-center gap-4">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-sm"
                            style={{ backgroundColor: role.emojiBgColor }}
                          >
                            <span className="text-xl select-none">{role.emoji}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm font-semibold", isSelected ? "text-foreground" : "text-muted-foreground")}>
                              {translate(role.nameI18nKey)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{translate(role.descriptionI18nKey)}</p>
                          </div>
                          <QuantityControl id={`role-${role.id}`} value={qty}
                            onChange={(v) => updateQuantity(role.id, v, role)} />
                        </div>

                        {/* Name inputs inside the card */}
                        {qty > 0 && (
                          <div className="flex flex-col gap-2 mt-2 pt-3 border-t border-primary/10">
                            {Array.from({ length: qty }).map((_, i) => {
                              const uniqueId = `${role.id}-${i}`;
                              const isLeader = leaderId === uniqueId;
                              return (
                                <div key={i} className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-muted-foreground/70 w-5 text-right">{i + 1}.</span>
                                  <Input
                                    id={`agent-name-${uniqueId}`}
                                    value={agentNames[role.id]?.[i] ?? ""}
                                    onChange={(e) => {
                                      const newNames = [...(agentNames[role.id] || [])];
                                      newNames[i] = e.target.value;
                                      setAgentNames((prev) => ({ ...prev, [role.id]: newNames }));
                                    }}
                                    placeholder={`${translate(role.nameI18nKey)} name`}
                                    className="h-8 text-sm flex-1 bg-background"
                                  />
                                  <Button
                                    type="button"
                                    variant={isLeader ? "default" : "outline"}
                                    size="sm"
                                    className={cn("h-8 px-2.5", isLeader ? "bg-primary text-primary-foreground shadow-sm" : "bg-background")}
                                    onClick={() => setLeaderId(uniqueId)}
                                    title="Set as Leader"
                                  >
                                    <Star className={cn("h-4 w-4", isLeader && "fill-current text-amber-300")} />
                                    {isLeader && <span className="ml-1 text-xs font-semibold">Leader</span>}
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {suggestedRoles.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No roles added yet.</p>
                  )}

                  {/* Search and add other roles */}
                  <div className="mt-2 flex flex-col gap-3">
                    {!showRoleSearch ? (
                      <Button variant="outline" type="button" onClick={() => setShowRoleSearch(true)} className="border-dashed h-12 text-muted-foreground hover:text-foreground">
                        <Plus className="h-4 w-4 mr-2" /> Add another role
                      </Button>
                    ) : (
                      <div className="rounded-xl border border-border p-4 bg-muted/30">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold">Search Roles</h4>
                          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setShowRoleSearch(false)}>Cancel</Button>
                        </div>
                        <div className="relative mb-3">
                          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Type to search..."
                            className="pl-9 bg-background h-9 text-sm"
                            value={roleSearchQuery}
                            onChange={(e) => setRoleSearchQuery(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
                          {allRoles.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">No roles found.</p>
                          )}
                          {allRoles.map((role) => (
                            <button
                              key={role.id}
                              type="button"
                              onClick={() => addRoleToSquad(role)}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent text-left transition-colors"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm" style={{ backgroundColor: role.emojiBgColor }}>
                                {role.emoji}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{translate(role.nameI18nKey)}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{translate(role.descriptionI18nKey)}</p>
                              </div>
                              <Plus className="h-4 w-4 text-muted-foreground" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Total summary */}
              <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 flex items-center justify-between mt-2">
                <span className="text-sm text-muted-foreground font-medium">Total squad size</span>
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-primary" />
                  <span className="text-sm font-bold text-primary">{totalAgents} agents</span>
                </div>
              </div>
              
              {!leaderId && totalAgents > 0 && (
                 <p className="text-xs text-destructive font-medium text-center">Please select a Leader for the team.</p>
              )}

              <div className="flex gap-2 mt-4">
                <Button type="button" variant="outline" className="flex-1" onClick={goBack}>Back</Button>
                <Button id="newteam-launch-engineering" type="button" className="flex-1 font-semibold"
                  disabled={isCreating || totalAgents === 0 || !leaderId} onClick={handleCreate}>
                  {isCreating ? "Creating…" : "🚀 Launch Team"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Back to teams link */}
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Changed your mind?{" "}
          <Link href="/teams" id="newteam-cancel" className="font-medium text-primary hover:underline">
            Back to My Teams
          </Link>
        </p>
      </div>
    </div>
  );
}
