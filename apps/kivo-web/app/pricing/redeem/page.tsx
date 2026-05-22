"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, API_BASE } from "@/lib/auth";
import { Ticket, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function RedeemPage() {
  const { token } = useAuth();
  const router = useRouter();
  
  const [loading, setLoading] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/teams/mine`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        const teams = data.data ?? [];
        if (teams.length > 0 && teams[0]?.workspace) {
          setWorkspaceId(teams[0].workspace.id);
        }
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId) {
      toast.error("Workspace não encontrado.");
      return;
    }
    if (!code) {
      toast.error("Por favor, insira o código do voucher.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/redeem-voucher`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ code })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao resgatar o voucher.");
      }

      toast.success("Voucher ativado com sucesso! Você agora está no Tier Pro.");
      
      setTimeout(() => {
        router.push("/agents");
      }, 1500);
      
    } catch (err: any) {
      toast.error(err.message || "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-8 items-center max-w-3xl mx-auto w-full pt-16">
      <div className="w-full mb-8">
        <Link href="/pricing" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4 mr-2" />
          Voltar para Planos
        </Link>
      </div>

      <div className="text-center mb-10 w-full">
        <div className="mx-auto size-16 bg-secondary/20 border border-secondary/50 rounded-full flex items-center justify-center mb-4">
          <Ticket className="size-8 text-secondary-foreground" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-3 text-foreground">Resgatar Voucher Pro</h1>
        <p className="text-base text-muted-foreground">
          Insira seu código de acesso. Nós forneceremos os tokens necessários para seus agentes rodarem com desempenho máximo.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full bg-card border border-border rounded-xl shadow-sm p-8">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Código do Voucher</label>
            <input
              type="text"
              placeholder="Ex: KIVO-BETA-2026"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full rounded-md border border-input bg-background px-3 py-3 text-base font-mono tracking-widest ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring uppercase text-center"
              autoComplete="off"
            />
          </div>

          <div className="pt-4 border-t border-border">
            <button
              type="submit"
              disabled={loading || !workspaceId || !code}
              className="w-full flex justify-center items-center rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 border border-border shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Resgatando...
                </>
              ) : (
                "Ativar Tier Pro"
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
