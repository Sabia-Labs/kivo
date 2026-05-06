"use client";

import Link from "next/link";
import {
  Activity, ArrowRight, Check, Cpu, GitMerge, ShieldCheck, TrendingUp, X, CheckCircle2, AlertCircle, PlayCircle, Clock, CheckCircle, Database
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";


// Mock Dashboard Components for the Hero
const MockDashboard = () => {
  return (
    <div className="relative w-full max-w-2xl mx-auto lg:mx-0 mt-12 lg:mt-0 perspective-[2000px]">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-primary/20 blur-[100px] rounded-full z-0" />
      
      {/* Main Panel */}
      <div className="relative z-10 rounded-xl border border-border/50 bg-background/60 backdrop-blur-xl shadow-2xl shadow-primary/5 overflow-hidden transition-transform duration-700 ease-out hover:scale-[1.02]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/20">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Badge variant="outline" className="h-5 px-1.5 bg-primary/10 text-primary border-primary/20">Active: Engineering</Badge>
          </div>
        </div>
        
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Sprint Execution</h3>
              <p className="text-xs text-muted-foreground">Team Lead orchestrating 3 agents</p>
            </div>
            <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full border-2 border-background bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white shadow-sm z-30">TL</div>
              <div className="w-8 h-8 rounded-full border-2 border-background bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shadow-sm z-20">SE</div>
              <div className="w-8 h-8 rounded-full border-2 border-background bg-violet-500 flex items-center justify-center text-[10px] font-bold text-white shadow-sm z-10">SA</div>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/50">
              <div className="p-2 rounded-md bg-primary/10 text-primary">
                <GitMerge className="size-4" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-medium">Implement OAuth2</span>
                  <span className="text-xs text-muted-foreground">In Progress</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary h-full rounded-full w-[65%] animate-pulse" />
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/50">
              <div className="p-2 rounded-md bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                <ShieldCheck className="size-4" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between">
                  <span className="text-xs font-medium">Pending Approval: DB Migration</span>
                  <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">Review</span>
                </div>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs px-2">Approve</Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Floating Elements */}
      <div className="absolute -right-8 top-12 z-20 animate-[bounce_4s_ease-in-out_infinite] hidden md:block">
        <div className="rounded-lg border border-border/50 bg-background/80 backdrop-blur-md shadow-lg p-3 flex items-center gap-3">
          <Activity className="size-5 text-green-500" />
          <div>
            <div className="text-xs font-bold">Health Score</div>
            <div className="text-xl font-bold text-foreground">98%</div>
          </div>
        </div>
      </div>
      
      <div className="absolute -left-12 bottom-12 z-20 animate-[bounce_5s_ease-in-out_infinite_reverse] hidden md:block">
        <div className="rounded-lg border border-border/50 bg-background/80 backdrop-blur-md shadow-lg p-3">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Live Stream</div>
          <div className="space-y-1.5">
            <div className="flex gap-2 items-center"><span className="w-1.5 h-1.5 rounded-full bg-primary" /><span className="text-xs">SE opened PR #142</span></div>
            <div className="flex gap-2 items-center"><span className="w-1.5 h-1.5 rounded-full bg-primary" /><span className="text-xs">SA reviewed architecture</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const signupHref = user ? `/redirect-app?path=/teams` : "/signup";

  return (
    <div className="flex flex-col bg-background selection:bg-primary/20">
      
      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border/50 bg-background pt-24 pb-32 lg:pt-36 lg:pb-40">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary/20 opacity-20 blur-[100px]" />
        
        <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            <div className="flex flex-col items-start gap-8 max-w-2xl">
              <Badge variant="outline" className="px-3 py-1.5 text-xs font-medium tracking-wide bg-primary/5 border-primary/20 text-primary rounded-full">
                {t.hero.badge}
              </Badge>
              
              <h1 className="text-5xl font-semibold tracking-tight text-foreground sm:text-6xl md:text-[4rem] leading-[1.1]">
                {t.hero.headline}
              </h1>
              
              <p className="text-lg text-muted-foreground sm:text-xl leading-relaxed max-w-xl">
                {t.hero.subheadline}
              </p>
              
              <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 w-full sm:w-auto">
                <Button asChild size="lg" className="px-8 h-12 text-base w-full sm:w-auto rounded-full font-medium shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 hover:-translate-y-0.5">
                  <Link href={signupHref}>
                    {t.hero.ctaPrimary}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="px-8 h-12 text-base w-full sm:w-auto rounded-full font-medium hover:bg-muted/50">
                  <Link href="#templates">
                    {t.hero.ctaSecondary}
                  </Link>
                </Button>
              </div>
            </div>
            
            {/* Hero Visual */}
            <div className="w-full flex justify-center lg:justify-end">
              <MockDashboard />
            </div>
          </div>
        </div>
      </section>

      {/* ─── STATS / LOGOS ─────────────────────────────────────────────── */}
      <section className="border-b border-border/50 bg-muted/10 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4 divide-y md:divide-y-0 md:divide-x divide-border/50">
            {t.stats.items.map((stat, i) => (
              <div key={i} className="flex flex-col items-center justify-center pt-8 md:pt-0 text-center px-4 transition-transform hover:scale-105 duration-300">
                <span className="text-4xl lg:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/60 tracking-tight mb-2">{stat.value}</span>
                <span className="text-sm font-medium text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW KIVO WORKS ───────────────────────────────────────────── */}
      <section className="py-24 sm:py-32 bg-background relative overflow-hidden">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-secondary/10 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <Badge variant="outline" className="mb-4">{t.howItWorks.sectionBadge}</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.howItWorks.sectionTitle}</h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line for desktop */}
            <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-border via-border to-border/10" />
            
            {t.howItWorks.steps.map((step, i) => (
              <div key={i} className="relative group">
                <div className="w-12 h-12 bg-card border border-border shadow-sm rounded-xl flex items-center justify-center font-bold text-lg mb-6 relative z-10 group-hover:border-primary group-hover:text-primary transition-colors">
                  {step.number}
                </div>
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── VISUAL PRODUCT SHOWCASE ──────────────────────────────────── */}
      <section className="py-24 sm:py-32 bg-muted/20 border-y border-border/50">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1 relative h-[500px] rounded-2xl border bg-card/40 backdrop-blur-sm overflow-hidden shadow-2xl p-6 flex flex-col gap-6">
               <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/20" />
               <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-center gap-3 mb-8">
                    <Database className="text-primary size-5" />
                    <span className="font-semibold">Context Memory</span>
                  </div>
                  <div className="space-y-4 flex-1">
                    <div className="p-4 rounded-xl bg-background border shadow-sm">
                      <div className="text-xs text-muted-foreground mb-1">Git Blob • a3f89b2</div>
                      <div className="font-mono text-sm text-foreground/80">{"{"}</div>
                      <div className="font-mono text-sm pl-4 text-primary">"decision": "Use Postgres over MySQL",</div>
                      <div className="font-mono text-sm pl-4 text-green-600 dark:text-green-400">"reason": "Team preference and existing infra setup",</div>
                      <div className="font-mono text-sm text-foreground/80">{"}"}</div>
                    </div>
                    <div className="p-4 rounded-xl bg-background border shadow-sm opacity-80 scale-95 origin-top">
                      <div className="text-xs text-muted-foreground mb-1">Git Blob • 8f2c1a9</div>
                      <div className="font-mono text-sm text-foreground/80">{"{"}</div>
                      <div className="font-mono text-sm pl-4 text-primary">"api_pattern": "RESTful with GraphQL gateway"</div>
                      <div className="font-mono text-sm text-foreground/80">{"}"}</div>
                    </div>
                  </div>
               </div>
            </div>
            
            <div className="order-1 lg:order-2">
              <Badge variant="outline" className="mb-4">{(t as any).governance?.sectionBadge}</Badge>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl mb-6">{(t as any).governance?.sectionTitle}</h2>
              <p className="text-lg text-muted-foreground mb-8">
                {(t as any).governance?.sectionSubtitle}
              </p>
              
              <ul className="space-y-4">
                {((t as any).governance?.items || []).slice(0, 4).map((item: any, i: number) => (
                  <li key={i} className="flex gap-3">
                    <CheckCircle2 className="size-6 text-primary shrink-0" />
                    <div>
                      <div className="font-medium">{item.kivo}</div>
                      <div className="text-sm text-muted-foreground">{item.old}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── TEMPLATES ────────────────────────────────────────────────── */}
      <section id="templates" className="py-24 sm:py-32 relative">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
          <div className="mb-16 text-center max-w-3xl mx-auto">
            <Badge variant="outline" className="mb-4">{t.templates.sectionBadge}</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl mb-4">{t.templates.sectionTitle}</h2>
            <p className="text-lg text-muted-foreground">{t.templates.sectionSubtitle}</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {t.templates.items.map((tmpl, i) => {
              const isComingSoon = tmpl.badge === "Coming Soon" || tmpl.badge === "即将推出";
              return (
                <div key={i} className={`group relative flex flex-col rounded-2xl border bg-card p-8 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${isComingSoon ? 'opacity-70' : 'hover:border-primary/50'}`}>
                  {tmpl.badge && (
                    <Badge className={`absolute top-6 right-6 ${isComingSoon ? 'bg-muted text-muted-foreground' : 'bg-primary'}`} variant={isComingSoon ? "secondary" : "default"}>
                      {tmpl.badge}
                    </Badge>
                  )}
                  <div className="mb-6 inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-2xl text-primary ring-1 ring-inset ring-primary/20 group-hover:scale-110 transition-transform">
                    {tmpl.icon}
                  </div>
                  <h3 className="mb-3 text-xl font-semibold">{tmpl.title}</h3>
                  <p className="text-muted-foreground mb-8 flex-1 leading-relaxed">{tmpl.description}</p>
                  <Button variant={isComingSoon ? "outline" : "default"} disabled={isComingSoon} asChild={!isComingSoon} className="w-full sm:w-auto self-start rounded-full">
                    {isComingSoon ? <span>{tmpl.cta}</span> : <Link href={signupHref}>{tmpl.cta}</Link>}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────────── */}
      <section id="contact" className="relative py-32 sm:py-40 border-t border-border/50 overflow-hidden">
        {/* Abstract background */}
        <div className="absolute inset-0 bg-primary/5" />
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-full max-w-4xl h-full bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent pointer-events-none" />
        
        <div className="mx-auto max-w-3xl px-6 relative z-10 text-center">
          <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl mb-6">{t.cta.headline}</h2>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">{t.cta.subheadline}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg" className="px-10 h-14 text-lg rounded-full shadow-xl shadow-primary/20 hover:scale-105 transition-transform">
              <Link href={signupHref}>{t.cta.ctaPrimary}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="px-10 h-14 text-lg rounded-full hover:bg-muted/50">
              <Link href="mailto:sales@sabia.com">{(t as any).hero.ctaSecondary}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ───────────────────────────────────────────────────── */}
      <footer className="border-t border-border/50 bg-background pt-16 pb-8">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid gap-12 md:grid-cols-4 lg:grid-cols-5 mb-16">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 font-bold text-xl tracking-tight mb-4">
                <svg className="size-6" viewBox="0 0 24 24" fill="none">
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
                {t.brand}
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">{t.footer.tagline}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-6">{t.footer.product}</h4>
              <ul className="space-y-4 text-sm text-muted-foreground">
                <li><Link href="#features" className="hover:text-primary transition-colors">{t.footer.links.features}</Link></li>
                <li><Link href="#templates" className="hover:text-primary transition-colors">{t.templates.sectionBadge}</Link></li>
                <li><Link href="#docs" className="hover:text-primary transition-colors">{t.footer.links.docs}</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-6">{t.footer.company}</h4>
              <ul className="space-y-4 text-sm text-muted-foreground">
                <li><Link href="#about" className="hover:text-primary transition-colors">{t.footer.links.about}</Link></li>
                <li><Link href="#blog" className="hover:text-primary transition-colors">{t.footer.links.blog}</Link></li>
                <li><Link href="#contact" className="hover:text-primary transition-colors">{t.footer.links.contact}</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-6">{t.footer.legal}</h4>
              <ul className="space-y-4 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-primary transition-colors">{t.footer.links.privacy}</Link></li>
                <li><Link href="#" className="hover:text-primary transition-colors">{t.footer.links.terms}</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-border/50 text-center text-sm text-muted-foreground flex flex-col md:flex-row justify-between items-center gap-4">
            <p>{t.footer.copyright}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
