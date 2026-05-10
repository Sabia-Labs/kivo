"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Send, MessageSquare, Bot, CheckCircle2, Clock, X, Plus, Trash2, ChevronRight, ListTodo, Edit2, Check, FolderKanban, ChevronDown, Activity, Filter, Info } from "lucide-react";
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

function SmartCapabilitySelect({ 
  value, 
  onChange, 
  availableCapabilities 
}: { 
  value: string[], 
  onChange: (val: string[]) => void, 
  availableCapabilities: { identifier: string; name: string }[] 
}) {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const currentValues = value || [];
  
  const cleanInput = inputValue.trim().toLowerCase();
  
  const filteredCaps = availableCapabilities.filter(c => 
    !currentValues.includes(c.identifier) && 
    (c.identifier.toLowerCase().includes(cleanInput) || c.name.toLowerCase().includes(cleanInput))
  );

  const handleAdd = (id: string) => {
    onChange([...currentValues, id]);
    setInputValue("");
    inputRef.current?.focus();
  };
  
  const handleRemove = (id: string) => {
    const next = currentValues.filter(v => v !== id);
    onChange(next);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && cleanInput) {
      e.preventDefault();
      if (filteredCaps.length > 0) {
        handleAdd(filteredCaps[0].identifier);
      }
    } else if (e.key === 'Backspace' && !inputValue && currentValues.length > 0) {
      handleRemove(currentValues[currentValues.length - 1]);
    }
  };

  return (
    <div className="relative flex flex-col w-full">
      <div 
        className={cn(
          "flex flex-wrap gap-1.5 p-1.5 w-full rounded-md border bg-transparent min-h-[40px] text-sm shadow-sm transition-colors",
          isFocused ? "border-primary ring-1 ring-primary" : "border-input"
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {currentValues.map(v => {
          const cap = availableCapabilities.find(c => c.identifier === v);
          return (
            <span key={v} className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium cursor-default",
              cap ? "bg-muted text-foreground border" : "bg-primary/20 text-primary border border-primary/30"
            )}>
              {cap ? cap.name : v}
              <button 
                type="button" 
                onClick={(e) => { e.stopPropagation(); handleRemove(v); }}
                className="hover:bg-black/10 rounded-full p-0.5 transition-colors"
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setTimeout(() => setIsFocused(false), 200);
          }}
          className="flex-1 min-w-[120px] bg-transparent outline-none px-1 py-0.5 text-sm"
          placeholder={currentValues.length === 0 ? "Type capability identifier or name..." : ""}
        />
      </div>

      {isFocused && (inputValue || filteredCaps.length > 0) && (
        <div className="absolute top-[calc(100%+4px)] left-0 w-full z-50 bg-popover text-popover-foreground rounded-md border shadow-md overflow-hidden max-h-[200px] overflow-y-auto">
          {filteredCaps.map(cap => (
            <div 
              key={cap.identifier}
              className="px-3 py-2 text-sm hover:bg-muted cursor-pointer flex justify-between items-center"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAdd(cap.identifier)}
            >
              <span>{cap.name}</span>
              <span className="text-xs text-muted-foreground">{cap.identifier}</span>
            </div>
          ))}
          {filteredCaps.length === 0 && inputValue && (
            <div className="px-3 py-2 text-sm text-muted-foreground text-center">
              No matching capabilities
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

  const statusLabel = req.status === "completed" 
    ? (req.resolution === "success" ? t.teamsPage.statusLabels.ok : t.teamsPage.statusLabels.failed) 
    : (t.teamsPage.statusLabels as any)[req.status] || req.status.replace("_", " ");

  const statusColorClass = req.status === "draft" ? "bg-muted text-muted-foreground" :
    req.status === "open" ? "bg-blue-500/10 text-blue-500" :
    req.status === "in_progress" ? "bg-amber-500/10 text-amber-500" :
    req.status === "waiting_user" ? "bg-purple-500/10 text-purple-500" :
    req.status === "completed" ? (
      req.resolution === "success" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
    ) :
    req.status === "cancelled" ? "bg-gray-500/10 text-gray-500" :
    "bg-emerald-500/10 text-emerald-500";

  return (
    <div className="flex flex-col border-b last:border-0 border-border/50 w-full">
      <div 
        className={cn("flex flex-col sm:flex-row sm:items-center gap-3 p-3 hover:bg-muted/30 transition-colors group", level > 0 && "bg-muted/5")} 
        style={{ paddingLeft: `${1 + level * 1.5}rem`, paddingRight: '1rem' }}
      >
        <button 
          onClick={handleExpand} 
          className="flex size-6 items-center justify-center rounded-md hover:bg-muted text-muted-foreground shrink-0 focus:outline-none"
        >
          {isLoading ? (
            <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : isExpanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
        <Link href={req.status === 'draft' ? `/teams/${teamId}/requests/new?requestId=${req.identifier}` : `/teams/${teamId}/requests/${req.identifier}`} className="flex items-center gap-3 min-w-0 flex-1 hover:underline">
          <span className="text-xs font-mono text-muted-foreground">{req.identifier}</span>
          <span className="text-sm font-medium truncate">{req.title}</span>
        </Link>
        <div className="flex items-center gap-4 shrink-0 sm:ml-auto">
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", statusColorClass)}>
            {statusLabel}
          </span>
        </div>
      </div>
      
      {isExpanded && (
        <div className="flex flex-col w-full">
          {(!hasLoaded && isLoading) && (
            <div className="p-3 text-xs text-muted-foreground text-center" style={{ paddingLeft: `${1 + (level + 1) * 1.5}rem` }}>
              {t.teamsPage.loading}
            </div>
          )}
          {hasLoaded && tasks.length === 0 && subRequests.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground/50 italic" style={{ paddingLeft: `${1 + (level + 1) * 1.5}rem` }}>
              {t.teamsPage.noTasksOrNested}
            </div>
          )}

          {tasks.map(task => (
            <Link 
              key={task.id} 
              href={`/teams/${teamId}/tasks/${task.id}`} 
              className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 hover:bg-muted/30 transition-colors border-b border-border/30 last:border-0" 
              style={{ paddingLeft: `${1 + (level + 1) * 1.5}rem`, paddingRight: '1rem' }}
            >
              <div className="flex size-6 items-center justify-center shrink-0">
                <FolderKanban className="size-3.5 text-muted-foreground/70" />
              </div>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-sm text-muted-foreground font-medium truncate">{task.title}</span>
              </div>
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
    if (!key.includes(".")) return key; // Not a translation key
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

  const toggleStatusFilter = (status: string) => {
    setStatusFilter(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };
  
  // Draft edit state
  const [title, setTitle] = useState("");
  const [requestDetails, setRequestDetails] = useState("");
  const [capabilitiesWorkflow, setCapabilitiesWorkflow] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // Comment state
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Instructions Modal
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);

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
        setTitle(d.title);
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
      if (!res.ok) throw new Error("Failed to reopen request");
      toast.success("Request reopened");
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const [showContextModal, setShowContextModal] = useState(false);

  const handleUpdateTitle = async () => {
    if (!title.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/teams/${teamId}/requests/${requestId}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Failed to update title");
      toast.success("Title updated");
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
      setTitle(request?.title || "");
    }
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

      if (!res.ok) throw new Error("Failed to post comment");
      setNewComment("");
      
      // Fetch just comments
      const commentsRes = await fetch(`${API_BASE}/teams/${teamId}/requests/${requestId}/comments`, { headers: headers() });
      if (commentsRes.ok) setComments((await commentsRes.json()).data ?? []);
      
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this request? This action cannot be undone.")) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/teams/${teamId}/requests/${requestId}`, {
        method: "DELETE",
        headers: headers(),
      });

      if (!res.ok) throw new Error("Failed to delete request");

      toast.success("Request deleted");
      router.replace(`/teams/${teamId}`);
    } catch (err: any) {
      toast.error(err.message);
      setIsSubmitting(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!request) return null;

  const isDraft = request.status === "draft";
  const getExecutorName = () => {
    if (tasks && tasks.length > 0) {
      const sortedTasks = [...tasks].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const lastTask = sortedTasks[0];
      if (lastTask.assignedAgentId) {
        const agent = agents.find(a => a.id === lastTask.assignedAgentId);
        if (agent) return agent.name;
      }
    }
    const teamLeaderRole = roles.find(r => r.name.toLowerCase().includes('leader') || r.name.toLowerCase().includes('líder'));
    if (teamLeaderRole) {
      const leaderAgent = agents.find(a => a.roleId === teamLeaderRole.id);
      if (leaderAgent) return leaderAgent.name;
    }
    return "Team Leader";
  };

  const executorName = getExecutorName();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="flex items-center justify-between mb-6">
        <Link href={`/teams/${teamId}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          {t.teamsPage.backToTeam}
        </Link>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleDelete}
          disabled={isSubmitting}
          className="h-8 px-2 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 transition-colors"
          title={t.teamsPage.deleteRequest}
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
              placeholder={t.teamsPage.whatToAskPlaceholder}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  setIsEditingTitle(false);
                  if (title !== request.title) handleUpdateTitle();
                }
              }}
            />
            <Button size="icon" variant="ghost" className="shrink-0" onClick={() => {
              setIsEditingTitle(false);
              if (title !== request.title) handleUpdateTitle();
            }}>
              <Check className="size-6 text-emerald-500" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group">
            <h1 className="text-3xl font-bold tracking-tight px-1 flex items-center gap-2">
              <span className="text-muted-foreground font-mono text-2xl">{request.identifier}</span>
              {request.title}
            </h1>
            <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity size-8 shrink-0" onClick={() => setIsEditingTitle(true)}>
              <Edit2 className="size-4 text-muted-foreground" />
            </Button>
          </div>
        )}
        <div className="flex items-center gap-4">
          <p className="text-xs text-muted-foreground flex items-center gap-2 px-1">
            <span className={cn(
              "px-2 py-0.5 rounded-full font-medium capitalize",
              request.status === "draft" ? "bg-muted text-muted-foreground" :
              request.status === "open" ? "bg-blue-500/10 text-blue-500" :
              request.status === "in_progress" ? "bg-amber-500/10 text-amber-500" :
              request.status === "completed" ? (
                request.resolution === "success" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
              ) :
              "bg-emerald-500/10 text-emerald-500"
            )}>
              {request.status === "completed" 
                ? (request.resolution === "success" ? "ok" : "failed") 
                : request.status}
            </span>
            <span>•</span>
            <span>
              {t.teamsPage.createdBy} <span className="font-semibold text-foreground">{request.requesterUserId ? t.teamsPage.you : (agents.find(a => a.id === request.requesterAgentId)?.name || "Unknown")}</span> {t.teamsPage.on} {new Date(request.createdAt).toLocaleString()}
            </span>
          </p>
          {request.status === "completed" && (
            <Button size="sm" variant="outline" onClick={handleReopen} disabled={isSubmitting}>
              {t.teamsPage.reopenRequest}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-8 w-full">
        
        {/* Main Content Area */}
        <div className="space-y-6 w-full">
          <div className="rounded-xl border bg-card p-6 space-y-6">
            <div className="grid gap-6">

              {/* What was asked */}
              <div className="space-y-2">
                <Label>{t.teamsPage.whatWasAsked}</Label>
                <div className="p-4 bg-muted/50 rounded-lg border text-sm whitespace-pre-wrap">
                  {request.requestDetails || <span className="text-muted-foreground italic">{t.teamsPage.noDetails}</span>}
                </div>
              </div>



              {/* Response */}
              {request.status !== "created" && request.response && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      {t.teamsPage.response}
                      {request.status === "completed" && (
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          request.resolution === "success" ? t.teamsPage.statusLabels.ok : t.teamsPage.statusLabels.failed
                        )}>
                          {request.resolution === "success" ? t.teamsPage.success : t.teamsPage.failed}
                        </span>
                      )}
                    </Label>
                    <span className="text-xs text-muted-foreground flex items-center gap-3" title="Time of response">
                      <span className="flex items-center gap-1">
                        <Bot className="size-3" />
                        {executorName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {new Date(request.completedAt || request.updatedAt).toLocaleString()}
                      </span>
                    </span>
                  </div>
                  <div className={cn(
                    "p-4 rounded-lg border text-sm whitespace-pre-wrap mt-1",
                    request.status === "completed" && request.resolution !== "success"
                      ? "bg-red-500/5 border-red-500/20"
                      : "bg-emerald-500/5 border-emerald-500/20"
                  )}>
                    {typeof request.response === 'string' ? request.response : JSON.stringify(request.response, null, 2)}
                  </div>
                </div>
              )}



              <div className="flex items-center justify-between gap-4 w-full">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Label className="shrink-0">{request.status === "completed" ? t.teamsPage.capabilitiesUsed : t.teamsPage.suggestedCapabilities}</Label>
                  <div className="flex items-center gap-2 overflow-x-auto flex-nowrap min-w-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {capabilitiesWorkflow.length === 0 ? (
                      <span className="text-sm text-muted-foreground italic shrink-0">{t.teamsPage.none}</span>
                    ) : (
                      capabilitiesWorkflow.map(capIdRaw => {
                        const capId = typeof capIdRaw === 'object' && capIdRaw !== null ? (capIdRaw as any).identifier : String(capIdRaw);
                        const capName = typeof capIdRaw === 'object' && capIdRaw !== null ? (capIdRaw as any).name : capId;
                        const cap = capabilities.find(c => c.identifier === capId);
                        return (
                          <span key={capId} className="px-3 py-1 text-xs rounded-full border bg-muted/50 shrink-0 whitespace-nowrap">
                            {cap ? translate(cap.name) : capName}
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
                {request.state && request.state.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setShowContextModal(true)} className="h-7 px-3 text-xs shrink-0">
                    {t.teamsPage.contextState}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Child Requests & Tasks Section */}
          <section className="rounded-xl border bg-card overflow-hidden mt-6">
            <div className="border-b px-5 py-3 flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-2">
                <ListTodo className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{t.teamsPage.tasksAndSubRequests}</h3>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-2 text-muted-foreground">
                    <Filter className="size-3.5" />
                    {t.teamsPage.filters}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>{t.teamsPage.status}</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem 
                    checked={statusFilter.includes("draft")} 
                    onCheckedChange={() => toggleStatusFilter("draft")}
                  >
                    {t.teamsPage.statusLabels.draft}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem 
                    checked={statusFilter.includes("open")} 
                    onCheckedChange={() => toggleStatusFilter("open")}
                  >
                    {t.teamsPage.statusLabels.open}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem 
                    checked={statusFilter.includes("in_progress")} 
                    onCheckedChange={() => toggleStatusFilter("in_progress")}
                  >
                    {t.teamsPage.statusLabels.in_progress}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem 
                    checked={statusFilter.includes("waiting_user")} 
                    onCheckedChange={() => toggleStatusFilter("waiting_user")}
                  >
                    {t.teamsPage.statusLabels.waiting_user}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem 
                    checked={statusFilter.includes("completed")} 
                    onCheckedChange={() => toggleStatusFilter("completed")}
                  >
                    {t.teamsPage.statusLabels.completed}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem 
                    checked={statusFilter.includes("cancelled")} 
                    onCheckedChange={() => toggleStatusFilter("cancelled")}
                  >
                    {t.teamsPage.statusLabels.cancelled}
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex flex-col w-full">
              {tasks.length === 0 && childRequests.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {t.teamsPage.noTasksOrSubRequests}
                </div>
              ) : (
                <>
                  {tasks.map(task => (
                    <Link 
                      key={task.id} 
                      href={`/teams/${teamId}/tasks/${task.id}`} 
                      className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 hover:bg-muted/30 transition-colors border-b border-border/30 last:border-0" 
                      style={{ paddingLeft: `1rem`, paddingRight: '1rem' }}
                    >
                      <div className="flex size-6 items-center justify-center shrink-0">
                        <FolderKanban className="size-3.5 text-muted-foreground/70" />
                      </div>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-sm text-muted-foreground font-medium truncate">{task.title}</span>
                      </div>
                    </Link>
                  ))}
                  {childRequests.filter(req => statusFilter.includes(req.status)).map(req => (
                    <RequestRow key={req.id} req={req} teamId={teamId} />
                  ))}
                </>
              )}
            </div>
          </section>

        </div>

        {/* Sidebar / Comments Area -> Now Bottom Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full mt-6">
          <section className="rounded-xl border bg-card flex flex-col h-[500px]">
            <div className="border-b px-5 py-4 flex items-center gap-2 bg-muted/20">
              <MessageSquare className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{t.teamsPage.commentsAndUpdates}</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {comments.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {t.teamsPage.noComments}
                </div>
              ) : (
                comments.map(c => {
                  const isHuman = c.actorType === "human";
                  const agent = isHuman ? null : agents.find((a) => a.id === c.actorId);
                  
                  return (
                    <div key={c.id} className="flex gap-3 text-sm">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-lg mt-0.5">
                        {isHuman ? "👤" : (agent?.icon || "🤖")}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">
                            {isHuman ? t.teamsPage.you : agent?.name || "Agent"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-muted-foreground p-3 bg-muted/30 rounded-lg rounded-tl-none border">
                          {c.content}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t bg-muted/10">
              <textarea
                placeholder={t.teamsPage.addCommentPlaceholder}
                className="w-full min-h-[80px] p-3 text-sm rounded-md border border-input bg-background resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitComment();
                  }
                }}
              />
              <div className="mt-2 flex justify-end">
                <Button 
                  size="sm" 
                  disabled={!newComment.trim() || isSubmittingComment}
                  onClick={handleSubmitComment}
                >
                  {t.teamsPage.postComment}
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card flex flex-col h-[500px]">
            <div className="border-b px-5 py-4 flex items-center gap-2 bg-muted/20">
              <Activity className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{t.teamsPage.activities}</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activities.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {t.teamsPage.noActivities}
                </div>
              ) : (
                activities.map((act) => {
                  const isHuman = act.actorType === "human";
                  const agent = isHuman ? null : agents?.find((a) => a.id === act.actorId);
                  const title = act.activityTitle || act.payload?.title || act.entityId?.substring(0, 8) || act.requestId?.substring(0, 8) || act.taskId?.substring(0, 8) || "an item";
                  
                  return (
                    <div key={act.id} className="flex gap-3 items-start">
                      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs mt-0.5">
                        {isHuman ? "👤" : (agent?.icon || "🤖")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs leading-tight">
                          <span className="font-medium text-foreground">{isHuman ? t.teamsPage.you : agent?.name || "Agent"}</span>
                          {act.activityTitle ? (
                            <span className="text-muted-foreground"> {act.activityTitle}</span>
                          ) : (
                            <>
                              <span className="text-muted-foreground"> {t.teamsPage.updated} </span>
                              <span className="font-medium text-foreground">{title}</span>
                            </>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
        
      </div>

      {/* Context/State Modal */}
      {showContextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border shadow-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-lg">Context / State</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowContextModal(false)} className="size-8">
                <X className="size-4" />
              </Button>
            </div>
            <div className="p-4 overflow-y-auto text-sm font-mono whitespace-pre-wrap flex flex-col gap-2">
              {request.state.map((s: string, i: number) => (
                <div key={i} className="border-b last:border-0 border-border/50 pb-2 last:pb-0">{s}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Instructions Modal */}
      {showInstructionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border shadow-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-lg">Instruções do Agente</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowInstructionsModal(false)} className="size-8">
                <X className="size-4" />
              </Button>
            </div>
            <div className="p-4 overflow-y-auto text-sm whitespace-pre-wrap">
              {request.instructions}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
