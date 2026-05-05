"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Check, ChevronDown, ChevronUp,
  FileText, FolderKanban, GitBranch, Loader2, Plus, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Team {
  id: string; name: string; template?: string;
}

interface GitHubRepo {
  repoUrl: string;
  appId: string;
  installationId: string;
  privateKey: string;
  webhookSecret: string;
  expanded: boolean;
}

const emptyRepo = (): GitHubRepo => ({
  repoUrl: "", appId: "", installationId: "",
  privateKey: "", webhookSecret: "", expanded: true,
});

// ── Inline SVG Logos (Simple Icons) ──────────────────────────────────────────

function LinearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" aria-hidden>
      <path d="M1.22 61.06 38.94 98.78a50.04 50.04 0 0 1-37.72-37.72ZM0 49.08 50.92 100A50 50 0 0 1 0 49.08ZM10.93 23.55 76.45 89.07a50.07 50.07 0 0 1-8.05 5.4L5.53 31.6a50.07 50.07 0 0 1 5.4-8.05ZM22.26 11.8 88.2 77.74a50.17 50.17 0 0 1-5.78 7.54L14.72 17.58a50.17 50.17 0 0 1 7.54-5.78ZM36.15 4.55 95.45 63.85A50 50 0 0 1 50 100 50 50 0 0 1 0 50 50 50 0 0 1 36.15 4.55ZM50 0a50 50 0 0 1 50 50A50 50 0 0 1 50 0Z"/>
    </svg>
  );
}

function JiraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.762a1.005 1.005 0 0 0-1.001-1.005zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24.018 12.49V1.005A1.005 1.005 0 0 0 23.013 0z" fill="#2684FF"/>
    </svg>
  );
}

function TrelloIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M21 0H3C1.343 0 0 1.343 0 3v18c0 1.656 1.343 3 3 3h18c1.656 0 3-1.344 3-3V3c0-1.657-1.344-3-3-3zM10.44 18.18c0 .795-.645 1.44-1.44 1.44H4.56c-.795 0-1.44-.645-1.44-1.44V4.56c0-.795.645-1.44 1.44-1.44H9c.795 0 1.44.645 1.44 1.44v13.62zm10.44-7.44c0 .795-.645 1.44-1.44 1.44H15c-.795 0-1.44-.645-1.44-1.44V4.56c0-.795.645-1.44 1.44-1.44h4.44c.795 0 1.44.645 1.44 1.44v6.18z" fill="#0052CC"/>
    </svg>
  );
}

function NotionIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/>
    </svg>
  );
}

function ConfluenceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M.89 17.48c-.27.43-.57.96-.8 1.32a.77.77 0 0 0 .26 1.07l4.14 2.54c.38.23.88.12 1.12-.26.21-.35.49-.84.79-1.35 2.1-3.48 4.21-3.06 8.01-1.23l4.08 2c.4.2.88.04 1.1-.35l2.2-4.3a.78.78 0 0 0-.35-1.07l-4.22-2.07c-4.8-2.36-10.13-2.13-12.33 1.7zm22.2-10.97c.27-.43.57-.96.8-1.32a.77.77 0 0 0-.26-1.07L9.49.58a.78.78 0 0 0-1.12.26c-.21.35-.49.84-.79 1.34C5.48 5.66 3.37 5.25-.43 3.41L-4.51 1.4A.78.78 0 0 0-5.61 1.75L-7.81 6.05a.78.78 0 0 0 .35 1.07L-3.24 9.2c4.8 2.36 10.13 2.13 12.33-1.7z" fill="#2684FF"/>
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  );
}

// ── Provider Card ─────────────────────────────────────────────────────────────

