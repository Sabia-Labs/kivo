"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, API_BASE } from "@/lib/auth";
import { KeyRound, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function ByokPage() {
  const { token } = useAuth();
  const router = useRouter();
  
  const [loading, setLoading] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  
  const [provider, setProvider] = useState<string>("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");

  useEffect(() => {
    if (!token) return;
    // Fetch user's workspace
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
    if (!apiKey) {
      toast.error("Por favor, insira a chave da API.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/llm-keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ provider, apiKey, model })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao salvar a chave.");
      }

      toast.success("Plano configurado com sucesso! Seus agentes serão provisionados.");
      
      // Delay before redirect so the user sees the success state
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
        <div className="mx-auto size-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <KeyRound className="size-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-3 text-foreground">Configurar Bring Your Own Key</h1>
        <p className="text-base text-muted-foreground">
          Forneça as credenciais do seu provedor favorito. Esta chave será usada por todos os agentes do seu workspace.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full bg-card border border-border rounded-xl shadow-sm p-8">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Provedor LLM</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Google (Gemini)</option>
              <option value="anthropic">Anthropic</option>
              <option value="deepseek">DeepSeek</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">API Key</label>
            <input
              type="password"
              placeholder={`sk-...`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Sua chave será armazenada de forma segura e apenas o kivo controller terá acesso.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Modelo Específico (Opcional)</label>
            <input
              type="text"
              placeholder="Ex: gpt-4o, claude-3-5-sonnet-latest"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Se deixado em branco, o Kivo usará o modelo padrão mais inteligente para este provedor.
            </p>
          </div>

          <div className="pt-4 border-t border-border">
            <button
              type="submit"
              disabled={loading || !workspaceId}
              className="w-full flex justify-center items-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Salvando Configuração...
                </>
              ) : (
                "Ativar Tier Free (BYOK)"
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
