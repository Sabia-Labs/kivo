"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import {
  Users,
  Bot,
  Activity,
  Plus,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
  Loader2
} from "lucide-react";

export default function HomePage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12 w-full flex flex-col gap-8 animate-in fade-in duration-300">
      {/* ── HEADER GREETING ── */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-6 border-border/40">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded overflow-hidden">
              <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-full">
                <defs>
                  <linearGradient id="kivo-logo-top-home" x1="20" y1="20" x2="80" y2="50" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#67E8A6" />
                    <stop offset="100%" stopColor="#1EAA6D" />
                  </linearGradient>
                  <linearGradient id="kivo-logo-bottom-home" x1="20" y1="80" x2="80" y2="50" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#0E5A35" />
                    <stop offset="60%" stopColor="#149457" />
                    <stop offset="100%" stopColor="#0F6E40" />
                  </linearGradient>
                  <linearGradient id="kivo-logo-shadow-home" x1="36" y1="54" x2="52" y2="70" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#042011" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#042011" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M 20 20 H 80 V 35 L 48 56 L 36 44 L 36 36 L 20 52 V 20 Z" fill="url(#kivo-logo-top-home)" />
                <path d="M 20 60 L 36 44 V 80 H 20 Z" fill="url(#kivo-logo-bottom-home)" />
                <path d="M 36 44 L 80 65 V 80 H 52 L 36 58 Z" fill="url(#kivo-logo-bottom-home)" />
                <path d="M 36 44 L 52 80 L 36 58 Z" fill="url(#kivo-logo-shadow-home)" />
              </svg>
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              {t.homePage.kivoBrand}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">
            {user?.name
              ? t.homePage.welcomeBack.replace("{name}", user.name)
              : t.homePage.welcomeBackDefault}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t.homePage.tagline}
          </p>
        </div>
      </header>

      {/* ── QUICK METRICS ── */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:border-primary/20 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t.homePage.metrics.healthTitle}
            </span>
            <Activity className="size-4 text-emerald-500" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold tracking-tight">100%</span>
            <p className="text-xs text-muted-foreground mt-1">
              {t.homePage.metrics.healthDesc}
            </p>
          </div>
          <div className="absolute right-0 bottom-0 size-20 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors" />
        </div>

        <div className="rounded-xl border bg-card p-5 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:border-primary/20 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t.homePage.metrics.approvalsTitle}
            </span>
            <ShieldAlert className="size-4 text-amber-500" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold tracking-tight">0</span>
            <p className="text-xs text-muted-foreground mt-1">
              {t.homePage.metrics.approvalsDesc}
            </p>
          </div>
          <div className="absolute right-0 bottom-0 size-20 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-colors" />
        </div>

        <div className="rounded-xl border bg-card p-5 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:border-primary/20 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t.homePage.metrics.velocityTitle}
            </span>
            <TrendingUp className="size-4 text-emerald-500" />
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-2.5">
              <span className="text-3xl font-bold tracking-tight">184</span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-500 border border-emerald-500/20">
                +12.4%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {t.homePage.metrics.velocityDesc}
            </p>
          </div>
          <div className="absolute right-0 bottom-0 size-20 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
        </div>
      </div>

      {/* ── WORKPLACE OPTIONS ── */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Core Quickstart Panel */}
        <div className="lg:col-span-2 rounded-xl border bg-card/40 p-6 flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t.homePage.getStarted.title}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t.homePage.getStarted.subtitle}
            </p>
          </div>

          <div className="grid gap-3">
            {/* Button 1: Your Teams */}
            <Link
              href="/teams"
              className="flex items-center justify-between p-4 border rounded-xl bg-card hover:bg-accent/40 hover:border-primary/30 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.homePage.getStarted.btnYourTeams}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.homePage.getStarted.btnYourTeamsDesc}
                  </p>
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary transition-colors group-hover:translate-x-1" />
            </Link>

            {/* Button 2: Deploy New Team */}
            <Link
              href="/newteam"
              className="flex items-center justify-between p-4 border rounded-xl bg-card hover:bg-accent/40 hover:border-primary/30 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Plus className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.homePage.getStarted.btnDeployTeam}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.homePage.getStarted.btnDeployTeamDesc}
                  </p>
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary transition-colors group-hover:translate-x-1" />
            </Link>

            {/* Button 3: Manage Active Agents */}
            <Link
              href="/agents"
              className="flex items-center justify-between p-4 border rounded-xl bg-card hover:bg-accent/40 hover:border-primary/30 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Bot className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.homePage.getStarted.btnManageAgents}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.homePage.getStarted.btnManageAgentsDesc}
                  </p>
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary transition-colors group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        {/* Sidebar Status Info */}
        <div className="rounded-xl border bg-card/40 p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">{t.homePage.infrastructure.title}</h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between border-b pb-2 border-border/40">
                <span className="text-muted-foreground">{t.homePage.infrastructure.k8s}</span>
                <span className="font-semibold text-emerald-500">{t.homePage.infrastructure.k8sVal}</span>
              </div>
              <div className="flex items-center justify-between border-b pb-2 border-border/40">
                <span className="text-muted-foreground">{t.homePage.infrastructure.telegram}</span>
                <span className="font-semibold text-emerald-500">{t.homePage.infrastructure.telegramVal}</span>
              </div>
              <div className="flex items-center justify-between border-b pb-2 border-border/40">
                <span className="text-muted-foreground">{t.homePage.infrastructure.git}</span>
                <span className="font-semibold text-emerald-500">{t.homePage.infrastructure.gitVal}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t.homePage.infrastructure.api}</span>
                <span className="font-semibold text-emerald-500">{t.homePage.infrastructure.apiVal}</span>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-border/40 text-[10px] text-muted-foreground text-center">
            {t.homePage.infrastructure.controller}
          </div>
        </div>
      </div>
    </div>
  );
}
