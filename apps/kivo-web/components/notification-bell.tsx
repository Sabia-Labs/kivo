"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Check, Info, AlertTriangle, AlertCircle, X } from "lucide-react";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

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

export function NotificationBell() {
  const { token, user } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

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

  const priorityIcon = {
    info: <Info className="size-4 text-blue-500" />,
    normal: <Bell className="size-4 text-muted-foreground" />,
    high: <AlertTriangle className="size-4 text-amber-500" />,
    alert: <AlertCircle className="size-4 text-destructive" />
  };

  return (
    <div className="relative">
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Bell className="size-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground ring-2 ring-background">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {dropdownOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-border bg-card shadow-lg ring-1 ring-black/5 sm:w-96">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="font-semibold text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            
            <div className="max-h-[300px] overflow-y-auto p-1">
              {loading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
              ) : notifications.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Bell className="mx-auto mb-2 size-6 opacity-20" />
                  No notifications yet
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.isRead) markAsRead(n.id);
                    }}
                    className={cn(
                      "relative mb-1 flex gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer",
                      !n.isRead ? "bg-muted/80" : "bg-transparent"
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {priorityIcon[n.priority]}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("text-sm font-medium leading-none", !n.isRead ? "text-foreground" : "text-muted-foreground group-hover:text-accent-foreground")}>
                          {n.title}
                        </p>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {new Date(n.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {n.content && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {n.content}
                        </p>
                      )}
                      {n.relatedEntityType === "request" && n.relatedEntityId && (
                        <Link 
                           href={`/teams/${n.teamId}/requests/${n.relatedEntityId}`}
                           className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                           onClick={(e) => { e.stopPropagation(); if (!n.isRead) markAsRead(n.id); }}
                        >
                          View Request
                        </Link>
                      )}
                    </div>
                    {!n.isRead && (
                      <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
