"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Users, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type AgentType = "team_lead" | "software_engineer" | "software_architect" | "product_manager";

interface Agent {
  id: string; 
  name: string; 
  type: AgentType;
  icon?: string; 
  metadata?: { avatarColor?: string };
}

interface Team {
  id: string; 
  name: string; 
  mission?: string; 
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
  return (
    <Link
      href={`/teams/${team.id}`}
      className="group flex flex-col gap-4 rounded-xl border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Users className="size-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">
            {team.name}
          </h2>
          <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
            {team.mission || "No mission defined."}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end sm:gap-6">
        {team.agents.length > 0 ? (
          <AgentAvatarGroup agents={team.agents} />
        ) : (
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">
            Empty Team
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

  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTeams = useCallback(() => {
    if (!token) return;
    fetch(`${API_BASE}/teams/mine`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setTeams(d.data ?? []))
      .catch(() => toast.error("Failed to load teams."))
      .finally(() => setIsLoading(false));
  }, [token]);

  useEffect(() => {
    if (authLoading) return;
    if (!token) { router.replace("/login"); return; }
    loadTeams();
  }, [token, router, authLoading, loadTeams]);

  const workspaceName = teams[0]?.workspace?.name ?? null;

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-20">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {workspaceName && (
              <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground bg-muted/50 mb-3">
                {workspaceName}
              </span>
            )}
            <h1 className="text-3xl font-bold tracking-tight">Your Teams</h1>
            <p className="text-muted-foreground mt-1">Manage and monitor your engineering squads.</p>
          </div>
          <Button asChild>
            <Link href="/newteam">
              <Plus className="size-4 mr-2" />
              New Team
            </Link>
          </Button>
        </div>

        {/* Content */}
        {teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-24 text-center bg-muted/10">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
              <Users className="size-8 text-muted-foreground/60" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">No teams found</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm text-balance">
              Get started by creating your first team to begin delegating tasks and automating your engineering workflow.
            </p>
            <Button asChild variant="outline">
              <Link href="/newteam">
                Create Team
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
    </div>
  );
}
