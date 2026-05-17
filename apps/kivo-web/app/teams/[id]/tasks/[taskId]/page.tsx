"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Trash2,
  MessageSquare,
  Check,
  Edit2,
  X,
  Info
} from "lucide-react";
import { toast } from "sonner";
import { useAuth, API_BASE } from "@/lib/auth";
import { Team, Task, Agent, Comment } from "@/lib/types";
import { CommentsList } from "@/components/shared-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";

export default function TaskPage() {
  const { token, isLoading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  
  const teamId = String(params.id);
  const taskId = String(params.taskId);

  const [isLoading, setIsLoading] = useState(true);
  const [team, setTeam]         = useState<Team | null>(null);
  const [task, setTask]         = useState<Task | null>(null);
  const [request, setRequest]   = useState<any>(null);
  const [agents, setAgents]     = useState<Agent[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);

  const [newComment, setNewComment] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);

  const headers = useCallback((): HeadersInit => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  const loadData = useCallback(() => {
    if (!token) return;
    setIsLoading(true);

    Promise.all([
      fetch(`${API_BASE}/teams/${teamId}`, { headers: headers() }),
      fetch(`${API_BASE}/tasks/${taskId}`, { headers: headers() }),
      fetch(`${API_BASE}/agents?teamId=${teamId}`, { headers: headers() }),
      fetch(`${API_BASE}/tasks/${taskId}/comments`, { headers: headers() }),
    ])
      .then(async ([teamRes, taskRes, agentsRes, commentsRes]) => {
        if (!taskRes.ok) {
          toast.error("Task not found.");
          router.replace(`/teams/${teamId}`);
          return;
        }
        const tm: Team = (await teamRes.json()).data;
        const t: Task = (await taskRes.json()).data;
        const a: Agent[] = (await agentsRes.json()).data ?? [];
        const c: Comment[] = commentsRes.ok ? (await commentsRes.json()).data ?? [] : [];

        setTeam(tm);
        setTask(t);
        setTitle(t.title || "");
        setAgents(a);
        setComments(c);

        if (t.requestId) {
          fetch(`${API_BASE}/teams/${teamId}/requests/${t.requestId}`, { headers: headers() })
            .then(res => res.json())
            .then(data => {
              if (data.success && data.data) {
                setRequest(data.data);
              }
            })
            .catch(err => console.error("Failed to load related request", err));
        }
      })
      .catch((err) => {
        console.error("Failed to load task data:", err);
        toast.error("Failed to load task details.");
      })
      .finally(() => setIsLoading(false));
  }, [taskId, teamId, token, headers, router]);

  useEffect(() => {
    if (!authLoading) loadData();
  }, [authLoading, loadData]);

  const handleDeleteTask = async () => {
    if (!task) return;
    if (!confirm("Are you sure you want to delete this task? This action cannot be undone.")) return;
    
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: "DELETE",
        headers: headers(),
      });
      if (!res.ok) throw new Error();
      toast.success("Task deleted");
      router.replace(`/teams/${teamId}`);
    } catch {
      toast.error("Failed to delete task");
    }
  };

  const handleUpdateTitle = async () => {
    if (!task || !title.trim() || title === task.title) {
      setTitle(task?.title || "");
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({ ...task, title: title.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success("Title updated");
      setTask({ ...task, title: title.trim() });
    } catch {
      toast.error("Failed to update title");
      setTitle(task.title || "");
    }
  };

  const handlePostComment = async () => {
    if (!newComment.trim() || isPostingComment) return;
    setIsPostingComment(true);
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}/comments`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (!res.ok) throw new Error();
      const comment = (await res.json()).data;
      setComments(prev => [...prev, comment]);
      setNewComment("");
      toast.success("Comment posted");
    } catch {
      toast.error("Failed to post comment");
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    try {
      const res = await fetch(`${API_BASE}/tasks/comments/${commentId}`, {
        method: "DELETE",
        headers: headers(),
      });
      if (!res.ok) throw new Error();
      setComments(prev => prev.filter(c => c.id !== commentId));
      toast.success("Comment deleted");
    } catch {
      toast.error("Failed to delete comment");
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!task || !team) return null;

  const assignedAgent = agents.find(a => a.id === task.assignedToId);

  const statusLabel = task.status === "success" ? "ok" :
    task.status === "failed" ? "failed" :
    task.status === "open" ? "created" : task.status.replace("_", " ");

  const statusColorClass = task.status === "open" ? "bg-blue-500/10 text-blue-500" :
    task.status === "in_progress" ? "bg-amber-500/10 text-amber-500" :
    task.status === "success" ? "bg-emerald-500/10 text-emerald-500" :
    task.status === "failed" ? "bg-red-500/10 text-red-500" :
    "bg-muted text-muted-foreground";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="flex items-center justify-between mb-6">
        <Link href={`/teams/${teamId}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Back to Team
        </Link>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleDeleteTask}
          className="h-8 px-2 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 transition-colors"
          title="Delete Task"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="mb-8 space-y-3">
        {isEditingTitle ? (
          <div className="flex items-center gap-2">
            <Input 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              autoFocus
              className="text-3xl font-bold h-14 w-full px-4"
              placeholder="Task Title"
              onKeyDown={e => {
                if (e.key === "Enter") {
                  setIsEditingTitle(false);
                  handleUpdateTitle();
                }
              }}
            />
            <Button size="icon" variant="ghost" className="shrink-0" onClick={() => {
              setIsEditingTitle(false);
              handleUpdateTitle();
            }}>
              <Check className="size-6 text-emerald-500" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group">
            <h1 className="text-3xl font-bold tracking-tight px-1 flex items-center gap-2">
              {task.title}
            </h1>
            <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity size-8 shrink-0" onClick={() => setIsEditingTitle(true)}>
              <Edit2 className="size-4 text-muted-foreground" />
            </Button>
          </div>
        )}
        <div className="flex items-center gap-4">
          <p className="text-xs text-muted-foreground flex items-center gap-2 px-1 flex-wrap">
            <span className={cn("px-2 py-0.5 rounded-full font-medium capitalize", statusColorClass)}>
              {statusLabel}
            </span>
            <span>•</span>
            <span>
              Created on {new Date(task.createdAt!).toLocaleString()} — executed by <span className="font-semibold text-foreground">{assignedAgent?.name || "Unassigned"}</span>
            </span>
            {request && (
              <>
                <span>•</span>
                <Link href={`/teams/${teamId}/requests/${request.identifier || request.id}`} className="hover:underline flex items-center gap-1">
                  Related request: <span className="font-mono text-primary">{request.identifier || request.id.substring(0,8)}</span>
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* INPUT */}
        <section className="rounded-xl border bg-card p-6 space-y-6">
          <h2 className="text-lg font-semibold border-b pb-2">Input</h2>
          <div className="grid gap-6">
            <div className="space-y-2">
              <Label>Prompt</Label>
              <div className="p-4 bg-muted/50 rounded-lg border text-sm">
                <Markdown content={task.prompt || ""} />
              </div>
            </div>
            
            <div className="flex items-center justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowInstructionsModal(true)} className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground">
                <Info className="size-3.5 mr-1.5" />
                View passed instructions
              </Button>
            </div>
          </div>
        </section>

        {/* EXECUTION */}
        <section className="rounded-xl border bg-card p-6 space-y-6">
          <h2 className="text-lg font-semibold border-b pb-2">Execution</h2>
          <div className="grid gap-6">
            {!task.plan && !task.taskList ? (
              <div className="text-sm text-muted-foreground italic">
                No execution plan or task list was necessary due to the simplicity of the task.
              </div>
            ) : (
              <>
                {task.plan && (
                  <div className="space-y-2">
                    <Label>Plan</Label>
                    <div className="p-4 bg-muted/50 rounded-lg border text-sm">
                      <Markdown content={task.plan} />
                    </div>
                  </div>
                )}
                {task.taskList && (
                  <div className="space-y-2">
                    <Label>Task List</Label>
                    <div className="p-4 bg-muted/50 rounded-lg border text-sm font-mono">
                      <Markdown content={task.taskList} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* RESULT */}
        <section className="rounded-xl border bg-card p-6 space-y-6">
          <h2 className="text-lg font-semibold border-b pb-2">Result</h2>
          <div className="grid gap-6">
            {task.workSummary && (
              <div className="space-y-2">
                <Label>Work Summary</Label>
                <div className="p-4 bg-muted/50 rounded-lg border text-sm">
                  <Markdown content={task.workSummary} />
                </div>
              </div>
            )}
            
            {task.result && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Result
                  {task.status === "success" && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500">
                      Success
                    </span>
                  )}
                </Label>
                <div className="p-4 rounded-lg border text-sm mt-1 bg-emerald-500/5 border-emerald-500/20">
                  <Markdown content={task.result} />
                </div>
              </div>
            )}

            {task.failureReason && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Failure Reason
                  {task.status === "failed" && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500">
                      Failed
                    </span>
                  )}
                </Label>
                <div className="p-4 rounded-lg border text-sm mt-1 bg-red-500/5 border-red-500/20">
                  <Markdown content={task.failureReason} />
                </div>
              </div>
            )}
            
            {!task.workSummary && !task.result && !task.failureReason && (
              <div className="text-sm text-muted-foreground italic">
                No result or failure reason provided yet.
              </div>
            )}
          </div>
        </section>

        </div>

        {/* Comments Area */}
        <div className="space-y-6">
          <section className="rounded-xl border bg-card flex flex-col h-[500px]">
            <div className="border-b px-5 py-4 flex items-center gap-2 bg-muted/20">
              <MessageSquare className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Comments & Updates</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
               <CommentsList comments={comments} agents={agents} onDelete={handleDeleteComment} />
            </div>

            <div className="p-4 border-t bg-muted/10">
              <textarea
                placeholder="Add a comment..."
                className="w-full min-h-[80px] p-3 text-sm rounded-md border border-input bg-background resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handlePostComment();
                  }
                }}
              />
              <div className="mt-2 flex justify-end">
                <Button 
                  size="sm" 
                  disabled={!newComment.trim() || isPostingComment}
                  onClick={handlePostComment}
                >
                  {isPostingComment ? <Loader2 className="size-3.5 animate-spin" /> : "Post Comment"}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {showInstructionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 sm:p-6" onClick={() => setShowInstructionsModal(false)}>
          <div className="bg-card text-card-foreground border rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between bg-muted/20">
              <h3 className="font-semibold flex items-center gap-2"><Info className="size-4 text-muted-foreground" /> Context & Instructions</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setShowInstructionsModal(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="p-6 overflow-y-auto text-sm leading-relaxed">
              <Markdown content={task.instructions || ""} />
            </div>
            <div className="px-6 py-4 border-t bg-muted/20 flex justify-end">
              <Button variant="outline" onClick={() => setShowInstructionsModal(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
