"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Puzzle, Search, Star, Loader2, ArrowRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useAuth, API_BASE } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { TeamFilter } from "@/components/team-filter";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Capability {
  id: string;
  name: string;
  identifier: string;
  isEnabled: boolean;
  isFavorite: boolean;
  teamId: string;
  teamName?: string;
}

export default function CapabilitiesPage() {
  const { token, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
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
        const teams = d.data ?? [];
        const allCapabilities: Capability[] = [];
        
        // Fetch capabilities for each team in parallel
        await Promise.all(
          teams.map(async (team: any) => {
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
                    teamName: team.name
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

  // Filter capabilities locally based on selectedTeamIds and search query
  const filteredCapabilities = capabilities.filter((cap) => {
    // 1. Team filter
    if (selectedTeamIds.length > 0 && !selectedTeamIds.includes(cap.teamId)) {
      return false;
    }
    // 2. Search query filter
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
          <div className="shrink-0">
            <TeamFilter selectedTeamIds={selectedTeamIds} onChange={handleFilterChange} />
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
            {selectedTeamIds.length > 0 || search.trim() !== ""
              ? "Try adjusting your search criteria or team filter settings to view other capabilities."
              : "Set up agent capabilities inside your active team configuration settings."
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
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {filteredCapabilities.map((cap) => (
            <div
              key={cap.id}
              className="group flex items-center justify-between rounded-2xl border bg-card p-4 hover:border-primary/30 transition-all shadow-sm hover:shadow-md relative"
            >
              <div className="min-w-0 flex-1">
                {/* Title */}
                <h3 className="font-semibold text-foreground truncate text-base group-hover:text-primary transition-colors">
                  {translateCapability(cap.name)}
                </h3>

                {/* Team Name */}
                <p className="text-xs font-medium text-muted-foreground mt-0.5 truncate">
                  {cap.teamName}
                </p>
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
                <Link
                  href={`/teams/${cap.teamId}/settings/capabilities/${cap.id}`}
                  className="flex size-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground transition-all hover:bg-primary hover:text-primary-foreground shadow-sm"
                >
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
