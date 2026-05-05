"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot, Check, Loader2, UserPlus, Cpu } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentType = "software_engineer" | "software_architect" | "product_manager" | "team_lead";

interface Role {
  key: AgentType;
  title: string;
  description: string;
  icon: string;
  color: string;
}

const ROLES: Role[] = [
  {
    key: "software_engineer",
    title: "Software Engineer",
    description: "Codes features, fixes bugs, writes tests and reviews PRs.",
    icon: "🛠️",
    color: "#3b82f6",
  },
  {
    key: "software_architect",
    title: "Software Architect",
    description: "Designs systems, guards technical standards, makes key tech decisions.",
    icon: "🏛️",
    color: "#8b5cf6",
  },
  {
    key: "product_manager",
    title: "Product Manager",
    description: "Owns the roadmap, writes specs, coordinates delivery with the team.",
    icon: "📋",
    color: "#ec4899",
  },
  {
    key: "team_lead",
    title: "Team Lead",
    description: "Coordinates the team and owns delivery.",
    icon: "👑",
    color: "#6366f1",
  },
];

export default function NewAgentPage() {
  const { token, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const teamId = String(params.id);

  const [teamName, setTeamName] = useState("");
  const [name, setName] = useState("");
  const [selectedRole, setSelectedRole] = useState<AgentType>("software_engineer");
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingTeam, setIsLoadingTeam] = useState(true);

  // ── Load team info ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      router.replace("/login");
      return;
    }

    fetch(`${API_BASE}/teams/${teamId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.data) setTeamName(d.data.name);
        else toast.error("Team not found");
      })
      .catch(() => toast.error("Failed to load team data"))
      .finally(() => setIsLoadingTeam(false));
  }, [authLoading, token, teamId, router]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Agent name is required.");
      return;
    }
    if (!token) return;

    setIsCreating(true);
    try {
      const r = await fetch(`${API_BASE}/agents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          teamId,
          name: name.trim(),
          type: selectedRole,
        }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? "Failed to create agent.");
      }

      toast.success("Agent added successfully!");
      router.push(`/teams/${teamId}`);
    } catch (err: any) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setIsCreating(false);
    }
  };

  if (authLoading || isLoadingTeam) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      {/* Back link */}
      <Link
        href={`/teams/${teamId}`}
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to {teamName || "Team"}
      </Link>

      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <UserPlus className="size-7" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Add New Agent</h1>
        <p className="mt-2 text-muted-foreground">
          Deploy a new autonomous developer to <strong>{teamName}</strong>.
        </p>
      </div>

      <form onSubmit={handleCreate} className="space-y-8">
        {/* Name Input */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-full bg-primary/20 text-primary">
              <Check className="size-3.5" />
            </div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Identity</h2>
          </div>
          <div className="space-y-2">
            <label htmlFor="agent-name" className="text-sm font-medium">
              Agent Name
            </label>
            <Input
              id="agent-name"
              placeholder="e.g. Alice, Bob, or a descriptive role"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl"
              autoFocus
            />
          </div>
        </section>

        {/* Role Selection */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-full bg-primary/20 text-primary">
              <Check className="size-3.5" />
            </div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Expertise & Role</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ROLES.map((role) => {
              const isSelected = selectedRole === role.key;
              return (
                <button
                  key={role.key}
                  type="button"
                  onClick={() => setSelectedRole(role.key)}
                  className={cn(
                    "group flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all",
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                      : "border-border hover:border-primary/40 hover:bg-muted/5"
                  )}
                >
                  <div
                    className="flex size-10 items-center justify-center rounded-lg text-xl shadow-sm transition-transform group-hover:scale-105"
                    style={{ background: role.color + "20" }}
                  >
                    {role.icon}
                  </div>
                  <div>
                    <p className={cn("text-sm font-bold", isSelected ? "text-primary" : "text-foreground")}>
                      {role.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                      {role.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Actions */}
        <div className="flex items-center gap-4 pt-4">
          <Button
            type="submit"
            disabled={isCreating || !name.trim()}
            className="h-12 flex-1 rounded-xl font-bold shadow-md transition-all active:scale-95"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Deploying Agent...
              </>
            ) : (
              "Deploy Agent 🚀"
            )}
          </Button>
          <Link href={`/teams/${teamId}`} className="flex-1">
            <Button type="button" variant="outline" className="h-12 w-full rounded-xl font-semibold">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
