"use client";

import { useEffect, useState } from "react";
import { useAuth, API_BASE } from "@/lib/auth";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export function PlanSelectionBanner() {
  const { token } = useAuth();
  const { t } = useTranslation();
  const pathname = usePathname();
  const [tier, setTier] = useState<string | null>("loading");
  
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
          // If tier is null, it means no plan selected
          setTier(teams[0].workspace.tier);
        } else {
          setTier("pro"); // Hide if no teams/workspace yet to avoid flicker before onboarding
        }
      })
      .catch(() => {
        if (isMounted) setTier("pro"); // hide on error
      });
      
    return () => { isMounted = false; };
  }, [token, pathname]);

  // If loading or tier is set to basic/pro, don't show the banner
  if (tier !== null && tier !== "free" && tier !== "free_byok") return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 flex items-center justify-center gap-3 shrink-0">
      <AlertCircle className="size-5 text-amber-500" />
      <p className="text-sm text-amber-500 font-medium">
        {t.planBanner.inactiveMessage}
      </p>
      <Link href="/pricing" className="text-sm font-bold bg-amber-500 text-black px-3 py-1.5 rounded-md hover:bg-amber-500/90 transition-colors shadow-sm">
        {t.planBanner.choosePlan}
      </Link>
    </div>
  );
}
