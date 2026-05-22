"use client";

import Link from "next/link";
import { CheckCircle2, Zap } from "lucide-react";
import { useAuth, API_BASE } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function PricingPage() {
  const { token } = useAuth();
  const router = useRouter();

  return (
    <div className="flex-1 flex flex-col p-8 items-center max-w-5xl mx-auto w-full pt-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4 text-foreground">Escolha um Plano</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Ative seus agentes escolhendo o plano que melhor atende suas necessidades.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
        {/* Free / BYOK Tier */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-8 flex flex-col relative overflow-hidden transition-all hover:shadow-md hover:border-primary/30">
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-foreground">Free (BYOK)</h3>
            <p className="text-sm text-muted-foreground mt-2">Traga sua própria chave de API.</p>
          </div>
          <div className="mb-8">
            <span className="text-4xl font-extrabold text-foreground">€0</span>
            <span className="text-muted-foreground">/mês</span>
            <p className="text-xs text-muted-foreground mt-2">Você paga o consumo diretamente ao provedor LLM.</p>
          </div>
          
          <ul className="space-y-4 flex-1 mb-8">
            {[
              "Acesso total à orquestração do Kivo",
              "Suporte a OpenAI, Gemini, Anthropic e DeepSeek",
              "Seus próprios limites de taxa (rate limits)",
              "Ideal para testes e desenvolvimento"
            ].map((feature, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 className="size-5 text-primary shrink-0" />
                <span className="text-sm text-foreground">{feature}</span>
              </li>
            ))}
          </ul>
          
          <Link href="/pricing/byok" className="w-full inline-flex justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm">
            Configurar Chave API
          </Link>
        </div>

        {/* Pro / Voucher Tier */}
        <div className="rounded-2xl border-2 border-primary bg-card shadow-sm p-8 flex flex-col relative overflow-hidden transition-all hover:shadow-md">
          <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-4 py-1 rounded-bl-xl font-medium text-xs flex items-center gap-1">
            <Zap className="size-3" /> Recomendado
          </div>
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-foreground">Pro</h3>
            <p className="text-sm text-muted-foreground mt-2">Sem fricção. Nós cuidamos dos tokens.</p>
          </div>
          <div className="mb-8">
            <span className="text-4xl font-extrabold text-foreground">Voucher</span>
            <p className="text-xs text-muted-foreground mt-2">Somente via código de convite (Redeem Code) no beta atual.</p>
          </div>
          
          <ul className="space-y-4 flex-1 mb-8">
            {[
              "Zero configuração de LLM",
              "Chaves premium do Kivo gerenciadas",
              "Modelos de altíssimo desempenho",
              "Suporte prioritário"
            ].map((feature, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 className="size-5 text-primary shrink-0" />
                <span className="text-sm text-foreground">{feature}</span>
              </li>
            ))}
          </ul>
          
          <Link href="/pricing/redeem" className="w-full inline-flex justify-center rounded-xl bg-secondary border border-border px-4 py-3 text-sm font-semibold text-secondary-foreground hover:bg-secondary/80 transition-colors shadow-sm">
            Resgatar Voucher
          </Link>
        </div>
      </div>
    </div>
  );
}
