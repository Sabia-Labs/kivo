"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronDown, Crown, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AgentChatArea } from "@/components/AgentChatArea";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";



export function AgentChatAccordion({ agents, teamId }: { agents: any[], teamId: string }) {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  // Acordeão fechado por default
  const [openAgentId, setOpenAgentId] = useState<string | null>(null);

  const leader = agents.find(a => a.isLeader);
  const members = agents.filter(a => !a.isLeader);

  if (!leader && members.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* ── Team Leader Accordion ────────────────────────────────────────────── */}
      {leader && (
        <div className="rounded-xl border bg-card overflow-hidden shadow-sm transition-all">
          <div 
            className={cn(
              "flex items-center justify-between p-3 cursor-pointer select-none transition-colors hover:bg-muted/30",
              openAgentId === leader.id && "bg-muted/20 border-b"
            )}
            onClick={() => setOpenAgentId(openAgentId === leader.id ? null : leader.id)}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted text-lg">
                  {leader.icon || "🤖"}
                </div>
                <span className={cn(
                  "absolute bottom-0 right-0 size-2.5 rounded-full ring-2 ring-card bg-emerald-500"
                )} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold">{leader.name}</p>
                  <Crown className="size-3 text-amber-500" />
                </div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                  {(leader.roleId || "team-lead").replace(/-/g, " ")}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-xs text-muted-foreground hover:text-foreground" 
                asChild
                onClick={(e) => e.stopPropagation()}
              >
                <Link href={`/agents/${leader.id}`}>
                  {t.nav.profile} <ArrowRight className="size-3.5 ml-1.5" />
                </Link>
              </Button>
              <div className="w-px h-4 bg-border mx-1" />
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", openAgentId === leader.id && "rotate-180")} />
            </div>
          </div>
          
          {openAgentId === leader.id && (
            <div className="h-[400px] flex flex-col bg-background/50">
              <AgentChatArea 
                agentId={leader.id}
                agentName={leader.name}
                agentIcon={leader.icon || "🤖"}
                agentColor={leader.metadata?.avatarColor || "#6366f1"}
                userName={user?.name || "You"}
                token={token}
                newChatTrigger={0}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Team Members Compact List ────────────────────────────────────────── */}
      {members.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {members.map((member) => {
            return (
              <Link 
                key={member.id}
                href={`/agents/${member.id}`}
                className="flex items-center gap-2.5 p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
              >
                <div className="relative">
                  <div className="flex size-7 items-center justify-center rounded-full bg-muted text-sm">
                    {member.icon || "🤖"}
                  </div>
                  <span className={cn(
                    "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-1 ring-card bg-emerald-500"
                  )} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium leading-none truncate group-hover:underline">
                    {member.name}
                  </span>
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-1 truncate">
                    {(member.roleId || "agent").replace(/-/g, " ")}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
