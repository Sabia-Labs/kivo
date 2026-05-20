"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, X, Cpu, LogOut, ChevronDown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LangSwitcher } from "@/components/lang-switcher";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function Navbar() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const navLinks = [
    { label: t.nav.about, href: "#about" },
    { label: t.nav.contactSales, href: "#contact" },
    { label: t.nav.pricing, href: "#pricing" },
  ];

  const handleLogout = () => {
    logout();
    setDropdownOpen(false);
    // Force a full page reload to the redirect route to ensure cross-domain logout sync
    window.location.href = "/redirect-login";
  };

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
      id="main-navbar"
      className="fixed inset-x-0 top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo — home when logged in → /teams, else → / */}
        <Link
          href={user ? "/teams" : "/"}
          id="nav-logo"
          className="flex items-center gap-2 font-bold text-foreground transition-opacity hover:opacity-80"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg overflow-hidden transition-transform hover:scale-105">
            <svg width="20" height="20" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="kivo-logo-top-nav" x1="20" y1="20" x2="80" y2="50" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#67E8A6" />
                  <stop offset="100%" stopColor="#1EAA6D" />
                </linearGradient>
                <linearGradient id="kivo-logo-bottom-nav" x1="20" y1="80" x2="80" y2="50" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#0E5A35" />
                  <stop offset="60%" stopColor="#149457" />
                  <stop offset="100%" stopColor="#0F6E40" />
                </linearGradient>
                <linearGradient id="kivo-logo-shadow-nav" x1="36" y1="54" x2="52" y2="70" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#042011" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#042011" stopOpacity="0" />
                </linearGradient>
              </defs>

              <path d="M 20 20 H 80 V 35 L 48 56 L 36 44 L 36 36 L 20 52 V 20 Z" fill="url(#kivo-logo-top-nav)" />
              <path d="M 20 60 L 36 44 V 80 H 20 Z" fill="url(#kivo-logo-bottom-nav)" />
              <path d="M 36 44 L 80 65 V 80 H 52 L 36 58 Z" fill="url(#kivo-logo-bottom-nav)" />
              <path d="M 36 44 L 52 80 L 36 58 Z" fill="url(#kivo-logo-shadow-nav)" />
            </svg>
          </span>
          <span className="text-lg tracking-tight">Kivo</span>
        </Link>

        {/* Desktop Nav Links — only show marketing links when not authenticated */}
        {!user && (
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                id={`nav-link-${link.href.replace("#", "")}`}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}

        {/* Desktop Right Actions */}
        <div className="hidden items-center gap-1 md:flex">
          <LangSwitcher />
          {user ? (
            // ── Authenticated: user avatar dropdown ──
            <>
              <div className="relative ml-2">
              <button
                id="nav-user-menu"
                onClick={() => setDropdownOpen((v) => !v)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
                  dropdownOpen && "bg-accent"
                )}
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {initials}
                </span>
                <span className="hidden sm:block max-w-[120px] truncate">{user.name}</span>
                <ChevronDown
                  className={cn(
                    "size-3.5 text-muted-foreground transition-transform",
                    dropdownOpen && "rotate-180"
                  )}
                />
              </button>

              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-border bg-card shadow-lg">
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-sm font-semibold truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <div className="p-1">
                      <Link
                        href="/teams"
                        id="nav-go-teams"
                        onClick={() => setDropdownOpen(false)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent"
                      >
                        <Users className="size-4 text-muted-foreground" />
                        {t.nav.myTeams}
                      </Link>
                      <button
                        id="nav-logout"
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
            </>
          ) : (
            // ── Unauthenticated: login / signup ──
            <>
              <Link href="/login" id="nav-login">
                <Button variant="ghost" size="sm" className="font-medium">
                  {t.nav.login}
                </Button>
              </Link>
              <Link href={user ? "/teams" : "/signup"} id="nav-get-started">
                <Button size="sm" className="font-semibold shadow-sm">
                  {t.nav.getStarted}
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          id="nav-mobile-toggle"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          "overflow-hidden border-t border-border/40 bg-background transition-all duration-300 md:hidden",
          mobileOpen ? "max-h-96" : "max-h-0"
        )}
      >
        <nav className="flex flex-col gap-1 px-4 py-3">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-2 flex items-center gap-2 border-t border-border/40 pt-3">
            <LangSwitcher />
            {user ? (
              <button
                className="flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                onClick={() => {
                  handleLogout();
                  setMobileOpen(false);
                }}
              >
                <LogOut className="size-4" />
                {t.nav.logout}
              </button>
            ) : (
              <>
                <Link href="/login" className="flex-1">
                  <Button variant="ghost" size="sm" className="w-full">
                    {t.nav.login}
                  </Button>
                </Link>
                <Link href={user ? "/teams" : "/signup"} className="flex-1">
                  <Button size="sm" className="w-full font-semibold">
                    {t.nav.getStarted}
                  </Button>
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
