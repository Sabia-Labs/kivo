"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Cpu, ChevronDown, LogOut, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { LangSwitcher } from "@/components/lang-switcher";
import { NotificationBell } from "@/components/notification-bell";
import { useTranslation } from "@/lib/i18n";

/**
 * Logged-in application navbar. Used in authenticated app pages.
 * Replaces the public marketing navbar for authenticated routes.
 */
export function AppNavbar() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleLogout = () => {
    logout();
    // Force a full page reload to the redirect route to ensure cross-domain logout sync
    window.location.href = "/redirect-login";
  };

  // User initials avatar fallback.
  const initials = user?.name
    ? user.name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "?";

  return (
    <header
      id="app-navbar"
      className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          id="app-nav-logo"
          className="flex items-center gap-2 font-bold text-foreground transition-opacity hover:opacity-80"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              {/* connections */}
              <path d="M6 17 L12 6 L18 17 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />

              {/* nodes */}
              <circle cx="6" cy="17" r="2" fill="currentColor" />
              <circle cx="12" cy="6" r="2" fill="currentColor" />
              <circle cx="18" cy="17" r="2" fill="currentColor" />
            </svg>
          </span>
          <span className="text-lg tracking-tight">Kivo</span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <LangSwitcher />
          <NotificationBell />

          {/* User dropdown */}
          <div className="relative">
            <button
              id="app-nav-user-menu"
              onClick={() => setDropdownOpen((v) => !v)}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
                dropdownOpen && "bg-accent"
              )}
            >
              {/* Avatar */}
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {initials}
              </span>
              <span className="hidden sm:block max-w-[140px] truncate text-foreground">
                {user?.name}
              </span>
              <ChevronDown
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  dropdownOpen && "rotate-180"
                )}
              />
            </button>

            {/* Dropdown panel */}
            {dropdownOpen && (
              <>
                {/* Backdrop to close */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-border bg-card shadow-lg ring-1 ring-black/5">
                  {/* User info */}
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  {/* Menu items */}
                  <div className="p-1">
                    <button
                      id="app-nav-profile"
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                      onClick={() => setDropdownOpen(false)}
                    >
                      <User className="size-4 text-muted-foreground" />
                      {t.nav.profile}
                    </button>
                    <button
                      id="app-nav-logout"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <LogOut className="size-4" />
                      {t.nav.logout}
                    </button>

                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
