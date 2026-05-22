"use client";

import { useAuth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { Sidebar } from "@/components/sidebar";
import { PlanSelectionBanner } from "@/components/plan-selection-banner";
import { Loader2 } from "lucide-react";

export function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground font-medium animate-pulse">
            Loading Kivo...
          </span>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex min-h-screen bg-background">
        {/* Left Sidebar Menu */}
        <Sidebar />

        {/* Right Content Pane */}
        <main className="flex-1 min-w-0 overflow-y-auto relative flex flex-col">
          <PlanSelectionBanner />
          {children}
        </main>
      </div>
    );
  }

  // Fallback for public pages (e.g., loading or redirection page)
  return (
    <>
      <Navbar />
      <main className="pt-16 min-h-screen flex flex-col bg-background">
        {children}
      </main>
    </>
  );
}
