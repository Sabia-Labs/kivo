"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Bot, FolderKanban, Plus, Activity, AlertCircle, CheckCircle2, ChevronRight, ChevronDown, Crown, ListTodo, Filter
} from "lucide-react";
import { toast } from "sonner";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { Team, Task, Agent, HealthStatus } from "@/lib/types";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

import { AgentChatAccordion } from "@/components/AgentChatAccordion";

function computeHealth(a: Agent): HealthStatus {
  const k8s = a.k8sStatus;
  if (k8s === "running") return "online";
  if (k8s === "failed" || k8s === "terminated") return "offline";
  return "starting";
}

function RequestRow({ req, teamId, level = 0 }: { req: any, teamId: string, level?: number }) {
  const { token } = useAuth();
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subRequests, setSubRequests] = useState<any[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleExpand = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isExpanded && !hasLoaded) {
      setIsLoading(true);
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      try {
        const [tasksRes, reqsRes] = await Promise.all([
          fetch(`${API_BASE}/teams/${teamId}/requests/${req.identifier}/tasks`, { headers }),
          fetch(`${API_BASE}/teams/${teamId}/requests?parentRequestId=${req.id}`, { headers })
        ]);
        if (tasksRes.ok) setTasks((await tasksRes.json()).data ?? []);
        if (reqsRes.ok) setSubRequests((await reqsRes.json()).data ?? []);
        setHasLoaded(true);
      } catch (err) {
        console.error("Failed to load children", err);
      } finally {
        setIsLoading(false);
      }
    }
    setIsExpanded(!isExpanded);
  };

  const statusLabel = req.status === "completed" 
    ? (req.resolution === "success" ? t.teamsPage.statusLabels.ok : t.teamsPage.statusLabels.failed) 
    : (t.teamsPage.statusLabels as any)[req.status] || req.status.replace("_", " ");

  const statusColorClass = req.status === "draft" ? "bg-muted text-muted-foreground" :
    req.status === "open" ? "bg-blue-500/10 text-blue-500" :
    req.status === "in_progress" ? "bg-amber-500/10 text-amber-500" :
    req.status === "waiting_user" ? "bg-purple-500/10 text-purple-500" :
    req.status === "completed" ? (
      req.resolution === "success" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
    ) :
    req.status === "cancelled" ? "bg-gray-500/10 text-gray-500" :
    "bg-emerald-500/10 text-emerald-500";

  return (
    <div className="flex flex-col border-b last:border-0 border-border/50 w-full">
      <div 
        className={cn("flex flex-col sm:flex-row sm:items-center gap-3 p-3 hover:bg-muted/30 transition-colors group", level > 0 && "bg-muted/5")} 
        style={{ paddingLeft: `${1 + level * 1.5}rem`, paddingRight: '1rem' }}
      >
        <button 
          onClick={handleExpand} 
          className="flex size-6 items-center justify-center rounded-md hover:bg-muted text-muted-foreground shrink-0 focus:outline-none"
        >
          {isLoading ? (
            <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : isExpanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
        <Link href={req.status === 'draft' ? `/teams/${teamId}/requests/new?requestId=${req.identifier}` : `/teams/${teamId}/requests/${req.identifier}`} className="flex items-center gap-3 min-w-0 flex-1 hover:underline">
          <span className="text-xs font-mono text-muted-foreground">{req.identifier}</span>
          <span className="text-sm font-medium truncate">{req.title}</span>
        </Link>
        <div className="flex items-center gap-4 shrink-0 sm:ml-auto">
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", statusColorClass)}>
            {statusLabel}
          </span>
        </div>
      </div>
      
      {isExpanded && (
        <div className="flex flex-col w-full">
          {(!hasLoaded && isLoading) && (
            <div className="p-3 text-xs text-muted-foreground text-center" style={{ paddingLeft: `${1 + (level + 1) * 1.5}rem` }}>
              {t.teamsPage.loading}
            </div>
          )}
          {hasLoaded && tasks.length === 0 && subRequests.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground/50 italic" style={{ paddingLeft: `${1 + (level + 1) * 1.5}rem` }}>
              {t.teamsPage.noTasksOrNested}
            </div>
          )}
          {tasks.map(task => (
            <Link 
              key={task.id} 
              href={`/teams/${teamId}/tasks/${task.id}`} 
              className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 hover:bg-muted/30 transition-colors border-b border-border/30 last:border-0" 
              style={{ paddingLeft: `${1 + (level + 1) * 1.5}rem`, paddingRight: '1rem' }}
            >
              <div className="flex size-6 items-center justify-center shrink-0">
                <FolderKanban className="size-3.5 text-muted-foreground/70" />
              </div>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-sm text-muted-foreground font-medium truncate">{task.title}</span>
              </div>
            </Link>
          ))}
          {subRequests.map(subReq => (
            <RequestRow key={subReq.id} req={subReq} teamId={teamId} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeamDetailPage() {
  const { token, user, isLoading: authLoading } = useAuth();
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
  const [team, setTeam] = useState<Team | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [capabilities, setCapabilities] = useState<any[]>([]);
  const [teamAlerts, setTeamAlerts] = useState<any[]>([]);

  // Filters
  const [showOnlyMine, setShowOnlyMine] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string[]>(["draft", "open", "in_progress", "waiting_user"]);
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  useEffect(() => {
    try {
      const savedMine = localStorage.getItem(`kivo_team_${teamId}_showOnlyMine`);
      if (savedMine !== null) setShowOnlyMine(savedMine === "true");
      const savedStatus = localStorage.getItem(`kivo_team_${teamId}_statusFilter`);
      if (savedStatus !== null) setStatusFilter(JSON.parse(savedStatus));
    } catch (e) {}
    setFiltersLoaded(true);
  }, [teamId]);

  useEffect(() => {
    if (!filtersLoaded) return;
    try {
      localStorage.setItem(`kivo_team_${teamId}_showOnlyMine`, String(showOnlyMine));
      localStorage.setItem(`kivo_team_${teamId}_statusFilter`, JSON.stringify(statusFilter));
    } catch (e) {}
  }, [teamId, showOnlyMine, statusFilter, filtersLoaded]);

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const fetchAgents = async () => {
    try {
      const res = await fetch(`${API_BASE}/agents?teamId=${teamId}`, { headers });
      if (res.ok) {
        const d = await res.json();
        const all: Agent[] = d.data ?? [];
        // Sort: Leaders first
        all.sort((a, b) => (a.isLeader ? -1 : b.isLeader ? 1 : 0));
        setAgents(all);
      }
    } catch {}
  };



  const fetchActivities = async () => {
    try {
      const res = await fetch(`${API_BASE}/teams/${teamId}/activities`, { headers });
      if (res.ok) {
        const d = await res.json();
        setActivities(d.data ?? []);
      }
    } catch {}
  };

  const fetchRequests = async () => {
    try {
      const res = await fetch(`${API_BASE}/teams/${teamId}/requests?parentRequestId=null`, { headers });
      if (res.ok) {
        const d = await res.json();
        setRequests(d.data ?? []);
      }
    } catch {}
  };

  useEffect(() => {
    if (authLoading) return;
    if (!token) { router.replace("/login"); return; }

    Promise.all([
      fetch(`${API_BASE}/teams/${teamId}`, { headers }),
      fetchAgents(),
      fetchActivities(),
      fetch(`${API_BASE}/teams/${teamId}/requests?parentRequestId=null`, { headers }),
      fetch(`${API_BASE}/teams/${teamId}/capabilities`, { headers }),
      fetch(`${API_BASE}/notifications?teamId=${teamId}&priority=high,alert`, { headers }),
    ])
      .then(async ([teamRes, _a, _act, requestsRes, capsRes, notifsRes]) => {
        if (teamRes && teamRes.ok) {
          const d = await teamRes.json();
          setTeam(d.data);
        } else if (teamRes && !teamRes.ok) {
          toast.error("Team not found.");
          router.replace("/teams");
        }
        
        if (requestsRes && requestsRes.ok) setRequests((await requestsRes.json()).data ?? []);
        if (capsRes && capsRes.ok) setCapabilities((await capsRes.json()).data ?? []);
        if (notifsRes && notifsRes.ok) {
          const notifs = (await notifsRes.json()).data ?? [];
          setTeamAlerts(notifs.filter((n: any) => !n.isRead));
        }
      })
      .finally(() => setIsLoading(false));

    const intervalId = setInterval(() => {
      fetchAgents();
      fetchActivities();
      fetchRequests();
    }, 5000);
    return () => clearInterval(intervalId);
  }, [authLoading]);

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!team) return null;

  const teamLead = agents.find((a) => a.isLeader);
  const otherAgents = agents.filter((a) => !a.isLeader);
  const openedRequests = requests.filter(r => r.status !== "completed" && r.status !== "cancelled");


  
  const displayRequests = requests.filter(r => {
    if (showOnlyMine && r.requesterUserId !== user?.id) return false;
    if (!statusFilter.includes(r.status)) return false;
    return true;
  });

  const favoriteCapabilities = capabilities.filter(c => c.isFavorite);

  const toggleStatusFilter = (status: string) => {
    setStatusFilter(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <Link href="/teams" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-3.5" />
        {t.teamsPage.backToTeams}
      </Link>

      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-xl">
              {team.icon || "🛡️"}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{team.name}</h1>
          </div>
          {team.mission && (
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
              {team.mission}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" asChild>
            <Link href={`/teams/${teamId}/settings`}>{t.teamsPage.settings}</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="size-4 mr-2" />
                {t.teamsPage.newRequest}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link href={`/teams/${teamId}/requests/new`} className="cursor-pointer font-medium">
                  {t.teamsPage.askAnything}
                </Link>
              </DropdownMenuItem>
              {favoriteCapabilities.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">{t.teamsPage.favorites}</DropdownMenuLabel>
                  {favoriteCapabilities.map(cap => (
                    <DropdownMenuItem key={cap.id} asChild>
                      <Link href={`/teams/${teamId}/requests/new?capabilityId=${cap.id}`} className="cursor-pointer">
                        {cap.name}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Team Alerts Banner */}
      {teamAlerts.length > 0 && (
        <section className="mb-8 rounded-xl border border-destructive/20 bg-destructive/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="size-5 text-destructive" />
            <h2 className="text-sm font-semibold text-destructive">{t.teamsPage.teamNeedsHelp}</h2>
          </div>
          <div className="flex flex-col gap-2">
            {teamAlerts.map(alert => (
              <div key={alert.id} className="flex flex-col gap-1 rounded-lg bg-background/50 p-3 text-sm">
                <span className="font-medium text-foreground">{alert.title}</span>
                {alert.content && <span className="text-muted-foreground">{alert.content}</span>}
                {alert.relatedEntityType === "request" && alert.relatedEntityId && (
                  <div className="mt-1 flex items-center gap-3">
                    <Link 
                      href={`/teams/${teamId}/requests/${alert.relatedEntityId}`}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      {t.teamsPage.viewRequest}
                    </Link>
                    <button
                      onClick={async () => {
                        try {
                          const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
                          const res = await fetch(`${API_BASE}/teams/${teamId}/requests/${alert.relatedEntityId}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({ status: "cancelled" }),
                          });
                          if (!res.ok) throw new Error("Failed to cancel request");
                          
                          await fetch(`${API_BASE}/notifications/${alert.id}/read`, {
                            method: "PATCH",
                            headers,
                          });
                          
                          setTeamAlerts(prev => prev.filter(a => a.id !== alert.id));
                          setRequests(prev => prev.map(r => 
                            (r.identifier === alert.relatedEntityId || r.id === alert.relatedEntityId) 
                              ? { ...r, status: "cancelled" } 
                              : r
                          ));
                          toast.success(t.teamsPage.requestCancelled);
                        } catch (e) {
                          toast.error(t.teamsPage.failedCancelRequest);
                        }
                      }}
                      className="text-xs font-semibold text-destructive hover:underline"
                    >
                      {t.teamsPage.cancelRequest}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Column - Team Work */}
        {/* Left Column - Team Work */}
        <div className="lg:col-span-2 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <Bot className="size-5 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{t.teamsPage.squadChat}</h3>
              </div>
              <Link href={`/teams/${teamId}/agents/new`} className="text-xs font-medium text-primary hover:underline">
                {t.teamsPage.addAgent}
              </Link>
            </div>
            <AgentChatAccordion agents={agents} teamId={teamId} />
          </section>

          <section className="rounded-xl border bg-card overflow-hidden">
            <div className="border-b px-5 py-3 flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-2">
                <ListTodo className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{t.teamsPage.requests}</h3>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-2 text-muted-foreground">
                    <Filter className="size-3.5" />
                    {t.teamsPage.filters}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>{t.teamsPage.ownership}</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem 
                    checked={showOnlyMine} 
                    onCheckedChange={setShowOnlyMine}
                  >
                    {t.teamsPage.onlyMyRequests}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>{t.teamsPage.status}</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem 
                    checked={statusFilter.includes("draft")} 
                    onCheckedChange={() => toggleStatusFilter("draft")}
                  >
                    {t.teamsPage.statusLabels.draft}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem 
                    checked={statusFilter.includes("open")} 
                    onCheckedChange={() => toggleStatusFilter("open")}
                  >
                    {t.teamsPage.statusLabels.open}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem 
                    checked={statusFilter.includes("in_progress")} 
                    onCheckedChange={() => toggleStatusFilter("in_progress")}
                  >
                    {t.teamsPage.statusLabels.in_progress}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem 
                    checked={statusFilter.includes("waiting_user")} 
                    onCheckedChange={() => toggleStatusFilter("waiting_user")}
                  >
                    {t.teamsPage.statusLabels.waiting_user}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem 
                    checked={statusFilter.includes("completed")} 
                    onCheckedChange={() => toggleStatusFilter("completed")}
                  >
                    {t.teamsPage.statusLabels.completed}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem 
                    checked={statusFilter.includes("cancelled")} 
                    onCheckedChange={() => toggleStatusFilter("cancelled")}
                  >
                    {t.teamsPage.statusLabels.cancelled}
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex flex-col w-full">
              {displayRequests.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {t.teamsPage.noRequests}
                </div>
              ) : (
                displayRequests.map(req => (
                  <RequestRow key={req.id} req={req} teamId={teamId} />
                ))
              )}
            </div>
          </section>
        </div>

        {/* Right Column - KPIs & Activity */}
        <div className="space-y-6">
          {/* Manager Actions Area */}
          <section className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">{t.teamsPage.managerActions}</h2>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 p-4 rounded-lg bg-muted/50 border border-border/50">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t.nav.agents}</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{agents.filter(a => computeHealth(a) === "online").length}/{agents.length}</span>
                  <span className="text-xs text-muted-foreground">{t.teamsPage.online}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1 p-4 rounded-lg bg-muted/50 border border-border/50">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t.teamsPage.openedRequests}</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{openedRequests.length}</span>
                  <span className="text-xs text-muted-foreground">{t.teamsPage.inPipeline}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                  <CheckCircle2 className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{t.teamsPage.operational}</p>
                  <p className="text-xs text-muted-foreground">{t.teamsPage.operationalSubtitle}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card">
            <div className="border-b px-5 py-4 flex items-center gap-2 bg-muted/20">
              <Activity className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{t.teamsPage.recentActivity}</h3>
            </div>
            <div className="p-5 flex flex-col gap-4">
              {activities.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">{t.teamsPage.noActivity}</p>
              ) : (
                activities.slice(0, 5).map((act) => {
                  const isHuman = act.actorType === "human";
                  const agent = isHuman ? null : agents.find((a) => a.id === act.actorId);
                  const title = act.activityTitle || act.payload?.title || act.entityId?.substring(0, 8) || act.requestId?.substring(0, 8) || act.taskId?.substring(0, 8) || "an item";
                  
                  return (
                    <div key={act.id} className="flex gap-3 items-start">
                      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
                        {isHuman ? "👤" : (agent?.icon || "🤖")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs leading-tight">
                          <span className="font-medium text-foreground">{isHuman ? t.teamsPage.you : agent?.name || "Agent"}</span>
                          {act.activityTitle ? (
                            <span className="text-muted-foreground"> {act.activityTitle}</span>
                          ) : (
                            <>
                              <span className="text-muted-foreground"> {t.teamsPage.updated} </span>
                              <span className="font-medium text-foreground">{title}</span>
                            </>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
