"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function AgentSecurityPage() {
  const params    = useParams();
  const agentId   = String(params.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href={`/agents/${agentId}`} id="security-back"
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Back to Agent
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Security</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure approval policies, guardrails, and access boundaries.</p>
      </div>

      <div className="flex flex-col items-center gap-6 rounded-2xl border border-dashed border-border bg-muted/20 py-24 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-rose-400/10 text-rose-600 dark:text-rose-400">
          <ShieldCheck className="size-7" />
        </div>
        <div>
          <p className="text-base font-semibold text-foreground">Coming soon</p>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Multi-level approval workflows, execution guardrails, and per-agent access boundaries will be managed here.
          </p>
        </div>
        <div className="w-full max-w-xs rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-6">
          <p className="text-xs text-muted-foreground">This section is under active development.<br />Check back in the next release.</p>
        </div>
      </div>
    </div>
  );
}
