"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Puzzle, Search, Star, Loader2, ArrowRight, Repeat, ChevronDown, Filter, Pencil } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useAuth, API_BASE } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Capability {
  id: string;
  name: string;
  identifier: string;
  isEnabled: boolean;
  isFavorite: boolean;
  teamId: string;
  teamName?: string;
  teamIcon?: string;
  type: "task_template" | "workflow" | "human_approval" | "foreach";
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

interface TeamItem {
  id: string;
  name: string;
  icon?: string;
}

interface CapabilityFilterDropdownProps {
  teams: TeamItem[];
  selectedTeamIds: string[];
  onTeamChange: (ids: string[]) => void;
  selectedTypes: string[];
  onTypeChange: (types: string[]) => void;
}

function CapabilityFilterDropdown({
  teams,
  selectedTeamIds,
  onTeamChange,
  selectedTypes,
  onTypeChange
}: CapabilityFilterDropdownProps) {
  const { lang } = useTranslation();
  
  const types = [
    { key: "task_template", label: lang === "pt" ? "Template de Task" : lang === "zh" ? "任务模板" : "Task Template" },
    { key: "workflow", label: lang === "pt" ? "Fluxo Multi-step" : lang === "zh" ? "多步骤工作流" : "Multi-step Flow" },
    { key: "human_approval", label: lang === "pt" ? "Aprovação Humana" : lang === "zh" ? "人工审批" : "Human Approval" },
    { key: "foreach", label: lang === "pt" ? "Loop Foreach" : lang === "zh" ? "循环遍历" : "Foreach Loop" }
  ];

  const handleToggleTeam = (teamId: string) => {
    if (selectedTeamIds.includes(teamId)) {
      onTeamChange(selectedTeamIds.filter((id) => id !== teamId));
    } else {
      onTeamChange([...selectedTeamIds, teamId]);
    }
  };

  const handleToggleType = (typeKey: string) => {
    if (selectedTypes.includes(typeKey)) {
      onTypeChange(selectedTypes.filter((t) => t !== typeKey));
    } else {
      onTypeChange([...selectedTypes, typeKey]);
    }
  };

  const handleClearAll = () => {
    onTeamChange([]);
    onTypeChange([]);
  };

  const getLabel = () => {
    const activeFiltersCount = selectedTeamIds.length + selectedTypes.length;
    if (activeFiltersCount === 0) {
      return lang === "pt" ? "Filtrar por..." : lang === "zh" ? "筛选..." : "Filter by...";
    }
    return lang === "pt" ? `Filtros (${activeFiltersCount})` : lang === "zh" ? `筛选 (${activeFiltersCount})` : `Filters (${activeFiltersCount})`;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 shadow-xs border-dashed text-xs font-semibold">
          <Filter className="size-3.5 text-muted-foreground" />
          <span>{getLabel()}</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 max-h-[80vh] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
            {lang === "pt" ? "Filtros Ativos" : lang === "zh" ? "活动筛选" : "Active Filters"}
          </span>
          {(selectedTeamIds.length > 0 || selectedTypes.length > 0) && (
            <button
              onClick={(e) => {
                e.preventDefault();
                handleClearAll();
              }}
              className="text-[10px] text-primary hover:underline font-bold"
            >
              {lang === "pt" ? "Limpar" : lang === "zh" ? "清除" : "Clear"}
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* --- TEAMS SECTION --- */}
        <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider px-2 py-1">
          {lang === "pt" ? "Times" : lang === "zh" ? "团队" : "Teams"}
        </DropdownMenuLabel>
        {teams.length === 0 ? (
          <div className="py-2 px-3 text-xs text-muted-foreground italic">
            {lang === "pt" ? "Nenhum time" : lang === "zh" ? "没有团队" : "No teams"}
          </div>
        ) : (
          teams.map((team) => (
            <DropdownMenuCheckboxItem
              key={team.id}
              checked={selectedTeamIds.includes(team.id)}
              onCheckedChange={() => handleToggleTeam(team.id)}
              onSelect={(e) => e.preventDefault()}
            >
              <span className="mr-1.5">{team.icon || "🛡️"}</span>
              <span className="truncate">{team.name}</span>
            </DropdownMenuCheckboxItem>
          ))
        )}

        <DropdownMenuSeparator />

        {/* --- TYPES SECTION --- */}
        <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider px-2 py-1">
          {lang === "pt" ? "Tipos" : lang === "zh" ? "类型" : "Types"}
        </DropdownMenuLabel>
        {types.map((t) => (
          <DropdownMenuCheckboxItem
            key={t.key}
            checked={selectedTypes.includes(t.key)}
            onCheckedChange={() => handleToggleType(t.key)}
            onSelect={(e) => e.preventDefault()}
          >
            <span>{t.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function CapabilitiesPage() {
  const { token, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);

  // Persistent team filter state from localStorage
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("kivo_selected_team_ids");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const handleFilterChange = (ids: string[]) => {
    setSelectedTeamIds(ids);
    localStorage.setItem("kivo_selected_team_ids", JSON.stringify(ids));
  };

  useEffect(() => {
    if (authLoading) return;
    if (!token) return;

    // Fetch active teams first
    fetch(`${API_BASE}/teams/mine`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      }
    })
      .then((r) => r.json())
      .then(async (d) => {
        const teamsList: TeamItem[] = d.data ?? [];
        teamsList.sort((a, b) => a.name.localeCompare(b.name));
        setTeams(teamsList);
        const allCapabilities: Capability[] = [];
        
        // Fetch capabilities for each team in parallel
        await Promise.all(
          teamsList.map(async (team: TeamItem) => {
            try {
              const res = await fetch(
                `${API_BASE}/teams/${team.id}/capabilities`,
                {
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                  }
                }
              );
              if (res.ok) {
                const caps = (await res.json()).data ?? [];
                caps.forEach((c: any) => {
                  allCapabilities.push({
                    ...c,
                    teamId: team.id,
                    teamName: team.name,
                    teamIcon: team.icon
                  });
                });
              }
            } catch (err) {
              console.error(`Failed to load capabilities for team ${team.id}`, err);
            }
          })
        );
        
        setCapabilities(allCapabilities);
      })
      .catch(() => toast.error("Failed to load capabilities"))
      .finally(() => setIsLoading(false));
  }, [token, authLoading]);

  const toggleFavorite = async (cap: Capability) => {
    if (!token) return;
    try {
      const newFavoriteStatus = !cap.isFavorite;
      const res = await fetch(`${API_BASE}/teams/${cap.teamId}/capabilities/${cap.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isFavorite: newFavoriteStatus })
      });
      if (res.ok) {
        setCapabilities((prev) =>
          prev.map((c) => (c.id === cap.id ? { ...c, isFavorite: newFavoriteStatus } : c))
        );
        toast.success(newFavoriteStatus ? "Added to favorites" : "Removed from favorites");
      }
    } catch (err) {
      toast.error("Failed to update capability");
    }
  };

  const translateCapability = (name: string) => {
    if (!name) return "";
    if (name.includes(".")) {
      const parts = name.split(".");
      let current: any = t;
      for (const part of parts) {
        if (!current || current[part] === undefined) return name;
        current = current[part];
      }
      return typeof current === "string" ? current : name;
    }
    return name;
  };

  // Filter capabilities locally based on selectedTeamIds, selectedTypes and search query
  const filteredCapabilities = capabilities.filter((cap) => {
    // 1. Team filter
    if (selectedTeamIds.length > 0 && !selectedTeamIds.includes(cap.teamId)) {
      return false;
    }
    // 2. Type filter
    if (selectedTypes.length > 0 && !selectedTypes.includes(cap.type)) {
      return false;
    }
    // 3. Search query filter
    if (search.trim() !== "") {
      const query = search.toLowerCase();
      const translatedName = translateCapability(cap.name).toLowerCase();
      return (
        translatedName.includes(query) ||
        cap.identifier.toLowerCase().includes(query)
      );
    }
    return true;
  });

  interface TeamGroup {
    teamId: string;
    teamName: string;
    teamIcon: string;
    capabilities: Capability[];
  }

  // Group capabilities by team and sort
  const groupedCapabilities = (() => {
    const groupsMap: Record<string, TeamGroup> = {};
    
    filteredCapabilities.forEach((cap) => {
      const tId = cap.teamId;
      const tName = cap.teamName || "Other Team";
      const tIcon = cap.teamIcon || "🛡️";
      if (!groupsMap[tId]) {
        groupsMap[tId] = {
          teamId: tId,
          teamName: tName,
          teamIcon: tIcon,
          capabilities: []
        };
      }
      groupsMap[tId].capabilities.push(cap);
    });
    
    const groups = Object.values(groupsMap);
    
    // Sort teams alphabetically by teamName
    groups.sort((a, b) => a.teamName.localeCompare(b.teamName));
    
    // Sort capabilities within each team alphabetically by translated name
    groups.forEach((group) => {
      group.capabilities.sort((a, b) => {
        const nameA = translateCapability(a.name);
        const nameB = translateCapability(b.name);
        return nameA.localeCompare(nameB);
      });
    });
    
    return groups;
  })();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12 w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* ── HEADER ── */}
      <header className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between border-b pb-6 border-border/40">
        <div>
          <div className="flex items-center gap-2">
            <Puzzle className="size-5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              {t.nav.capabilities}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">
            {t.teamsPage.matchedCapability}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t.teamsPage.capabilitiesSubtitle}
          </p>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto shrink-0">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search capabilities..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-lg border border-border bg-card text-sm focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div className="flex gap-2">
            <CapabilityFilterDropdown
              teams={teams}
              selectedTeamIds={selectedTeamIds}
              onTeamChange={handleFilterChange}
              selectedTypes={selectedTypes}
              onTypeChange={setSelectedTypes}
            />
          </div>
        </div>
      </header>

      {/* ── CAPABILITIES SECTION ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredCapabilities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed rounded-2xl bg-muted/10">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
            <Puzzle className="size-8 text-muted-foreground/60" />
          </div>
          <h3 className="text-lg font-semibold tracking-tight">No capabilities found</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm">
            {selectedTeamIds.length > 0 || selectedTypes.length > 0 || search.trim() !== ""
              ? "Try adjusting your search criteria or team filter settings to view other capabilities."
              : "Set up agent capabilities inside your active team configuration settings."
            }
          </p>
          {(selectedTeamIds.length > 0 || selectedTypes.length > 0 || search.trim() !== "") ? (
            <Button onClick={() => { handleFilterChange([]); setSelectedTypes([]); setSearch(""); }} variant="outline">
              Clear Filters
            </Button>
          ) : (
            <Button asChild>
              <Link href="/teams">Go to Teams</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {groupedCapabilities.map((group) => (
            <div key={group.teamId} className="space-y-4 animate-in fade-in duration-300">
              {/* Team Section Header */}
              <div className="flex items-center gap-2 border-b pb-2 border-border/40">
                <span className="text-xl font-bold tracking-tight text-foreground">
                  <span className="mr-1.5">{group.teamIcon}</span>
                  {group.teamName}
                </span>
                <span className="text-xs font-semibold text-muted-foreground px-2 py-0.5 rounded-full bg-muted border">
                  {group.capabilities.length} {group.capabilities.length === 1 ? "capability" : "capabilities"}
                </span>
              </div>
              
              {/* Capabilities Grid */}
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                {group.capabilities.map((cap) => (
                  <div
                    key={cap.id}
                    className="group flex items-center justify-between rounded-2xl border bg-card p-4 hover:border-primary/30 transition-all shadow-sm hover:shadow-md relative"
                  >
                    <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                      {/* Title & Edit Icon */}
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground truncate text-base group-hover:text-primary transition-colors">
                          {translateCapability(cap.name)}
                        </h3>
                        <Link
                          href={`/teams/${cap.teamId}/settings/capabilities/${cap.id}`}
                          className="opacity-0 group-hover:opacity-100 transition-all duration-200 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                          title={t.teamsPage.editCapability}
                        >
                          <Pencil className="size-3.5" />
                        </Link>
                      </div>

                      {/* Capability Type Badge (below title) */}
                      {cap.type !== "task_template" && (
                        <div className="flex items-center">
                          <NodeTypeBadge type={cap.type} />
                        </div>
                      )}
                    </div>

                    {/* Star toggle & Arrow */}
                    <div className="flex items-center gap-3 shrink-0 pl-3">
                      <button
                        type="button"
                        onClick={() => toggleFavorite(cap)}
                        className="text-muted-foreground hover:text-amber-500 transition-colors cursor-pointer p-1"
                      >
                        <Star className={cn("size-4.5", cap.isFavorite ? "fill-amber-500 text-amber-500" : "")} />
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-primary opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0 hidden md:inline-block">
                          {t.teamsPage.useCapability}
                        </span>
                        <Link
                          href={`/teams/${cap.teamId}/requests/new?capabilityId=${cap.id}`}
                          className="flex size-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground transition-all hover:bg-primary hover:text-primary-foreground shadow-sm"
                        >
                          <ArrowRight className="size-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
