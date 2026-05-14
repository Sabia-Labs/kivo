"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Send, MessageSquare, Bot, CheckCircle2, Clock, X, Plus, Trash2, ChevronRight, ListTodo, Edit2, Check, FolderKanban, ChevronDown, Activity, Filter, Info, AlertCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n";
import { Markdown } from "@/components/Markdown";

function RequestRow({ req, teamId, level = 0 }: { req: any, teamId: string, level?: number }) {
  const { token } = useAuth();
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [subRequests, setSubRequests] = useState<any[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleExpand = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isExpanded && !hasLoaded) {
      setIsLoading(true);
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      try {
        const [tasksRes, reqsRes] = await Promise.all([
          fetch(`${API_BASE}/teams/${teamId}/requests/${req.identifier}/tasks`, { headers }),
          fetch(`${API_BASE}/teams/${teamId}/requests?parentRequestId=${req.id}`, { headers })
        ]);
        if (tasksRes.ok) setTasks((await tasksRes.json()).data ?? []);
        if (reqsRes.ok) setSubRequests((await reqsRes.json()).data ?? []);
        setHasLoaded(true);
      } catch (err) {
        console.error("Failed to load children", err);
      } finally {
        setIsLoading(false);
      }
    }
    setIsExpanded(!isExpanded);
  };

  const statusLabel = req?.status === "completed" 
    ? (req.resolution === "success" ? t?.teamsPage?.statusLabels?.ok : t?.teamsPage?.statusLabels?.failed) 
    : (t?.teamsPage?.statusLabels as any)?.[req?.status || ""] || req?.status?.replace("_", " ") || "...";

  return (
    <div className="flex flex-col border-b last:border-0 border-border/50 w-full">
      <div 
        className={cn("flex flex-col sm:flex-row sm:items-center gap-3 p-3 hover:bg-muted/30 transition-colors group", level > 0 && "bg-muted/5")} 
        style={{ paddingLeft: `${1 + level * 1.5}rem`, paddingRight: '1rem' }}
      >
        <button onClick={handleExpand} className="flex size-6 items-center justify-center rounded-md hover:bg-muted text-muted-foreground shrink-0 focus:outline-none">
          {isLoading ? <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <Link href={req?.status === 'draft' ? `/teams/${teamId}/requests/new?requestId=${req?.identifier}` : `/teams/${teamId}/requests/${req?.identifier}`} className="flex items-center gap-3 min-w-0 flex-1 hover:underline">
          <span className="text-xs font-mono text-muted-foreground">{req?.identifier}</span>
          <span className="text-sm font-medium truncate">{req?.title}</span>
        </Link>
        <div className="flex items-center gap-4 shrink-0 sm:ml-auto">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize bg-primary/10 text-primary">
            {statusLabel}
          </span>
        </div>
      </div>
      
      {isExpanded && (
        <div className="flex flex-col w-full">
          {(!hasLoaded && isLoading) && <div className="p-3 text-xs text-muted-foreground text-center">{t?.teamsPage?.loading}</div>}
          {hasLoaded && tasks.length === 0 && subRequests.length === 0 && <div className="p-3 text-xs text-muted-foreground/50 italic">{t?.teamsPage?.noTasksOrNested}</div>}
          {tasks.map(task => (
            <Link key={task.id} href={`/teams/${teamId}/tasks/${task.id}`} className="flex items-center gap-3 p-3 hover:bg-muted/30 border-b border-border/30 last:border-0" style={{ paddingLeft: `${1 + (level + 1) * 1.5}rem` }}>
              <FolderKanban className="size-3.5 text-muted-foreground/70" />
              <span className="text-sm text-muted-foreground font-medium truncate">{task.title}</span>
            </Link>
          ))}
          {subRequests.map(subReq => (
            <RequestRow key={subReq.id} req={subReq} teamId={teamId} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function RequestDetailsPage() {
  const { token, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const teamId = String(params.id);
  const requestId = String(params.requestId);

  const translate = useCallback((key: string) => {
    if (!key) return "";
    if (!key.includes(".")) return key;
    const parts = key.split(".");
    let current: any = t;
    for (const part of parts) {
      if (!current || current[part] === undefined) return key;
      current = current[part];
    }
    return typeof current === "string" ? current : key;
  }, [t]);

  const [isLoading, setIsLoading] = useState(true);
  const [request, setRequest] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [capabilities, setCapabilities] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [childRequests, setChildRequests] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>(["draft", "open", "in_progress", "waiting_user", "completed", "cancelled", "failed"]);

  const [title, setTitle] = useState("");
  const [requestDetails, setRequestDetails] = useState("");
  const [capabilitiesWorkflow, setCapabilitiesWorkflow] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [showContextModal, setShowContextModal] = useState(false);

  const headers = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  const fetchData = useCallback(async () => {
    try {
      const [reqRes, agentsRes, rolesRes, commentsRes, capsRes, tasksRes, childReqsRes, actsRes] = await Promise.all([
        fetch(`${API_BASE}/teams/${teamId}/requests/${requestId}`, { headers: headers() }),
        fetch(`${API_BASE}/agents?teamId=${teamId}`, { headers: headers() }),
        fetch(`${API_BASE}/meta/agent-roles`, { headers: headers() }),
        fetch(`${API_BASE}/teams/${teamId}/requests/${requestId}/comments`, { headers: headers() }),
        fetch(`${API_BASE}/teams/${teamId}/capabilities`, { headers: headers() }),
        fetch(`${API_BASE}/teams/${teamId}/requests/${requestId}/tasks`, { headers: headers() }),
        fetch(`${API_BASE}/teams/${teamId}/requests?parentRequestId=${requestId}`, { headers: headers() }),
        fetch(`${API_BASE}/teams/${teamId}/activities?requestId=${requestId}`, { headers: headers() }),
      ]);

      if (reqRes.ok) {
        const d = (await reqRes.json()).data;
        if (d.status === "draft") {
          router.replace(`/teams/${teamId}/requests/new?requestId=${d.identifier}`);
          return;
        }
        setRequest(d);
        setTitle(d.title || "");
        setRequestDetails(d.requestDetails || "");
        setCapabilitiesWorkflow(d.capabilitiesWorkflow || []);
      } else {
        toast.error("Request not found");
        router.replace(`/teams/${teamId}`);
        return;
      }

      if (agentsRes.ok) setAgents((await agentsRes.json()).data ?? []);
      if (rolesRes.ok) setRoles((await rolesRes.json()).data ?? []);
      if (commentsRes.ok) setComments((await commentsRes.json()).data ?? []);
      if (capsRes.ok) setCapabilities((await capsRes.json()).data ?? []);
      if (tasksRes.ok) setTasks((await tasksRes.json()).data ?? []);
      if (childReqsRes.ok) setChildRequests((await childReqsRes.json()).data ?? []);
      if (actsRes.ok) setActivities((await actsRes.json()).data ?? []);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [teamId, requestId, headers, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!token) { router.replace("/login"); return; }
    fetchData();
  }, [authLoading, token, fetchData]);

  const handleReopen = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/teams/${teamId}/requests/${requestId}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ status: "open", resolution: null }),
      });
      if (res.ok) {
        toast.success(t?.teamsPage?.requestReopened || "Request reopened");
        fetchData();
      }
    } catch (err: any) { toast.error(err.message); } finally { setIsSubmitting(false); }
  };

  const handleUpdateTitle = async () => {
    if (!title.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/teams/${teamId}/requests/${requestId}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        toast.success(t?.teamsPage?.titleUpdated || "Title updated");
        fetchData();
      }
    } catch (err: any) { toast.error(err.message); }
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;
    setIsSubmittingComment(true);
    try {
      const res = await fetch(`${API_BASE}/teams/${teamId}/requests/${requestId}/comments`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ content: newComment }),
      });
      if (res.ok) {
        setNewComment("");
        const commentsRes = await fetch(`${API_BASE}/teams/${teamId}/requests/${requestId}/comments`, { headers: headers() });
        if (commentsRes.ok) setComments((await commentsRes.json()).data ?? []);
      }
    } catch (err: any) { toast.error(err.message); } finally { setIsSubmittingComment(false); }
  };

  if (authLoading || isLoading) return <div className="flex min-h-svh items-center justify-center"><div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!request) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <Link href={`/teams/${teamId}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-3.5" /> {t?.teamsPage?.backToTeam}
      </Link>

      <header className="mb-8 space-y-3">
        {isEditingTitle ? (
          <div className="flex items-center gap-2">
            <Input value={title} onChange={e => setTitle(e.target.value)} autoFocus className="text-3xl font-bold h-14" placeholder={t?.teamsPage?.whatToAskPlaceholder} onKeyDown={e => { if (e.key === "Enter") { setIsEditingTitle(false); handleUpdateTitle(); } }} />
            <Button size="icon" variant="ghost" onClick={() => { setIsEditingTitle(false); handleUpdateTitle(); }}><Check className="size-6 text-emerald-500" /></Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group">
            <h1 className="text-3xl font-bold tracking-tight px-1 flex items-center gap-2">
              <span className="text-muted-foreground font-mono text-2xl">{request?.identifier}</span>
              {request?.title}
            </h1>
            <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 size-8" onClick={() => setIsEditingTitle(true)}><Edit2 className="size-4" /></Button>
          </div>
        )}
        <div className="flex items-center gap-4">
          <p className="text-xs text-muted-foreground px-1">
            {t?.teamsPage?.createdBy} <span className="font-semibold text-foreground">{request?.requesterUserId ? (t?.teamsPage?.you || "You") : (agents?.find(a => a.id === request?.requesterAgentId)?.name || "Agent")}</span> {t?.teamsPage?.on} {request?.createdAt ? new Date(request.createdAt).toLocaleString() : ""}
          </p>
          {request?.status === "completed" && <Button size="sm" variant="outline" onClick={handleReopen} disabled={isSubmitting}>{t?.teamsPage?.reopenRequest}</Button>}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl border bg-card p-6 space-y-6">
            <div className="space-y-2">
              <Label>{t?.teamsPage?.whatWasAsked}</Label>
              <div className="p-4 bg-muted/50 rounded-lg border text-sm whitespace-pre-wrap">
                <Markdown content={request?.requestDetails || t?.teamsPage?.noDetails} />
              </div>
            </div>
            {request?.response && (
              <div className="space-y-2">
                <Label>{t?.teamsPage?.response}</Label>
                <div className="p-4 bg-emerald-500/5 border-emerald-500/20 rounded-lg border text-sm whitespace-pre-wrap">
                  <Markdown content={typeof request.response === 'string' ? request.response : JSON.stringify(request.response, null, 2)} />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 pt-4 border-t">
              <div className="flex items-center gap-3">
                <Label className="text-xs uppercase text-muted-foreground">{t?.teamsPage?.capabilitiesUsed}</Label>
                <div className="flex gap-2">
                  {capabilitiesWorkflow?.length === 0 ? <span className="text-xs italic text-muted-foreground">{t?.teamsPage?.none}</span> : capabilitiesWorkflow?.map((capId: any) => {
                    const c = capabilities?.find(x => x.identifier === (typeof capId === 'string' ? capId : capId?.identifier));
                    return <span key={typeof capId === 'string' ? capId : capId?.identifier} className="px-2 py-0.5 rounded-full border bg-muted text-[10px]">{c ? translate(c.name) : (typeof capId === 'string' ? capId : capId?.name)}</span>;
                  })}
                </div>
              </div>
              {request?.state?.length > 0 && <Button variant="outline" size="sm" onClick={() => setShowContextModal(true)} className="h-7 text-xs">{t?.teamsPage?.contextState}</Button>}
            </div>
          </section>

          <section className="rounded-xl border bg-card overflow-hidden">
            <div className="border-b px-5 py-3 bg-muted/20 flex items-center gap-2"><ListTodo className="size-4" /><h3 className="text-sm font-semibold">{t?.teamsPage?.tasksAndSubRequests}</h3></div>
            <div className="flex flex-col">
              {tasks.length === 0 && childRequests.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">{t?.teamsPage?.noTasksOrSubRequests}</div> : (
                <>
                  {tasks.map(task => (
                    <Link key={task.id} href={`/teams/${teamId}/tasks/${task.id}`} className="flex items-center gap-3 p-3 hover:bg-muted/30 border-b border-border/30 last:border-0"><FolderKanban className="size-3.5 text-muted-foreground" /><span className="text-sm truncate">{task.title}</span></Link>
                  ))}
                  {childRequests.map(req => <RequestRow key={req.id} req={req} teamId={teamId} />)}
                </>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border bg-card flex flex-col h-[500px]">
            <div className="border-b px-5 py-4 flex items-center gap-2 bg-muted/20"><MessageSquare className="size-4" /><h3 className="text-sm font-semibold">{t?.teamsPage?.commentsAndUpdates}</h3></div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {comments.length === 0 ? <div className="text-center py-8 text-sm text-muted-foreground">{t?.teamsPage?.noComments}</div> : comments.map(c => {
                const isHuman = c.actorType === "human";
                const agent = isHuman ? null : agents?.find(a => a.id === c.actorId);
                return (
                  <div key={c.id} className="flex gap-3 text-sm">
                    <div className="flex size-7 items-center justify-center rounded-full bg-muted text-lg">{isHuman ? "👤" : (agent?.icon || "🤖")}</div>
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between items-center"><span className="font-medium">{isHuman ? t?.teamsPage?.you : agent?.name || "Agent"}</span><span className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleTimeString()}</span></div>
                      <div className="p-2 bg-muted/30 rounded-lg border">
                        <Markdown content={c.content} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t bg-muted/10">
              <textarea placeholder={t?.teamsPage?.addCommentPlaceholder} className="w-full min-h-[80px] p-2 text-sm rounded-md border bg-background resize-none focus:outline-none" value={newComment} onChange={e => setNewComment(e.target.value)} />
              <Button size="sm" className="w-full mt-2" disabled={!newComment.trim() || isSubmittingComment} onClick={handleSubmitComment}>{t?.teamsPage?.postComment}</Button>
            </div>
          </section>
        </div>
      </div>

      {showContextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setShowContextModal(false)}>
          <div className="bg-card w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border shadow-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b"><h3>Context / State</h3><Button variant="ghost" size="icon" onClick={() => setShowContextModal(false)}><X className="size-4" /></Button></div>
            <div className="p-4 overflow-y-auto text-sm font-mono whitespace-pre-wrap">{request?.state?.map((s: any, i: number) => <div key={i} className="pb-2 border-b last:border-0">{typeof s === 'string' ? s : JSON.stringify(s)}</div>)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
