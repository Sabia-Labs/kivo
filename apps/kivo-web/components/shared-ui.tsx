"use client";

import React from "react";
import { 
  Trash2,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Comment, Agent } from "@/lib/types";
import { useAuth } from "@/lib/auth";



export function Button({ 
  className, variant, size, ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: "primary" | "outline" | "destructive"; 
  size?: "sm" | "md" 
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 cursor-pointer",
        variant === "outline" ? "border border-border bg-background hover:bg-muted" : 
        variant === "destructive" ? "bg-destructive text-destructive-foreground hover:opacity-90" :
        "bg-primary text-primary-foreground hover:opacity-90",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        className
      )}
      {...props}
    />
  );
}

export function CommentsList({ 
  comments, agents, onDelete 
}: { 
  comments: Comment[]; 
  agents: Agent[]; 
  onDelete: (id: string) => void 
}) {
  const { user } = useAuth();

  if (comments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
        <p className="text-xs text-muted-foreground/40 italic">No comments yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {comments.map((c) => {
        const isHuman = c.actorType === "human";
        const agent = isHuman ? null : agents.find((a) => a.id === c.actorId);
        const canDelete = isHuman && c.actorId === user?.id;

        return (
          <div key={c.id} className="group flex gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm">
              {isHuman ? "👤" : (agent?.icon || "🤖")}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">
                    {isHuman ? "You" : agent?.name || "Unknown Agent"}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                {canDelete && (
                  <button 
                    onClick={() => onDelete(c.id)}
                    className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 transition-all cursor-pointer"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {c.content}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
