"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Users, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

interface Agent {
  id: string; 
  name: string; 
  roleId: string;
  icon?: string; 
  metadata?: { avatarColor?: string };
}

interface Team {
  id: string; 
  name: string; 
  mission?: string; 
  templateId?: string;
  icon?: string;
  createdAt: string;
  agents: Agent[];
  workspace: { id: string; name: string };
}

const DEFAULT_AVATAR_COLOR = "#f4f4f5"; // minimal zinc-100

function AgentAvatarGroup({ agents }: { agents: Agent[] }) {
  const maxDisplay = 4;
  const displayAgents = agents.slice(0, maxDisplay);
  const remaining = agents.length - maxDisplay;

  return (
    <div className="flex -space-x-2">
      {displayAgents.map((agent, i) => {
        const color = agent.metadata?.avatarColor || DEFAULT_AVATAR_COLOR;
        return (
          <div 
            key={agent.id} 
            className="flex size-8 items-center justify-center rounded-full border-2 border-background text-sm ring-1 ring-border/50 transition-transform hover:z-10 hover:scale-110"
            style={{ backgroundColor: color }}
            title={agent.name}
          >
            {agent.icon || "🤖"}
          </div>
        );
      })}
      {remaining > 0 && (
        <div className="flex size-8 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium text-muted-foreground ring-1 ring-border/50">
          +{remaining}
        </div>
      )}
    </div>
  );
}

function TeamListItem({ team }: { team: Team }) {
  const { t } = useTranslation();
  
  // Resolve localized description using team.templateId if present
  let displayDescription = team.mission || t.teamsPage.noMission;
  const typesDict = t.teams?.types as any;
  if (team.templateId && typesDict && typesDict[team.templateId]) {
    displayDescription = typesDict[team.templateId].description || displayDescription;
  }

  return (
    <Link
      href={`/teams/${team.id}`}
      className="group flex flex-col gap-4 rounded-xl border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-2xl">
          {team.icon || "🛡️"}
        </div>
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">
            {team.name}
          </h2>
          <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
            {displayDescription}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end sm:gap-6">
        {team.agents.length > 0 ? (
          <AgentAvatarGroup agents={team.agents} />
        ) : (
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">
            {t.teamsPage.emptyTeam}
          </span>
        )}
        <div className="flex size-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:bg-primary group-hover:text-primary-foreground hidden sm:flex">
          <ArrowRight className="size-4" />
        </div>
      </div>
    </Link>
  );
}


export default function TeamsPage() {
  const { token, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTeams = useCallback(() => {
    if (!token) return;
    fetch(`${API_BASE}/teams/mine`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setTeams(d.data ?? []))
      .catch(() => toast.error(t.teamsPage.failedLoad))
      .finally(() => setIsLoading(false));
  }, [token, t.teamsPage.failedLoad]);

  useEffect(() => {
    if (authLoading) return;
    if (!token) { router.replace("/login"); return; }
    loadTeams();
  }, [token, router, authLoading, loadTeams]);

  const workspaceName = teams[0]?.workspace?.name ?? null;

  if (authLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
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
            <Users className="size-5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              {t.nav.teams}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">
            {t.teamsPage.title}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t.teamsPage.subtitle}
          </p>
        </div>
        <Button asChild>
          <Link href="/newteam">
            <Plus className="size-4 mr-2" />
            {t.teamsPage.newTeam}
          </Link>
        </Button>
      </header>

      {/* ── CONTENT ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-24 text-center bg-muted/10">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
            <Users className="size-8 text-muted-foreground/60" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">{t.teamsPage.noTeams}</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm text-balance">
            {t.teamsPage.noTeamsSubtitle}
          </p>
          <Button asChild variant="outline">
            <Link href="/newteam">
              {t.teamsPage.createTeam}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {teams.map((team) => (
            <TeamListItem key={team.id} team={team} />
          ))}
        </div>
      )}
    </div>
  );
}
