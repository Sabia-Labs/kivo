"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Zap, X } from "lucide-react";
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

  useEffect(() => {
    if (!token) return;
    
    let isMounted = true;
    
    fetch(`${API_BASE}/teams/mine`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return;
        const teams = data.data ?? [];
        if (teams.length > 0 && teams[0]?.workspace) {
          setCurrentTier(teams[0].workspace.tier);
          setWorkspaceId(teams[0].workspace.id);
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
      await fetch(`${API_BASE}/workspaces/${workspaceId}/tier`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ tier })
      });
      setCurrentTier(tier);
      setCheckoutPlan(null);
      
      // Force refresh if they selected a plan to ensure banner state updates if needed
      window.location.reload();
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
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
        <div className="rounded-2xl border border-border bg-card shadow-sm p-8 flex flex-col relative overflow-hidden transition-all hover:shadow-md hover:border-primary/30">
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-foreground">{t.plans.free.name}</h3>
            <p className="text-sm text-muted-foreground mt-2">{t.plans.free.subtitle}</p>
          </div>
          <div className="mb-8">
            <span className="text-4xl font-extrabold text-foreground">{t.plans.free.price.split('/')[0]}</span>
            <span className="text-muted-foreground">/{t.plans.free.price.split('/')[1]}</span>
          </div>
          
          <ul className="space-y-4 flex-1 mb-8">
            {t.plans.free.features.map((feature, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 className="size-5 text-primary shrink-0" />
                <span className="text-sm text-foreground">{feature}</span>
              </li>
            ))}
          </ul>
          
          <button 
            onClick={() => handleSelectPlan('free')}
            disabled={currentTier === 'free'}
            className="w-full inline-flex justify-center rounded-xl bg-secondary border border-border px-4 py-3 text-sm font-semibold text-secondary-foreground hover:bg-secondary/80 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {currentTier === 'free' ? t.plans.currentPlan : t.plans.free.button}
          </button>
        </div>

        {/* Basic Tier */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-8 flex flex-col relative overflow-hidden transition-all hover:shadow-md hover:border-primary/30">
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-foreground">{t.plans.basic.name}</h3>
            <p className="text-sm text-muted-foreground mt-2">{t.plans.basic.subtitle}</p>
          </div>
          <div className="mb-8">
            <span className="text-4xl font-extrabold text-foreground">{t.plans.basic.price.split('/')[0]}</span>
            <span className="text-muted-foreground">/{t.plans.basic.price.split('/')[1]}</span>
          </div>
          
          <ul className="space-y-4 flex-1 mb-8">
            {t.plans.basic.features.map((feature, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 className="size-5 text-primary shrink-0" />
                <span className="text-sm text-foreground">{feature}</span>
              </li>
            ))}
          </ul>
          
          <button 
            onClick={() => handleSelectPlan('basic')}
            disabled={currentTier === 'basic'}
            className="w-full inline-flex justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {currentTier === 'basic' ? t.plans.currentPlan : t.plans.basic.button}
          </button>
        </div>

        {/* Pro Tier */}
        <div className="rounded-2xl border-2 border-primary bg-card shadow-sm p-8 flex flex-col relative overflow-hidden transition-all hover:shadow-md">
          <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-4 py-1 rounded-bl-xl font-medium text-xs flex items-center gap-1">
            <Zap className="size-3" />
          </div>
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-foreground">{t.plans.pro.name}</h3>
            <p className="text-sm text-muted-foreground mt-2">{t.plans.pro.subtitle}</p>
          </div>
          <div className="mb-8">
            <span className="text-4xl font-extrabold text-foreground">{t.plans.pro.price.split('/')[0]}</span>
            <span className="text-muted-foreground">/{t.plans.pro.price.split('/')[1]}</span>
          </div>
          
          <ul className="space-y-4 flex-1 mb-8">
            {t.plans.pro.features.map((feature, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 className="size-5 text-primary shrink-0" />
                <span className="text-sm text-foreground">{feature}</span>
              </li>
            ))}
          </ul>
          
          <button 
            onClick={() => handleSelectPlan('pro')}
            disabled={currentTier === 'pro'}
            className="w-full inline-flex justify-center rounded-xl bg-secondary border border-border px-4 py-3 text-sm font-semibold text-secondary-foreground hover:bg-secondary/80 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {currentTier === 'pro' ? t.plans.currentPlan : t.plans.pro.button}
          </button>
        </div>
      </div>
    </div>
  );
}
