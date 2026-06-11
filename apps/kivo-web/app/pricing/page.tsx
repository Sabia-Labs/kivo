"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Zap, X, Info } from "lucide-react";
import { useAuth, API_BASE } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";

export default function PricingPage() {
  const { token } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  
  const [currentTier, setCurrentTier] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<'basic' | 'pro' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    
    let isMounted = true;
    
    Promise.all([
      fetch(`${API_BASE}/teams/mine`, { headers: { Authorization: `Bearer ${token}` } }).then(res => res.json()),
      fetch(`${API_BASE}/plans`, { headers: { Authorization: `Bearer ${token}` } }).then(res => res.json())
    ])
      .then(([teamsData, plansRes]) => {
        if (!isMounted) return;
        const teams = teamsData.data ?? [];
        if (teams.length > 0 && teams[0]?.workspace) {
          setCurrentTier(teams[0].workspace.tier);
          setWorkspaceId(teams[0].workspace.id);
        }
        if (plansRes.data) {
          setPlans(plansRes.data);
        }
      })
      .catch(console.error);
      
    return () => { isMounted = false; };
  }, [token]);

  const handleSelectPlan = async (tier: 'free' | 'basic' | 'pro') => {
    if (tier === 'free') {
      await updateTier('free');
    } else {
      setCheckoutPlan(tier);
    }
  };

  const updateTier = async (tier: 'free' | 'basic' | 'pro') => {
    if (!workspaceId || !token) return;
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/tier`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ tier })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("Tier update failed:", errData);
        alert(`Failed to update plan: ${errData.error || errData.message || res.statusText}`);
        setIsProcessing(false);
        return;
      }
      
      setCurrentTier(tier);
      setCheckoutPlan(null);
      
      // Force refresh if they selected a plan to ensure banner state updates if needed
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Network error occurred while updating plan.");
    } finally {
      setIsProcessing(false);
    }
  };

  const getFeatures = (tier: 'free' | 'basic' | 'pro') => {
    const plan = plans.find(p => p.tier === tier);
    const defaults = t.plans[tier].features;
    if (!plan) return defaults.map((f: string) => ({ text: f }));

    const isPt = t.plans.title === "Escolha seu plano";
    
    const teamsText = plan.teamLimit === 9999 ? (isPt ? "Times ilimitados" : "Unlimited teams") : `${plan.teamLimit} ${isPt ? 'times' : 'teams'}`;
    const agentsText = plan.agentsPerTeamLimit === 9999 ? (isPt ? "Agentes ilimitados" : "Unlimited agents") : `${isPt ? 'Até' : 'Up to'} ${plan.agentsPerTeamLimit} ${isPt ? 'agentes por time' : 'agents per team'}`;
    const creditsText = `${plan.dailyAiCredits} ${isPt ? 'créditos de IA / dia' : 'AI credits / day'}`;

    let modelsText = isPt ? "Modelos incluídos" : "Included models";
    if (tier === 'free') modelsText = isPt ? "Modelos experimentais" : "Experimental models";
    if (tier === 'basic') modelsText = isPt ? "Modelos avançados" : "Advanced models";
    if (tier === 'pro') modelsText = isPt ? "Modelos premium" : "Premium models";

    return [
      { text: teamsText },
      { text: agentsText },
      { text: creditsText },
      { text: modelsText, models: plan.models?.map((m: any) => m.name) || [] }
    ];
  };

  return (
    <div className="flex-1 flex flex-col p-8 items-center max-w-6xl mx-auto w-full pt-16 relative">
      {/* Fake Payment Modal */}
      {checkoutPlan && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-lg w-full max-w-md p-6 relative">
            <button 
              onClick={() => setCheckoutPlan(null)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" />
            </button>
            <h2 className="text-xl font-bold mb-2">Simulated Checkout</h2>
            <p className="text-muted-foreground mb-6">
              This is a placeholder payment screen. Confirming will activate the {checkoutPlan === 'pro' ? 'Pro' : 'Basic'} plan.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setCheckoutPlan(null)}
                className="px-4 py-2 rounded-md hover:bg-muted font-medium transition-colors"
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button 
                onClick={() => updateTier(checkoutPlan)}
                disabled={isProcessing}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                {isProcessing ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4 text-foreground">{t.plans.title}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
        {/* Free Tier */}
        <div className={`rounded-2xl bg-card shadow-sm p-8 flex flex-col relative overflow-hidden transition-all hover:shadow-md ${
          currentTier === 'free' ? 'border-2 border-primary ring-1 ring-primary/20' : 'border border-border hover:border-primary/30'
        }`}>
          {currentTier === 'free' && (
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-4 py-1 rounded-bl-xl font-semibold text-[10px] uppercase tracking-wider flex items-center gap-1">
              {t.plans.currentPlan}
            </div>
          )}
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-foreground">{t.plans.free.name}</h3>
            <p className="text-sm text-muted-foreground mt-2">{t.plans.free.subtitle}</p>
          </div>
          <div className="mb-8">
            <span className="text-4xl font-extrabold text-foreground">{t.plans.free.price.split('/')[0]}</span>
            <span className="text-muted-foreground">/{t.plans.free.price.split('/')[1]}</span>
          </div>
          
          <ul className="space-y-4 flex-1 mb-8">
            {getFeatures('free').map((feature: any, i: number) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 className="size-5 text-primary shrink-0" />
                <span className="text-sm text-foreground flex items-center">
                  {typeof feature === 'string' ? feature : feature.text}
                  {typeof feature !== 'string' && feature.models && feature.models.length > 0 && (
                     <div className="group relative inline-block ml-2 cursor-help">
                       <Info className="size-4 text-muted-foreground inline hover:text-primary transition-colors" />
                       <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover text-popover-foreground text-xs p-3 rounded-md shadow-md w-max min-w-[200px] border border-border z-10">
                         <strong className="block mb-2 text-primary">{t.plans.title === "Escolha seu plano" ? 'Modelos:' : 'Models:'}</strong>
                         <ul className="list-disc pl-4 space-y-1">
                           {feature.models.map((m: string, idx: number) => <li key={idx}>{m}</li>)}
                         </ul>
                       </div>
                     </div>
                  )}
                </span>
              </li>
            ))}
          </ul>
          
          <button 
            onClick={() => handleSelectPlan('free')}
            disabled={currentTier === 'free'}
            className={`w-full inline-flex justify-center rounded-xl px-4 py-3 text-sm font-semibold transition-all shadow-sm ${
              currentTier === 'free'
                ? "bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-60"
                : "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            }`}
          >
            {currentTier === 'free' ? t.plans.currentPlan : t.plans.free.button}
          </button>
        </div>

        {/* Basic Tier */}
        <div className={`rounded-2xl bg-card shadow-sm p-8 flex flex-col relative overflow-hidden transition-all hover:shadow-md ${
          currentTier === 'basic' ? 'border-2 border-primary ring-1 ring-primary/20' : 'border border-border hover:border-primary/30'
        }`}>
          {currentTier === 'basic' && (
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-4 py-1 rounded-bl-xl font-semibold text-[10px] uppercase tracking-wider flex items-center gap-1">
              {t.plans.currentPlan}
            </div>
          )}
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-foreground">{t.plans.basic.name}</h3>
            <p className="text-sm text-muted-foreground mt-2">{t.plans.basic.subtitle}</p>
          </div>
          <div className="mb-8">
            <span className="text-4xl font-extrabold text-foreground">{t.plans.basic.price.split('/')[0]}</span>
            <span className="text-muted-foreground">/{t.plans.basic.price.split('/')[1]}</span>
          </div>
          
          <ul className="space-y-4 flex-1 mb-8">
            {getFeatures('basic').map((feature: any, i: number) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 className="size-5 text-primary shrink-0" />
                <span className="text-sm text-foreground flex items-center">
                  {typeof feature === 'string' ? feature : feature.text}
                  {typeof feature !== 'string' && feature.models && feature.models.length > 0 && (
                     <div className="group relative inline-block ml-2 cursor-help">
                       <Info className="size-4 text-muted-foreground inline hover:text-primary transition-colors" />
                       <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover text-popover-foreground text-xs p-3 rounded-md shadow-md w-max min-w-[200px] border border-border z-10">
                         <strong className="block mb-2 text-primary">{t.plans.title === "Escolha seu plano" ? 'Modelos:' : 'Models:'}</strong>
                         <ul className="list-disc pl-4 space-y-1">
                           {feature.models.map((m: string, idx: number) => <li key={idx}>{m}</li>)}
                         </ul>
                       </div>
                     </div>
                  )}
                </span>
              </li>
            ))}
          </ul>
          
          <button 
            onClick={() => handleSelectPlan('basic')}
            disabled={currentTier === 'basic'}
            className={`w-full inline-flex justify-center rounded-xl px-4 py-3 text-sm font-semibold transition-all shadow-sm ${
              currentTier === 'basic'
                ? "bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-60"
                : "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            }`}
          >
            {currentTier === 'basic' ? t.plans.currentPlan : t.plans.basic.button}
          </button>
        </div>

        {/* Pro Tier */}
        <div className={`rounded-2xl bg-card shadow-sm p-8 flex flex-col relative overflow-hidden transition-all hover:shadow-md ${
          currentTier === 'pro' ? 'border-2 border-primary ring-1 ring-primary/20' : 'border border-border hover:border-primary/30'
        }`}>
          {currentTier === 'pro' && (
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-4 py-1 rounded-bl-xl font-semibold text-[10px] uppercase tracking-wider flex items-center gap-1">
              {t.plans.currentPlan}
            </div>
          )}
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-foreground">{t.plans.pro.name}</h3>
            <p className="text-sm text-muted-foreground mt-2">{t.plans.pro.subtitle}</p>
          </div>
          <div className="mb-8">
            <span className="text-4xl font-extrabold text-foreground">{t.plans.pro.price.split('/')[0]}</span>
            <span className="text-muted-foreground">/{t.plans.pro.price.split('/')[1]}</span>
          </div>
          
          <ul className="space-y-4 flex-1 mb-8">
            {getFeatures('pro').map((feature: any, i: number) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 className="size-5 text-primary shrink-0" />
                <span className="text-sm text-foreground flex items-center">
                  {typeof feature === 'string' ? feature : feature.text}
                  {typeof feature !== 'string' && feature.models && feature.models.length > 0 && (
                     <div className="group relative inline-block ml-2 cursor-help">
                       <Info className="size-4 text-muted-foreground inline hover:text-primary transition-colors" />
                       <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover text-popover-foreground text-xs p-3 rounded-md shadow-md w-max min-w-[200px] border border-border z-10">
                         <strong className="block mb-2 text-primary">{t.plans.title === "Escolha seu plano" ? 'Modelos:' : 'Models:'}</strong>
                         <ul className="list-disc pl-4 space-y-1">
                           {feature.models.map((m: string, idx: number) => <li key={idx}>{m}</li>)}
                         </ul>
                       </div>
                     </div>
                  )}
                </span>
              </li>
            ))}
          </ul>
          
          <button 
            onClick={() => handleSelectPlan('pro')}
            disabled={currentTier === 'pro'}
            className={`w-full inline-flex justify-center rounded-xl px-4 py-3 text-sm font-semibold transition-all shadow-sm ${
              currentTier === 'pro'
                ? "bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-60"
                : "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            }`}
          >
            {currentTier === 'pro' ? t.plans.currentPlan : t.plans.pro.button}
          </button>
        </div>
      </div>
    </div>
  );
}