function ProviderCard({ id, icon, label, description, enabled, selected, onSelect, comingSoon }: {
  id: string; icon: React.ReactNode; label: string; description: string;
  enabled: boolean; selected: boolean;
  onSelect?: () => void; comingSoon?: boolean;
}) {
  return (
    <button id={id} type="button"
      disabled={!enabled}
      onClick={() => enabled && onSelect?.()}
      className={cn(
        "relative flex flex-col items-center gap-2 rounded-xl border p-4 text-xs font-medium transition-all",
        !enabled && "cursor-not-allowed opacity-50",
        selected && enabled ? "border-primary bg-primary/5 shadow-sm"
          : enabled ? "border-border hover:border-primary/50 hover:bg-muted/30"
          : "border-border",
      )}>
      <div className="flex size-10 items-center justify-center">
        {icon}
      </div>
      <span className={cn("text-center font-semibold leading-tight", selected ? "text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
      <span className="text-center text-[10px] leading-tight text-muted-foreground/70">{description}</span>
      {selected && enabled && (
        <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary">
          <Check className="size-3 text-primary-foreground" />
        </span>
      )}
      {comingSoon && (
        <span className="absolute -top-2 -right-2 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
          Soon
        </span>
      )}
    </button>
  );
}

// ── GitHub Repo Card ──────────────────────────────────────────────────────────

function RepoCard({ repo, index, total, onUpdate, onRemove, onToggle }: {
  repo: GitHubRepo; index: number; total: number;
  onUpdate: <K extends keyof GitHubRepo>(k: K, v: GitHubRepo[K]) => void;
  onRemove: () => void;
  onToggle: () => void;
}) {
  return (
    <div id={`repo-card-${index}`} className="rounded-xl border border-border bg-background overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <GitHubIcon className="size-4 shrink-0 text-foreground" />
        <span className="flex-1 truncate text-sm font-medium text-foreground">
          {repo.repoUrl.trim() ? repo.repoUrl : `Repository ${index + 1}`}
        </span>
        <button type="button" onClick={onToggle}
          className="text-muted-foreground hover:text-foreground transition-colors">
          {repo.expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {total > 1 && (
          <button type="button" onClick={onRemove}
            className="text-muted-foreground transition-colors hover:text-destructive" aria-label="Remove repository">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {/* Expandable fields */}
      {repo.expanded && (
        <div className="flex flex-col gap-3 border-t border-border px-4 pb-4 pt-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`repo-url-${index}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Repository URL
            </label>
            <Input id={`repo-url-${index}`} value={repo.repoUrl}
              onChange={(e) => onUpdate("repoUrl", e.target.value)}
              placeholder="https://github.com/org/repo" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`repo-appid-${index}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                GitHub App ID
              </label>
              <Input id={`repo-appid-${index}`} value={repo.appId}
                onChange={(e) => onUpdate("appId", e.target.value)}
                placeholder="123456" />
              <p className="text-xs text-muted-foreground">Found in your GitHub App settings.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`repo-installation-${index}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Installation ID
              </label>
              <Input id={`repo-installation-${index}`} value={repo.installationId}
                onChange={(e) => onUpdate("installationId", e.target.value)}
                placeholder="78901234" />
              <p className="text-xs text-muted-foreground">From the App installation URL.</p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`repo-privkey-${index}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Private Key (PEM)
            </label>
            <textarea id={`repo-privkey-${index}`} value={repo.privateKey}
              onChange={(e) => onUpdate("privateKey", e.target.value)}
              placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none" />
            <p className="text-xs text-muted-foreground">Generate a private key in your GitHub App settings and paste the PEM here.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`repo-webhook-${index}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Webhook Secret <span className="ml-1 font-normal normal-case text-muted-foreground/60">(optional)</span>
            </label>
            <Input id={`repo-webhook-${index}`} value={repo.webhookSecret} type="password"
              onChange={(e) => onUpdate("webhookSecret", e.target.value)}
              placeholder="Your webhook secret" />
            <p className="text-xs text-muted-foreground">Used to verify webhook payloads from GitHub.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TeamIntegrationsPage() {
  const { token, isLoading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const teamId = String(params.id);

  const [isLoading, setIsLoading] = useState(true);
  const [team, setTeam] = useState<Team | null>(null);
  const [isSavingGitHub, setIsSavingGitHub] = useState(false);

  // PM integrations
  const [selectedPm, setSelectedPm] = useState<string>("internal");
  // Doc integrations
  const [selectedDoc, setSelectedDoc] = useState<string>("internal");
  // GitHub repos
  const [repos, setRepos] = useState<GitHubRepo[]>([emptyRepo()]);

  const isEngineering = team?.template === "engineering";

  const authHeaders = useCallback((): HeadersInit => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  useEffect(() => {
    if (authLoading) return;
    if (!token) { router.replace("/login"); return; }

    fetch(`${API_BASE}/teams/${teamId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setTeam(d.data))
      .catch(() => toast.error("Failed to load team."))
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const addRepo = () => setRepos((p) => [...p, emptyRepo()]);
  const removeRepo = (i: number) => setRepos((p) => p.filter((_, idx) => idx !== i));
  const toggleRepo = (i: number) => setRepos((p) => p.map((r, idx) => idx === i ? { ...r, expanded: !r.expanded } : r));
  const updateRepo = <K extends keyof GitHubRepo>(i: number, k: K, v: GitHubRepo[K]) =>
    setRepos((p) => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r));

  const saveGitHub = async () => {
    const valid = repos.filter((r) => r.repoUrl.trim() && r.appId.trim());
    if (valid.length === 0) { toast.error("Add at least one repository with a URL and App ID."); return; }
    setIsSavingGitHub(true);
    try {
      for (const repo of valid) {
        const r = await fetch(`${API_BASE}/teams/${teamId}/integrations`, {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({
            provider: "github",
            apiKey: repo.privateKey,
            metadata: { repoUrl: repo.repoUrl, appId: repo.appId, installationId: repo.installationId, webhookSecret: repo.webhookSecret },
          }),
        });
        if (!r.ok) throw new Error();
      }
      toast.success("GitHub integration saved.");
    } catch {
      toast.error("Failed to save GitHub integration.");
    } finally { setIsSavingGitHub(false); }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!team) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {/* Back link */}
      <Link href={`/teams/${teamId}`} id="back-to-team"
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Back to {team.name}
      </Link>

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">Connect your team&apos;s tools and repositories.</p>
      </div>

      <div className="flex flex-col gap-8">

        {/* ── Section 1: Project Management ── */}
        <section id="integrations-pm" className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <FolderKanban className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Project Management</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ProviderCard id="pm-kivo" enabled selected={selectedPm === "internal"} onSelect={() => setSelectedPm("internal")}
              icon={<span className="text-2xl">⚡</span>}
              label="Kivo" description="Built-in project tracking" />
            <ProviderCard id="pm-linear" enabled={false} comingSoon selected={false}
              icon={<LinearIcon className="size-6 text-[#5E6AD2]" />}
              label="Linear" description="Issue tracking & planning" />
            <ProviderCard id="pm-jira" enabled={false} comingSoon selected={false}
              icon={<JiraIcon className="size-6" />}
              label="Jira" description="Atlassian project tracking" />
            <ProviderCard id="pm-trello" enabled={false} comingSoon selected={false}
              icon={<TrelloIcon className="size-6" />}
              label="Trello" description="Visual kanban boards" />
          </div>

          {selectedPm === "internal" && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
              <Check className="size-4 text-primary shrink-0" />
              <p className="text-xs text-primary font-medium">Kivo internal tracking is active for this team.</p>
            </div>
          )}
        </section>

        {/* ── Section 2: Documentation ── */}
        <section id="integrations-docs" className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Documentation</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ProviderCard id="doc-kivo" enabled selected={selectedDoc === "internal"} onSelect={() => setSelectedDoc("internal")}
              icon={<span className="text-2xl">📁</span>}
              label="Kivo" description="Built-in knowledge base" />
            <ProviderCard id="doc-notion" enabled={false} comingSoon selected={false}
              icon={<NotionIcon className="size-6 text-foreground" />}
              label="Notion" description="Connected workspace" />
            <ProviderCard id="doc-confluence" enabled={false} comingSoon selected={false}
              icon={<ConfluenceIcon className="size-6" />}
              label="Confluence" description="Atlassian wiki" />
          </div>

          {selectedDoc === "internal" && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
              <Check className="size-4 text-primary shrink-0" />
              <p className="text-xs text-primary font-medium">Kivo internal documentation is active for this team.</p>
            </div>
          )}
        </section>

        {/* ── Section 3: GitHub (engineering only) ── */}
        {isEngineering ? (
          <section id="integrations-github" className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <GitBranch className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">GitHub</h2>
            </div>
            <p className="mb-5 text-xs text-muted-foreground">
              Connect one or more repositories. Each repo requires a GitHub App installation.
            </p>

            <div className="flex flex-col gap-3">
              {repos.map((repo, i) => (
                <RepoCard key={i} repo={repo} index={i} total={repos.length}
                  onUpdate={(k, v) => updateRepo(i, k, v)}
                  onRemove={() => removeRepo(i)}
                  onToggle={() => toggleRepo(i)} />
              ))}

              <Button id="integrations-add-repo" type="button" variant="outline" size="sm"
                className="gap-1.5 self-start" onClick={addRepo}>
                <Plus className="size-3.5" />
                Add Repository
              </Button>
            </div>

            <Button id="integrations-save-github" className="mt-5 w-full gap-2 font-semibold"
              disabled={isSavingGitHub} onClick={saveGitHub}>
              {isSavingGitHub
                ? <><Loader2 className="size-3.5 animate-spin" /> Saving…</>
                : <><GitBranch className="size-3.5" /> Save GitHub Integration</>}
            </Button>
          </section>
        ) : (
          <section id="integrations-github-locked" className="rounded-2xl border border-dashed border-border bg-muted/10 p-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/40">
                <GitHubIcon className="size-5 text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">GitHub Integration</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Available for <strong>Engineering</strong> teams only. Change your team template in General Settings to unlock.
                </p>
              </div>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
