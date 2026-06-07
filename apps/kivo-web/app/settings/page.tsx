"use client";

import { useTranslation, languages } from "@/lib/i18n";
import { useAuth, API_BASE } from "@/lib/auth";
import { Settings, Globe, Shield, Terminal, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function SettingsPage() {
  const { t, lang, setLang } = useTranslation();
  const { user, token, workspaceId } = useAuth();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12 w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* ── HEADER ── */}
      <header className="flex flex-col gap-4 border-b pb-6 border-border/40">
        <div className="flex items-center gap-2">
          <Settings className="size-5 text-primary animate-spin-slow" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t.nav.settings}
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">
          {t.teamsPage.settings}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t.systemSettings.subtitle}
        </p>
      </header>

      {/* ── SETTINGS BOXES ── */}
      <div className="space-y-6">
        {/* ── LANG PREFERENCES ── */}
        <section className="rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border">
              <Globe className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">{t.systemSettings.langRegionTitle}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.systemSettings.langRegionDesc}
              </p>
            </div>
          </div>

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            {languages.map((l) => {
              const isActive = lang === l.code;
              return (
                <button
                  key={l.code}
                  onClick={async () => {
                    setLang(l.code);
                    if (workspaceId && token) {
                      try {
                        await fetch(`${API_BASE}/workspaces/${workspaceId}/language`, {
                          method: "PUT",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                          },
                          body: JSON.stringify({ language: l.code })
                        });
                      } catch (err) {
                        console.error("Failed to sync language to workspace settings in DB", err);
                      }
                    }
                    toast.success(t.systemSettings.langChangedToast.replace("{label}", l.label));
                  }}
                  className={`flex items-center justify-between p-4 border rounded-xl bg-card hover:bg-accent/40 transition-all text-sm font-semibold ${
                    isActive
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg leading-none">{l.flag}</span>
                    <span>{l.label}</span>
                  </div>
                  {isActive && (
                    <span className="size-2 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── SECURITY TUNNELS ── */}
        <section className="rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border">
              <Shield className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">{t.systemSettings.securityTitle}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.systemSettings.securityDesc}
              </p>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl bg-muted/20 gap-3">
              <div>
                <p className="font-semibold text-xs leading-none">{t.systemSettings.sshStatusLabel}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.systemSettings.sshStatusDesc}
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-500">
                {t.systemSettings.connectedBadge}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl bg-muted/20 gap-3">
              <div>
                <p className="font-semibold text-xs leading-none">{t.systemSettings.privilegeLabel}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.systemSettings.privilegeDesc}
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-xs font-semibold text-blue-500">
                {t.systemSettings.sandboxBadge}
              </span>
            </div>
          </div>
        </section>

        {/* ── METADATA & WORKSPACE ── */}
        <section className="rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border">
              <Terminal className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">{t.systemSettings.systemInfoTitle}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.systemSettings.systemInfoDesc}
              </p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between border-b pb-2 border-border/40">
              <span className="text-muted-foreground flex items-center gap-1">
                <User className="size-3" /> {t.systemSettings.userContextId}
              </span>
              <span className="font-mono text-[10px] select-all">{user?.id || "N/A"}</span>
            </div>
            <div className="flex items-center justify-between border-b pb-2 border-border/40">
              <span className="text-muted-foreground">{t.systemSettings.workspaceIdentifier}</span>
              <span className="font-mono text-[10px] select-all">{workspaceId || "N/A"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t.systemSettings.gatewayAddress}</span>
              <span className="font-semibold text-muted-foreground">{t.systemSettings.gatewayLoopback}</span>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={() => toast.success(t.systemSettings.settingsSavedToast)}>
              {t.systemSettings.saveChanges}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
