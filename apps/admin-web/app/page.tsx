"use client";

import Link from "next/link";
import {
  Activity, ArrowRight, Check, Cpu, GitMerge, ShieldCheck, TrendingUp, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

const pillarIcons: Record<string, React.ElementType> = {
  TrendingUp, Activity, ShieldCheck, GitMerge,
};

const KIVO_WEB_URL = process.env.NEXT_PUBLIC_KIVO_WEB_URL ?? "http://localhost:3000";

export default function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const signupHref = user ? `${KIVO_WEB_URL}/teams` : "/signup";

  return (
    <div className="flex flex-col bg-background">
      
      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      <section id="hero" className="flex flex-col items-center justify-center px-4 py-32 text-center sm:py-40">
        <div className="flex flex-col items-center gap-8 max-w-3xl mx-auto">
          <Badge variant="secondary" className="px-3 py-1 text-xs font-medium tracking-wide">
            {t.hero.badge}
          </Badge>
          
          <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl md:text-7xl">
            {t.hero.headline.split("\n").map((line, i) => (
              <span key={i} className="block">{line}</span>
            ))}
          </h1>
          
          <p className="max-w-2xl text-lg text-muted-foreground sm:text-xl">
            {t.hero.subheadline}
          </p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
            <Button asChild size="lg" className="px-8 h-12 text-base">
              <Link href={signupHref}>
                {t.hero.ctaPrimary}
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="px-8 h-12 text-base border">
              <Link href="#contact">
                {t.hero.ctaSecondary}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── STATS ─────────────────────────────────────────────────────── */}
      <section className="border-y bg-muted/20">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {t.stats.items.map((stat, i) => (
              <div key={i} className="flex flex-col items-center gap-2 text-center">
                <span className="text-4xl font-bold text-foreground tracking-tight">{stat.value}</span>
                <span className="text-sm text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TEMPLATES ────────────────────────────────────────────────── */}
      <section id="templates" className="px-4 py-24 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="mb-16">
          <h2 className="text-3xl font-bold tracking-tight mb-4">{t.templates.sectionTitle}</h2>
          <p className="max-w-2xl text-muted-foreground">{t.templates.sectionSubtitle}</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {t.templates.items.map((tmpl, i) => {
            const isComingSoon = tmpl.badge === "Coming Soon" || tmpl.badge === "即将推出";
            return (
              <div key={i} className={`flex flex-col rounded-xl border bg-card p-6 ${isComingSoon ? 'opacity-60 grayscale' : 'hover:border-primary/50 transition-colors'}`}>
                <div className="mb-4 text-3xl">{tmpl.icon}</div>
                <h3 className="mb-2 text-lg font-bold">{tmpl.title}</h3>
                <p className="text-sm text-muted-foreground mb-6 flex-1">{tmpl.description}</p>
                <Button variant={isComingSoon ? "outline" : "default"} disabled={isComingSoon} asChild={!isComingSoon} className="w-full">
                  {isComingSoon ? <span>{tmpl.cta}</span> : <Link href={signupHref}>{tmpl.cta}</Link>}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── CHAOS vs 灵巢 WAY ───────────────────────────────────────── */}
      <section id="about" className="bg-muted/30 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight mb-4">{t.chaos.sectionTitle}</h2>
            <p className="max-w-2xl mx-auto text-muted-foreground">{t.chaos.sectionSubtitle}</p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            <div className="flex flex-col rounded-xl bg-card border p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex size-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><X className="size-4" /></div>
                <span className="font-bold">{t.chaos.oldWayTitle}</span>
              </div>
              <ul className="flex flex-col gap-4">
                {t.chaos.items.map((item, i) => (
                  <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                    <X className="size-4 shrink-0 text-destructive mt-0.5" /> {item.old}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col rounded-xl bg-card border p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Check className="size-4" /></div>
                <span className="font-bold">{t.chaos.kivoWayTitle}</span>
              </div>
              <ul className="flex flex-col gap-4">
                {t.chaos.items.map((item, i) => (
                  <li key={i} className="flex gap-3 text-sm text-foreground">
                    <Check className="size-4 shrink-0 text-primary mt-0.5" /> {item.kivo}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────────── */}
      <section id="contact" className="px-4 py-32 text-center">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-4xl font-bold tracking-tight mb-6">{t.cta.headline}</h2>
          <p className="text-lg text-muted-foreground mb-10">{t.cta.subheadline}</p>
          <div className="flex items-center justify-center gap-4">
            <Button asChild size="lg" className="px-8 h-12">
              <Link href={signupHref}>{t.cta.ctaPrimary}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ───────────────────────────────────────────────────── */}
      <footer className="border-t bg-card px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl grid gap-8 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2 font-bold tracking-tight mb-4">
              <svg className="size-5" viewBox="0 0 24 24" fill="none">
                <defs>
                  <linearGradient id="kivoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
                <path d="M6 17 L12 6 L18 17 Z" stroke="url(#kivoGradient)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="6" cy="17" r="2" fill="url(#kivoGradient)" />
                <circle cx="12" cy="6" r="2" fill="url(#kivoGradient)" />
                <circle cx="18" cy="17" r="2" fill="url(#kivoGradient)" />
              </svg>
              Kivo
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">{t.footer.tagline}</p>
          </div>
          <div>
            <span className="font-semibold block mb-4">Product</span>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="#features" className="hover:text-foreground">Features</Link></li>
              <li><Link href="#pricing" className="hover:text-foreground">Pricing</Link></li>
              <li><Link href="#docs" className="hover:text-foreground">Documentation</Link></li>
            </ul>
          </div>
          <div>
            <span className="font-semibold block mb-4">Company</span>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="#about" className="hover:text-foreground">About</Link></li>
              <li><Link href="#blog" className="hover:text-foreground">Blog</Link></li>
              <li><Link href="#contact" className="hover:text-foreground">Contact</Link></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
