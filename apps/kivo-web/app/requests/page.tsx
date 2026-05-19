"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListTodo, Loader2, ArrowRight, Clock, HelpCircle, CheckCircle, XCircle, Search } from "lucide-react";
import { useAuth, API_BASE } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TeamFilter } from "@/components/team-filter";

interface Request {
  id: string;
  identifier: string;
  title: string;
  status: string;
  createdAt: string;
  teamId: string;
  teamName?: string;
}

export default function RequestsPage() {
  const { token, isLoading: authLoading } = useAuth();
  const { t, lang } = useTranslation();
  const router = useRouter();

  const [requests, setRequests] = useState<Request[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");

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

    // Fetch active teams first
    fetch(`${API_BASE}/teams/mine`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      }
    })
      .then((r) => r.json())
      .then(async (d) => {
        const teams = d.data ?? [];
        const allRequests: Request[] = [];
        
        // Fetch requests for each team in parallel
        await Promise.all(
          teams.map(async (team: any) => {
            try {
              const res = await fetch(
                `${API_BASE}/teams/${team.id}/requests?parentRequestId=null`,
                {
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                  }
                }
              );
              if (res.ok) {
                const reqs = (await res.json()).data ?? [];
                reqs.forEach((r: any) => {
                  allRequests.push({
                    ...r,
                    teamId: team.id,
                    teamName: team.name
                  });
                });
              }
            } catch (err) {
              console.error(`Failed to load requests for team ${team.id}`, err);
            }
          })
        );
        
        // Sort requests by date (newest first)
        allRequests.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setRequests(allRequests);
      })
      .catch(() => toast.error("Failed to load requests"))
      .finally(() => setIsLoading(false));
  }, [token, authLoading, router]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
      case "success":
        return <CheckCircle className="size-5 text-emerald-500" />;
      case "failed":
        return <XCircle className="size-5 text-destructive" />;
      case "in_progress":
        return <Clock className="size-5 text-amber-500 animate-pulse" />;
      case "waiting_user":
        return <HelpCircle className="size-5 text-purple-500" />;
      default:
        return <Clock className="size-5 text-blue-500" />;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-muted text-muted-foreground border-border/60";
      case "open":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "in_progress":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "waiting_user":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "completed":
      case "success":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "failed":
        return "bg-destructive/10 text-destructive border-destructive/20";
      default:
        return "bg-muted text-muted-foreground border-border/60";
    }
  };

  const getStatusLabel = (status: string) => {
    if (status === "success") return t.teamsPage.statusLabels.ok;
    return (t.teamsPage.statusLabels as any)[status] || status.replace("_", " ");
  };

  const getOpenText = () => {
    if (lang === "pt") return "Abrir";
    if (lang === "zh") return "打开";
    return "Open";
  };

  // Filter requests locally based on selectedTeamIds and search query
  const filteredRequests = requests.filter((req) => {
    // 1. Team filter
    if (selectedTeamIds.length > 0 && !selectedTeamIds.includes(req.teamId)) {
      return false;
    }
    // 2. Search query filter
    if (search.trim() !== "") {
      const query = search.toLowerCase();
      return (
        req.title.toLowerCase().includes(query) ||
        req.identifier.toLowerCase().includes(query)
      );
    }
    return true;
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
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-6 border-border/40">
        <div>
          <div className="flex items-center gap-2">
            <ListTodo className="size-5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              {t.nav.requests}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">
            {t.teamsPage.requests}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t.teamsPage.requestsSubtitle}
          </p>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto shrink-0">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search requests..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-lg border border-border bg-card text-sm focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div className="shrink-0">
            <TeamFilter selectedTeamIds={selectedTeamIds} onChange={handleFilterChange} />
          </div>
        </div>
      </header>

      {/* ── REQUESTS GRID ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-24 text-center bg-muted/10">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
            <ListTodo className="size-8 text-muted-foreground/60" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">
            {selectedTeamIds.length > 0 || search.trim() !== "" 
              ? "No requests match the selected filters" 
              : t.teamsPage.noRequests}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm">
            {selectedTeamIds.length > 0 || search.trim() !== ""
              ? "Try adjusting your search criteria or team filter settings to view other operational tasks."
              : "Launch a task request directly inside any of your active team dashboards."
            }
          </p>
          {(selectedTeamIds.length > 0 || search.trim() !== "") ? (
            <Button onClick={() => { handleFilterChange([]); setSearch(""); }} variant="outline">
              Clear Filters
            </Button>
          ) : (
            <Button asChild>
              <Link href="/teams">Go to Teams</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1">
          {filteredRequests.map((req) => (
            <Link
              key={req.id}
              href={`/teams/${req.teamId}/requests/${req.identifier}`}
              className="group flex items-center justify-between rounded-2xl border bg-card p-4 hover:border-primary/30 transition-all shadow-sm hover:shadow-md relative"
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                {/* Status Shape Icon */}
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/40 transition-transform group-hover:scale-105 shadow-sm bg-muted/5"
                >
                  {getStatusIcon(req.status)}
                </div>

                <div className="min-w-0 flex-1">
                  {/* Title */}
                  <h3 className="font-semibold text-foreground truncate text-base group-hover:text-primary transition-colors">
                    {req.title}
                  </h3>

                  {/* Identifier & Team Name (2 Lines only!) */}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-mono text-muted-foreground select-all">
                      {req.identifier}
                    </span>
                    <div className="h-3 w-px bg-border" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {req.teamName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Badge, Created Date, Discrete Arrow and Hover Action */}
              <div className="flex items-center gap-4 shrink-0 pl-4">
                <span
                  className={cn(
                    "text-[10px] px-2.5 py-0.5 rounded-full font-semibold border capitalize shrink-0",
                    getStatusClass(req.status)
                  )}
                >
                  {getStatusLabel(req.status)}
                </span>
                
                <span className="text-xs text-muted-foreground font-medium shrink-0 flex items-center gap-1.5 hidden sm:flex">
                  <Clock className="size-3 text-muted-foreground/70" />
                  <span>{new Date(req.createdAt).toLocaleDateString()}</span>
                </span>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-primary opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0 hidden md:inline-block">
                    {getOpenText()}
                  </span>
                  <div className="flex size-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground transition-all group-hover:bg-primary group-hover:text-primary-foreground shadow-sm">
                    <ArrowRight className="size-4" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
