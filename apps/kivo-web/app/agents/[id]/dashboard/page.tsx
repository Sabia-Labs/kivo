"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle, Zap } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ── Mock data ─────────────────────────────────────────────────────────────────

function generateDailyData() {
  return ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(
    (day) => ({ day, tasks: Math.floor(Math.random() * 8) })
  );
}
function generateTokenData() {
  let base = 20000;
  return ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day) => {
    base += Math.floor((Math.random() - 0.3) * 5000);
    return { day, tokens: Math.max(0, base) };
  });
}

const MOCK_CURRENT_TASK = "Implement authentication middleware for the REST API";
const MOCK_RECENT = [
  { title: "Write unit tests for UserService",  date: "Apr 12" },
  { title: "Fix CORS configuration in Express", date: "Apr 11" },
  { title: "Set up Drizzle schema for Teams",   date: "Apr 10" },
  { title: "Configure CI with GitHub Actions",  date: "Apr  9" },
  { title: "Add Zod validation to agent routes",date: "Apr  8" },
];

const ACCENT = "#06b6d4";

export default function AgentDashboardPage() {
  const params    = useParams();
  const agentId   = String(params.id);
  const [daily]   = useState(generateDailyData);
  const [tokens]  = useState(generateTokenData);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href={`/agents/${agentId}`} id="dashboard-back"
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Back to Agent
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Activity summary and performance metrics.</p>
      </div>

      <div className="flex flex-col gap-5">
        {/* Current task */}
        <div className="rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-md" style={{ color: ACCENT, background: ACCENT + "18" }}>
              <Zap className="size-3.5" />
            </span>
            <span className="text-xs font-semibold text-foreground">Current Task</span>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-background px-4 py-3">
            <div className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-primary">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            </div>
            <p className="text-xs font-medium text-foreground leading-relaxed">{MOCK_CURRENT_TASK}</p>
          </div>
        </div>

        {/* Recent tasks */}
        <div className="rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-md" style={{ color: ACCENT, background: ACCENT + "18" }}>
              <CheckCircle2 className="size-3.5" />
            </span>
            <span className="text-xs font-semibold text-foreground">Recent Tasks</span>
          </div>
          <div className="flex flex-col gap-1">
            {MOCK_RECENT.map((t, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg px-2 py-1.5">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                <p className="flex-1 text-xs text-foreground leading-snug">{t.title}</p>
                <span className="shrink-0 text-[10px] text-muted-foreground">{t.date}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Daily contributions chart */}
        <div className="rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-md" style={{ color: ACCENT, background: ACCENT + "18" }}>
              <Circle className="size-3.5" />
            </span>
            <span className="text-xs font-semibold text-foreground">Daily Task Contributions</span>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={daily} barSize={16} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={22} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.6rem", fontSize: "11px" }} formatter={(v) => [`${v} tasks`, ""]} />
              <Bar dataKey="tasks" fill={ACCENT} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Token consumption chart */}
        <div className="rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-md" style={{ color: ACCENT, background: ACCENT + "18" }}>
              <Zap className="size-3.5" />
            </span>
            <span className="text-xs font-semibold text-foreground">Token Consumption</span>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={tokens} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.6rem", fontSize: "11px" }}
                formatter={(v) => [`${Number(v).toLocaleString()} tokens`, ""]} />
              <Line type="monotone" dataKey="tokens" stroke={ACCENT} strokeWidth={2.5}
                dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
