"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    
    if (user) {
      router.push("/teams");
    } else {
      // Redirect to the public marketing site and sync logout state
      window.location.href = `/redirect-login`;
    }
  }, [router, user, isLoading]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="animate-pulse text-muted-foreground">Loading Kivo...</div>
    </div>
  );
}
