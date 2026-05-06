"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";


function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    const userId = searchParams.get("userId");
    const workspaceId = searchParams.get("workspaceId");

    const isNew = searchParams.get("isNew") === "true";

    if (token && userId) {
      // In a real app we'd fetch full user details if needed, 
      // but for this example we'll construct a basic user object
      const user = { id: userId, email: "user@example.com", name: "Kivo User", isAdmin: false };
      
      login(token, user, workspaceId || null);
      toast.success("Successfully logged in via Google!");
      const wsIdParam = workspaceId ? `&workspaceId=${workspaceId}` : "";
      
      if (isNew) {
        window.location.href = `/redirect-app?path=/newteam&token=${token}&user=${encodeURIComponent(JSON.stringify(user))}${wsIdParam}`;
      } else {
        window.location.href = `/redirect-app?path=/teams&token=${token}&user=${encodeURIComponent(JSON.stringify(user))}${wsIdParam}`;
      }
    } else {
      toast.error("Authentication failed. Missing token.");
      router.replace("/login");
    }
  }, [searchParams, login, router]);

  return null;
}

export default function AuthCallbackPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center">
        <Loader2 className="size-8 animate-spin text-primary" />
        <h1 className="text-xl font-medium">Completing login...</h1>
        <p className="text-sm text-muted-foreground">Please wait while we redirect you.</p>
      </div>
      <Suspense fallback={null}>
        <AuthCallbackContent />
      </Suspense>
    </div>
  );
}
