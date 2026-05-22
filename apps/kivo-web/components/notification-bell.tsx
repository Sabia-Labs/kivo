"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, Info, AlertTriangle, AlertCircle } from "lucide-react";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";

export interface Notification {
  id: string;
  title: string;
  content: string;
  priority: "info" | "normal" | "high" | "alert";
  isRead: boolean;
  relatedEntityId?: string;
  relatedEntityType?: string;
  createdAt: string;
  teamId: string;
}

export function NotificationBell({
  dropdownClassName,
  variant = "navbar",
  isCollapsed = false,
}: {
  dropdownClassName?: string;
  variant?: "navbar" | "sidebar";
  isCollapsed?: boolean;
} = {}) {
  const { token } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Problem 3: Reliable click outside listener (handles both mouse and touch)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [dropdownOpen]);

  const fetchNotifications = useCallback(() => {
    if (!token) return;
    fetch(`${API_BASE}/notifications`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.data) {
          setNotifications(d.data);
        }
      })
      .catch((err) => console.error("Failed to load notifications", err))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (token) fetchNotifications();
    const interval = setInterval(() => {
      if (token) fetchNotifications();
    }, 30000); // Polling every 30s
    return () => clearInterval(interval);
  }, [token, fetchNotifications]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAsRead = async (id: string) => {
    if (!token) return;
    try {
      await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    if (!token || unreadCount === 0) return;
    try {
      await fetch(`${API_BASE}/notifications/read-all`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      toast.success("All notifications marked as read");
    } catch (err) {
      console.error(err);
    }
  };

  // Premium priority icon layout with soft circular background tags
  const priorityIcon = {
    info: (
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
        <Info className="size-4" />
      </div>
    ),
    normal: (
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-500/10 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-400">
        <Bell className="size-4" />
      </div>
    ),
    high: (
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
        <AlertTriangle className="size-4" />
      </div>
    ),
    alert: (
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400">
        <AlertCircle className="size-4" />
      </div>
    )
  };

  return (
    <div
      className={cn(
        "relative text-left",
        variant === "navbar" ? "inline-block" : "w-full"
      )}
      ref={dropdownRef}
    >
      {variant === "navbar" ? (
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground",
            dropdownOpen && "bg-accent text-foreground ring-1 ring-border"
          )}
        >
          <Bell className="size-4.5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground ring-2 ring-background">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      ) : (
        /* variant === "sidebar" */
        <div
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl p-2 transition-colors duration-200 border border-transparent cursor-pointer text-muted-foreground hover:text-foreground",
            dropdownOpen ? "bg-accent/50 text-foreground" : "hover:bg-accent/50",
            isCollapsed && "justify-center p-1"
          )}
        >
          <div className="relative flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-popover text-muted-foreground transition-all duration-200">
            <Bell className="size-4.5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground ring-2 ring-background">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-semibold text-foreground truncate leading-tight">
                {t.nav.notifications}
              </p>
              <p className="text-[10px] text-muted-foreground truncate leading-tight mt-1">
                AI squad updates
              </p>
            </div>
          )}
        </div>
      )}

      {dropdownOpen && (
        <div
          className={cn(
            "absolute z-50 w-80 rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-2xl ring-1 ring-black/5 sm:w-96 overflow-hidden",
            variant === "navbar"
              ? "right-0 top-full mt-2 animate-in fade-in slide-in-from-top-2 duration-150"
              : cn(
                  isCollapsed ? "left-16 bottom-0" : "left-0 bottom-full mb-2",
                  "animate-in fade-in slide-in-from-bottom-2 duration-150"
                ),
            dropdownClassName
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 bg-muted/20">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-wide text-foreground">
                {t.nav.notifications}
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  markAllAsRead();
                }}
                className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-[380px] overflow-y-auto p-1.5 space-y-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
            {loading ? (
              <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 px-4 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
                <Bell className="size-8 opacity-25 text-muted-foreground" />
                <span className="font-medium text-foreground/80">No notifications yet</span>
                <span className="text-xs opacity-70">We will alert you when there is news</span>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!n.isRead) {
                      await markAsRead(n.id);
                    }
                    setDropdownOpen(false);
                    if (n.relatedEntityType === "request" && n.relatedEntityId) {
                      router.push(`/teams/${n.teamId}/requests/${n.relatedEntityId}`);
                    }
                  }}
                  className={cn(
                    "group relative flex gap-3 rounded-lg p-3 text-left transition-all duration-200 border-l-2 cursor-pointer shadow-sm hover:translate-x-0.5",
                    !n.isRead
                      ? "bg-primary/5 dark:bg-primary/10 border-primary text-foreground hover:bg-primary/10 dark:hover:bg-primary/15"
                      : "bg-transparent border-transparent hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {/* Icon section with priority badge */}
                  <div className="mt-0.5 shrink-0">{priorityIcon[n.priority]}</div>

                  {/* Text Details */}
                  <div className="flex-1 space-y-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          "text-xs leading-snug truncate pr-2",
                          !n.isRead
                            ? "text-foreground font-semibold"
                            : "text-muted-foreground group-hover:text-foreground transition-colors"
                        )}
                      >
                        {n.title}
                      </p>
                      <span className="text-[9px] text-muted-foreground whitespace-nowrap pt-0.5">
                        {new Date(n.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>

                    {n.content && (
                      <p className="line-clamp-2 text-[11px] text-muted-foreground leading-normal group-hover:text-foreground/90 transition-colors">
                        {n.content}
                      </p>
                    )}

                    {n.relatedEntityType === "request" && n.relatedEntityId && (
                      <div className="pt-1.5 flex items-center gap-1 text-[11px] font-bold text-primary group-hover:text-primary/95 transition-colors">
                        <span>View Request</span>
                        <svg
                          className="size-3 transition-transform group-hover:translate-x-0.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Blue indicator dot for unread status */}
                  {!n.isRead && (
                    <div className="absolute right-3.5 top-3.5 h-2 w-2 rounded-full bg-primary ring-2 ring-primary/20 animate-pulse" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

