"use client";

import { useEffect, useState } from "react";
import { Filter, Users, ChevronDown } from "lucide-react";
import { useAuth, API_BASE } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TeamFilterProps {
  selectedTeamIds: string[];
  onChange: (ids: string[]) => void;
}

export function TeamFilter({ selectedTeamIds, onChange }: TeamFilterProps) {
  const { token } = useAuth();
  const { t, lang } = useTranslation();
  const [teams, setTeams] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/teams/mine`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      }
    })
      .then((r) => r.json())
      .then((d) => setTeams(d.data ?? []))
      .catch((err) => console.error("TeamFilter: failed to fetch teams", err));
  }, [token]);

  const handleToggle = (teamId: string) => {
    if (selectedTeamIds.includes(teamId)) {
      onChange(selectedTeamIds.filter((id) => id !== teamId));
    } else {
      onChange([...selectedTeamIds, teamId]);
    }
  };

  const handleClear = () => {
    onChange([]);
  };

  const getLabel = () => {
    if (selectedTeamIds.length === 0) {
      if (lang === "pt") return "Filtrar por Time";
      if (lang === "zh") return "按团队筛选";
      return "Filter by Team";
    }
    if (selectedTeamIds.length === 1) {
      const team = teams.find((t) => t.id === selectedTeamIds[0]);
      return team ? team.name : "1 Team Selected";
    }
    if (lang === "pt") return `${selectedTeamIds.length} Times selecionados`;
    if (lang === "zh") return `已选择 ${selectedTeamIds.length} 个团队`;
    return `${selectedTeamIds.length} Teams Selected`;
  };

  const getFilterText = () => {
    if (lang === "pt") return "Todos os times";
    if (lang === "zh") return "所有团队";
    return "All Teams";
  };

  const getTitleText = () => {
    if (lang === "pt") return "Filtrar por...";
    if (lang === "zh") return "筛选团队...";
    return "Filter Teams...";
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
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
            {getTitleText()}
          </span>
          {selectedTeamIds.length > 0 && (
            <button
              onClick={(e) => {
                e.preventDefault();
                handleClear();
              }}
              className="text-[10px] text-primary hover:underline font-bold"
            >
              {lang === "pt" ? "Limpar" : lang === "zh" ? "清除" : "Clear"}
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {teams.length === 0 ? (
          <div className="py-4 px-3 text-xs text-center text-muted-foreground">
            {lang === "pt" ? "Nenhum time disponível" : lang === "zh" ? "没有可用的团队" : "No teams available"}
          </div>
        ) : (
          <>
            <DropdownMenuCheckboxItem
              checked={selectedTeamIds.length === 0}
              onCheckedChange={handleClear}
            >
              <Users className="size-3.5 text-muted-foreground mr-1.5" />
              <span>{getFilterText()}</span>
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {teams.map((team) => (
              <DropdownMenuCheckboxItem
                key={team.id}
                checked={selectedTeamIds.includes(team.id)}
                onCheckedChange={() => handleToggle(team.id)}
              >
                <span className="mr-1.5">{team.icon || "🛡️"}</span>
                <span className="truncate">{team.name}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
