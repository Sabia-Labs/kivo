"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Loader2, Users, ArrowRight } from "lucide-react";
import { useAuth, API_BASE } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TeamFilter } from "@/components/team-filter";

interface Agent {
  id: string;
  name: string;
  roleId: string;
  isLeader: boolean;
  k8sStatus?: string;
  teamId?: string;
  team?: { id: string; name: string };
  icon?: string;
  metadata?: { avatarColor?: string };
}

export default function AgentsPage() {
  const { token, isLoading: authLoading } = useAuth();
  const { t, lang } = useTranslation();
  const router = useRouter();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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
    if (!token) {
      router.replace("/login");
      return;
    }

    // Fetch both active agents and teams
    Promise.all([
      fetch(`${API_BASE}/agents`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        }
      }).then((r) => r.json()),
      fetch(`${API_BASE}/teams/mine`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        }
      }).then((r) => r.json())
    ])
      .then(([agentsRes, teamsRes]) => {
        setAgents(agentsRes.data ?? []);
        setTeams(teamsRes.data ?? []);
      })
      .catch(() => toast.error("Failed to load agents or teams"))
      .finally(() => setIsLoading(false));
  }, [token, authLoading, router]);

  const getHealthColor = (status?: string) => {
    switch (status) {
      case "running":
        return "bg-emerald-500 text-emerald-500";
      case "failed":
      case "terminated":
        return "bg-destructive text-destructive";
      default:
        return "bg-amber-500 text-amber-500";
    }
  };

  const getHealthText = (status?: string) => {
    switch (status) {
      case "running":
        return t.agents.healthOnline;
      case "failed":
      case "terminated":
        return t.agents.healthOffline;
      default:
        return t.agents.healthStarting;
    }
  };

  const translateRole = (roleId: string) => {
    // Map database hyphenated roleId to translation key with underscore
    const normalizedKey = (roleId || "").replace(/-/g, "_");
    return (t.agents.roleLabels as any)[normalizedKey] || roleId.replace(/[_-]/g, " ");
  };

  const getProfileText = () => {
    if (lang === "pt") return "Perfil";
    if (lang === "zh") return "个人资料";
    return "Profile";
  };

  const getTeamLabel = () => {
    if (lang === "pt") return "Time";
    if (lang === "zh") return "团队";
    return "Team";
  };

  // Filter agents locally based on selectedTeamIds
  const filteredAgents = agents.filter((agent) => {
    if (selectedTeamIds.length === 0) return true;
    return selectedTeamIds.includes(agent.teamId || "");
  });

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
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b pb-6 border-border/40">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="size-5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              {t.nav.agents}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">
            {t.agents.title}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t.agents.subtitle}
          </p>
        </div>
        <div className="shrink-0">
          <TeamFilter selectedTeamIds={selectedTeamIds} onChange={handleFilterChange} />
        </div>
      </header>

      {/* ── AGENTS GRID ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-24 text-center bg-muted/10">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
            <Bot className="size-8 text-muted-foreground/60" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">
            {selectedTeamIds.length > 0 ? "No agents match the selected filter" : "No agents found"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm">
            {selectedTeamIds.length > 0 
              ? "Try adjusting your team filter settings in the dropdown above to view other operators."
              : "Deploy an agent team from the Teams dashboard to configure autonomous operators."
            }
          </p>
          {selectedTeamIds.length > 0 ? (
            <Button onClick={() => handleFilterChange([])} variant="outline">
              Clear Filter
            </Button>
          ) : (
            <Button asChild>
              <Link href="/teams">Go to Teams</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {filteredAgents.map((agent) => {
            const avatarColor = agent.metadata?.avatarColor || "#f4f4f5";
            
            // Resolve actual team name using backend teamId lookup or child reference
            const matchedTeam = teams.find(
              (t) => t.id === agent.teamId || t.agents?.some((a: any) => a.id === agent.id)
            );
            const teamName = matchedTeam?.name || agent.team?.name || "N/A";

            return (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="group flex items-center justify-between rounded-2xl border bg-card p-5 hover:border-primary/30 transition-all shadow-sm hover:shadow-md relative"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  {/* Icon & Background color from API */}
                  <div
                    className="flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl border transition-transform group-hover:scale-105 shadow-sm"
                    style={{ backgroundColor: avatarColor + "15", borderColor: avatarColor + "30" }}
                  >
                    {agent.icon || "🤖"}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Name & Health status indicator next to it */}
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground truncate text-base group-hover:text-primary transition-colors">
                        {agent.name}
                      </h3>
                      <span
                        className={`size-2 rounded-full shrink-0 ${getHealthColor(agent.k8sStatus)}`}
                        title={getHealthText(agent.k8sStatus)}
                      />
                    </div>

                    {/* Translated Role Label below the name */}
                    <p className="text-xs text-muted-foreground font-medium mt-0.5">
                      {translateRole(agent.roleId)}
                      {agent.isLeader && (
                        <span className="ml-2 inline-flex items-center rounded bg-primary/10 px-1 py-0.2 text-[9px] font-bold text-primary uppercase tracking-wider">
                          Lead
                        </span>
                      )}
                    </p>

                    {/* Team Name below role */}
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                      <Users className="size-3 text-muted-foreground/75" />
                      <span>{getTeamLabel()}:</span>
                      <span className="font-medium text-foreground">
                        {teamName}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Discrete Arrow and Hover Action */}
                <div className="flex items-center gap-2 pl-4">
                  <span className="text-xs font-semibold text-primary opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0 hidden sm:inline-block">
                    {getProfileText()}
                  </span>
                  <div className="flex size-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground transition-all group-hover:bg-primary group-hover:text-primary-foreground shadow-sm">
                    <ArrowRight className="size-4" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
