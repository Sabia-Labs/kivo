"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Users,
  Bot,
  ListTodo,
  Puzzle,
  BookOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  ChevronDown
} from "lucide-react";
import { useAuth, API_BASE } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { t } = useTranslation();
  const { user, token, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Collapsed state persistent check
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true); // default to true, set in useEffect to avoid hydration mismatch
  const [mounted, setMounted] = useState<boolean>(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState<boolean>(false);
  const [workspaceName, setWorkspaceName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kivo_workspace_name") || "Workspace";
    }
    return "Workspace";
  });

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Sidebar preferences hydrate from localStorage after mount. */
    setMounted(true);
    const saved = localStorage.getItem("kivo_sidebar_collapsed");
    setIsCollapsed(saved === "true");
    /* eslint-enable react-hooks/set-state-in-effect */

    // Fetch workspace name from teams if token is present
    if (token) {
      fetch(`${API_BASE}/teams/mine`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        }
      })
        .then((r) => r.json())
        .then((d) => {
          const teams = d.data ?? [];
          if (teams.length > 0 && teams[0]?.workspace?.name) {
            setWorkspaceName(teams[0].workspace.name);
            localStorage.setItem("kivo_workspace_name", teams[0].workspace.name);
          }
        })
        .catch((err) => console.error("Sidebar: failed to fetch workspace name", err));
    }
  }, [token]);

  const toggleCollapse = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    localStorage.setItem("kivo_sidebar_collapsed", String(nextState));
  };

  const handleLogout = () => {
    logout();
    setUserDropdownOpen(false);
    router.push("/");
  };

  const menuItems = [
    { label: t.nav.home, href: "/home", icon: Home },
    { label: t.nav.teams, href: "/teams", icon: Users },
    { label: t.nav.agents, href: "/agents", icon: Bot },
    { label: t.nav.requests, href: "/requests", icon: ListTodo },
    { label: t.nav.capabilities, href: "/capabilities", icon: Puzzle },
    { label: t.nav.knowledge, href: "/knowledge", icon: BookOpen },
    { label: t.nav.settings, href: "/settings", icon: Settings },
  ];

  // Helper to determine if a menu link is currently active
  const isActive = (href: string) => {
    if (href === "/home") {
      return pathname === "/home";
    }
    return pathname.startsWith(href);
  };

  // Avatar initials helper
  const initials = user?.name
    ? user.name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "?";

  if (!mounted) {
    // Avoid hydration layout shifting
    return (
      <aside className="hidden w-16 md:flex md:w-64 border-r border-border/40 bg-background flex-col shrink-0 min-h-screen h-screen sticky top-0" />
    );
  }

  return (
    <>
      <nav className="fixed inset-x-3 bottom-3 z-50 md:hidden rounded-2xl border border-border/70 bg-card/95 p-1.5 shadow-2xl shadow-black/10 backdrop-blur-xl">
        <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {menuItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                title={item.label}
                className={cn(
                  "flex h-11 min-w-12 flex-1 items-center justify-center rounded-xl text-muted-foreground transition-all duration-200",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="size-5 shrink-0" />
              </Link>
            );
          })}
        </div>
      </nav>

      <aside
        className={cn(
          "hidden border-r border-border/40 bg-card/65 backdrop-blur-md md:flex flex-col shrink-0 min-h-screen h-screen sticky top-0 transition-all duration-300 ease-in-out z-40 select-none",
          isCollapsed ? "w-[72px]" : "w-64"
        )}
      >
      {/* ── TOP SECTION: LOGO ── */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-border/40">
        <Link
          href="/teams"
          className="flex items-center gap-3 font-semibold text-foreground overflow-hidden"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg overflow-hidden transition-transform hover:scale-105">
            <svg width="24" height="24" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="kivo-logo-top-side" x1="20" y1="20" x2="80" y2="50" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#67E8A6" />
                  <stop offset="100%" stopColor="#1EAA6D" />
                </linearGradient>
                <linearGradient id="kivo-logo-bottom-side" x1="20" y1="80" x2="80" y2="50" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#0E5A35" />
                  <stop offset="60%" stopColor="#149457" />
                  <stop offset="100%" stopColor="#0F6E40" />
                </linearGradient>
                <linearGradient id="kivo-logo-shadow-side" x1="36" y1="54" x2="52" y2="70" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#042011" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#042011" stopOpacity="0" />
                </linearGradient>
              </defs>

              <path d="M 20 20 H 80 V 35 L 48 56 L 36 44 L 36 36 L 20 52 V 20 Z" fill="url(#kivo-logo-top-side)" />
              <path d="M 20 60 L 36 44 V 80 H 20 Z" fill="url(#kivo-logo-bottom-side)" />
              <path d="M 36 44 L 80 65 V 80 H 52 L 36 58 Z" fill="url(#kivo-logo-bottom-side)" />
              <path d="M 36 44 L 52 80 L 36 58 Z" fill="url(#kivo-logo-shadow-side)" />
            </svg>
          </span>
          {!isCollapsed && (
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground/95 to-foreground/80 bg-clip-text text-transparent animate-fade-in whitespace-nowrap">
              Kivo
            </span>
          )}
        </Link>

        {!isCollapsed && (
          <button
            onClick={toggleCollapse}
            className="flex size-7 items-center justify-center rounded-lg border border-border bg-popover text-muted-foreground hover:text-foreground transition-all hover:bg-accent"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
      </div>

      {/* ── MIDDLE SECTION: NAVIGATION ── */}
      <nav className="flex-1 space-y-1.5 px-3 py-4 overflow-y-auto">
        {menuItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all group relative duration-200",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "size-5 shrink-0 transition-transform group-hover:scale-105 duration-200",
                  active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              {!isCollapsed && (
                <span className="truncate tracking-wide">{item.label}</span>
              )}
              {isCollapsed && (
                <span className="absolute left-14 z-50 rounded bg-popover px-2 py-1 text-xs font-semibold text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity border pointer-events-none whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── BOTTOM SECTION: COLLAPSE TOGGLE (WHEN COLLAPSED) ── */}
      {isCollapsed && (
        <div className="flex justify-center py-2 border-t border-border/20">
          <button
            onClick={toggleCollapse}
            className="flex size-8 items-center justify-center rounded-lg border border-border bg-popover text-muted-foreground hover:text-foreground transition-all hover:bg-accent"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}

      {/* ── BOTTOM SECTION: NOTIFICATIONS ── */}
      <div className="px-3 py-2 border-t border-border/20">
        <NotificationBell variant="sidebar" isCollapsed={isCollapsed} />
      </div>

      {/* ── BOTTOM SECTION: WORKSPACE SELECTOR ── */}
      <div className="px-3 py-2 border-t border-border/20">
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 border border-border bg-muted/20 hover:bg-accent/40 transition-colors",
            isCollapsed && "justify-center px-1"
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground text-xs font-bold border">
            W
          </span>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground leading-none">
                {t.nav.workspace}
              </p>
              <p className="text-xs font-semibold text-foreground truncate mt-0.5 leading-none">
                {workspaceName}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── BOTTOM SECTION: USER PROFILE ── */}
      <div className="p-3 border-t border-border/40 relative">
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl p-2 transition-colors duration-200 border border-transparent",
            !isCollapsed && "hover:bg-accent/50 cursor-pointer"
          )}
          onClick={() => !isCollapsed && setUserDropdownOpen((o) => !o)}
        >
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm shadow-primary/10 cursor-pointer"
            onClick={() => isCollapsed && setUserDropdownOpen((o) => !o)}
          >
            {initials}
          </span>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate leading-tight">
                {user?.name}
              </p>
              <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">
                {user?.email}
              </p>
            </div>
          )}
          {!isCollapsed && (
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform shrink-0",
                userDropdownOpen && "rotate-180"
              )}
            />
          )}
        </div>

        {/* User popover dropdown */}
        {userDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-50 cursor-default"
              onClick={() => setUserDropdownOpen(false)}
            />
            <div
              className={cn(
                "absolute z-55 w-52 rounded-xl border border-border bg-card p-1 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150",
                isCollapsed ? "left-14 bottom-14" : "left-3 bottom-14"
              )}
            >
              {!isCollapsed && (
                <div className="border-b border-border px-3 py-2 text-left">
                  <p className="text-xs font-bold text-foreground truncate leading-tight">
                    {user?.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate leading-none mt-1">
                    {user?.email}
                  </p>
                </div>
              )}
              <div className="p-1">
                <button
                  id="sidebar-logout"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="size-4 shrink-0" />
                  <span className="font-medium">{t.nav.logout}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      </aside>
    </>
  );
}
