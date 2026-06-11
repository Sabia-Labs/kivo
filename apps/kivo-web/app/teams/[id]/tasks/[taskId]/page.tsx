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
import { useTranslation } from "@/lib/i18n";

export default function TaskPage() {
  const { token, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
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
          toast.error(t.taskPage.notFound);
          router.replace(`/teams/${teamId}`);
          return;
        }
        const tm: Team = (await teamRes.json()).data;
        const tObj: Task = (await taskRes.json()).data;
        const a: Agent[] = (await agentsRes.json()).data ?? [];
        const c: Comment[] = commentsRes.ok ? (await commentsRes.json()).data ?? [] : [];

        setTeam(tm);
        setTask(tObj);
        setTitle(tObj.title || "");
        setAgents(a);
        setComments(c);

        if (tObj.requestId) {
          fetch(`${API_BASE}/teams/${teamId}/requests/${tObj.requestId}`, { headers: headers() })
            .then(res => res.json())
            .then(data => {
              if (!data.error && data.data) {
                setRequest(data.data);
              }
            })
            .catch(err => console.error("Failed to load related request", err));
        }
      })
      .catch((err) => {
        console.error("Failed to load task data:", err);
        toast.error(t.taskPage.failedLoadTaskDetails);
      })
      .finally(() => setIsLoading(false));
  }, [taskId, teamId, token, headers, router, t.taskPage.notFound, t.taskPage.failedLoadTaskDetails]);

  useEffect(() => {
    if (!authLoading) loadData();
  }, [authLoading, loadData]);

  const handleDeleteTask = async () => {
    if (!task) return;
    if (!confirm(t.taskPage.deleteConfirm)) return;
    
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: "DELETE",
        headers: headers(),
      });
      if (!res.ok) throw new Error();
      toast.success(t.taskPage.taskDeleted);
      router.replace(`/teams/${teamId}`);
    } catch {
      toast.error(t.taskPage.failedDeleteTask);
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
      toast.success(t.teamsPage.titleUpdated);
      setTask({ ...task, title: title.trim() });
    } catch {
      toast.error(t.teamsPage.failedUpdateTitle);
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
      toast.success(t.taskPage.commentPosted);
    } catch {
      toast.error(t.taskPage.failedPostComment);
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm(t.taskPage.deleteCommentConfirm)) return;
    try {
      const res = await fetch(`${API_BASE}/tasks/comments/${commentId}`, {
        method: "DELETE",
        headers: headers(),
      });
      if (!res.ok) throw new Error();
      setComments(prev => prev.filter(c => c.id !== commentId));
      toast.success(t.taskPage.commentDeleted);
    } catch {
      toast.error(t.taskPage.failedDeleteComment);
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

  const statusKey = task.status === "success" ? "ok" :
    task.status === "failed" ? "failed" :
    task.status === "open" ? "open" : task.status;
  const statusLabel = (t.teamsPage.statusLabels as any)[statusKey] || statusKey.replace("_", " ");

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
          {t.taskPage.backToTeam}
        </Link>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleDeleteTask}
          className="h-8 px-2 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 transition-colors"
          title={t.taskPage.deleteTask}
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
              placeholder={t.taskPage.taskTitle}
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
              {t.taskPage.createdOn} {new Date(task.createdAt!).toLocaleString()} — {t.taskPage.executedBy} <span className="font-semibold text-foreground">{assignedAgent?.name || t.taskPage.unassigned}</span>
            </span>
            {request && (
              <>
                <span>•</span>
                <Link href={`/teams/${teamId}/requests/${request.identifier || request.id}`} className="hover:underline flex items-center gap-1">
                  {t.taskPage.relatedRequest}: <span className="font-mono text-primary">{request.identifier || request.id.substring(0,8)}</span>
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
          <h2 className="text-lg font-semibold border-b pb-2">{t.taskPage.input}</h2>
          <div className="grid gap-6">
            <div className="space-y-2">
              <Label>{t.taskPage.prompt}</Label>
              <div className="p-4 bg-muted/50 rounded-lg border text-sm">
                <Markdown content={task.prompt || ""} />
              </div>
            </div>
            
            <div className="flex items-center justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowInstructionsModal(true)} className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground">
                <Info className="size-3.5 mr-1.5" />
                {t.taskPage.viewPassedInstructions}
              </Button>
            </div>
          </div>
        </section>

        {/* EXECUTION */}
        <section className="rounded-xl border bg-card p-6 space-y-6">
          <h2 className="text-lg font-semibold border-b pb-2">{t.taskPage.execution}</h2>
          <div className="grid gap-6">
            {!task.plan && !task.taskList ? (
              <div className="text-sm text-muted-foreground italic">
                {t.taskPage.noPlanOrListNeeded}
              </div>
            ) : (
              <>
                {task.plan && (
                  <div className="space-y-2">
                    <Label>{t.taskPage.plan}</Label>
                    <div className="p-4 bg-muted/50 rounded-lg border text-sm">
                      <Markdown content={task.plan} />
                    </div>
                  </div>
                )}
                {task.taskList && (
                  <div className="space-y-2">
                    <Label>{t.taskPage.taskList}</Label>
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
          <h2 className="text-lg font-semibold border-b pb-2">{t.taskPage.result}</h2>
          <div className="grid gap-6">
            {task.workSummary && (
              <div className="space-y-2">
                <Label>{t.taskPage.workSummary}</Label>
                <div className="p-4 bg-muted/50 rounded-lg border text-sm">
                  <Markdown content={task.workSummary} />
                </div>
              </div>
            )}
            
            {task.result && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  {t.taskPage.result}
                  {task.status === "success" && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500">
                      {t.taskPage.success}
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
                  {t.taskPage.failureReason}
                  {task.status === "failed" && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500">
                      {t.taskPage.failed}
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
                {t.taskPage.noResultYet}
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
              <h3 className="text-sm font-semibold">{t.taskPage.commentsAndUpdates}</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
               <CommentsList comments={comments} agents={agents} onDelete={handleDeleteComment} />
            </div>

            <div className="p-4 border-t bg-muted/10">
              <textarea
                placeholder={t.taskPage.addCommentPlaceholder}
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
                  {isPostingComment ? <Loader2 className="size-3.5 animate-spin" /> : t.taskPage.postComment}
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
              <h3 className="font-semibold flex items-center gap-2"><Info className="size-4 text-muted-foreground" /> {t.taskPage.passedInstructions}</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setShowInstructionsModal(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="p-6 overflow-y-auto text-sm leading-relaxed">
              <Markdown content={task.instructions || ""} />
            </div>
            <div className="px-6 py-4 border-t bg-muted/20 flex justify-end">
              <Button variant="outline" onClick={() => setShowInstructionsModal(false)}>{t.taskPage.close}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
