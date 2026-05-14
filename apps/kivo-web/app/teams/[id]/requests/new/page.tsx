"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SmartCapabilitySelect } from "@/components/smart-capability-select";
import { useTranslation } from "@/lib/i18n";
import { Markdown } from "@/components/Markdown";

export default function NewRequestPage() {
  const { token, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const params = useParams();
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const capabilityIdParam = searchParams?.get("capabilityId");
  const requestIdParam = searchParams?.get("requestId");
  const router = useRouter();
  const teamId = String(params.id);

  const translate = React.useCallback((key: string) => {
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [capabilities, setCapabilities] = useState<any[]>([]);
  const [selectedCapabilityInfo, setSelectedCapabilityInfo] = useState<any>(null);

  // Form State
  const [targetType, setTargetType] = useState<"anyone" | "agent" | "role">("anyone");
  const [targetAgentId, setTargetAgentId] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [requestDetails, setRequestDetails] = useState("");
  const [capabilitiesWorkflow, setCapabilitiesWorkflow] = useState<string[]>([]);
  
  // New Suggestion State
  const [title, setTitle] = useState("");
  const [hasUserEditedTitle, setHasUserEditedTitle] = useState(false);
  const [suggestedCapability, setSuggestedCapability] = useState<string | null>(null);
  
  // UI State

  const [isLeaderThinking, setIsLeaderThinking] = useState(false);
  const [leaderThought, setLeaderThought] = useState<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!token) { router.replace("/login"); return; }

    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_BASE}/agents?teamId=${teamId}`, { headers }),
      fetch(`${API_BASE}/meta/agent-roles`, { headers }),
      fetch(`${API_BASE}/teams/${teamId}/capabilities`, { headers }),
      requestIdParam ? fetch(`${API_BASE}/teams/${teamId}/requests/${requestIdParam}`, { headers }) : Promise.resolve(null)
    ]).then(async ([agentsRes, rolesRes, capsRes, reqRes]) => {
      let loadedAgents = [];
      let loadedCaps = [];
      if (agentsRes.ok) loadedAgents = (await agentsRes.json()).data ?? [];
      if (capsRes.ok) {
        loadedCaps = (await capsRes.json()).data ?? [];
        setCapabilities(loadedCaps);
      }
      setAgents(loadedAgents);

      let loadedRequest = null;
      if (reqRes && reqRes.ok) {
         loadedRequest = (await reqRes.json()).data;
      }

      if (loadedRequest) {
        // Populate from existing draft
        setRequestDetails(loadedRequest.requestDetails || "");
        setCapabilitiesWorkflow(loadedRequest.capabilitiesWorkflow || []);
        if (loadedRequest.targetAgentId) {
          setTargetType("agent");
          setTargetAgentId(loadedRequest.targetAgentId);
        } else if (loadedRequest.targetRole) {
          setTargetType("role");
          setTargetRole(loadedRequest.targetRole);
        } else {
          setTargetType("anyone");
        }
      } else {
        // Auto-assign team lead if available
        const lead = loadedAgents.find((a: any) => a.isLeader);
        if (lead) {
          setTargetType("agent");
          setTargetAgentId(lead.id);
        }

        // Handle URL capability
        if (capabilityIdParam && loadedCaps.length > 0) {
          const cap = loadedCaps.find((c: any) => c.id === capabilityIdParam);
          if (cap) {
            setCapabilitiesWorkflow([cap.identifier]);
            setSelectedCapabilityInfo(cap);
          }
        }
      }
    });
  }, [authLoading, token, teamId, capabilityIdParam, requestIdParam]);

  // Real Field Insight Logic
  const fetchFieldInsight = async (details: string, caps: string[]) => {
    try {
      const res = await fetch(`${API_BASE}/teams/${teamId}/requests/insight`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestDetails: details,
          capabilitiesWorkflow: caps,
        }),
      });
      if (!res.ok) {
        setLeaderThought(t.teamsPage.failedInsight);
        return;
      }
      const json = await res.json();
      setLeaderThought(json.data.leaderThought);

      if (json.data.suggestedTitle && !hasUserEditedTitle) {
        setTitle(json.data.suggestedTitle);
      }

      if (json.data.suggestedCapabilityIdentifier) {
        setSuggestedCapability(json.data.suggestedCapabilityIdentifier);
      } else {
        setSuggestedCapability(null);
      }
    } catch (err) {
      console.error(err);
      setLeaderThought("I'm having trouble analyzing this right now, but feel free to submit!");
    } finally {
      setIsLeaderThinking(false);
    }
  };

  const handleCapabilityChange = (val: string | null) => {
    if (val) {
      setCapabilitiesWorkflow([val]);
      const cap = capabilities.find(c => c.identifier === val);
      setSelectedCapabilityInfo(cap || null);
      setSuggestedCapability(null);
    } else {
      setCapabilitiesWorkflow([]);
      setSelectedCapabilityInfo(null);
      setSuggestedCapability(null);
    }
  };

  const handleDetailsChange = (value: string) => {
    setRequestDetails(value);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    const cleanValue = value.trim();
    if (!cleanValue) {
      setLeaderThought(null);
      setIsLeaderThinking(false);
      return;
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsLeaderThinking(true);
      fetchFieldInsight(cleanValue, capabilitiesWorkflow);
    }, 2000);
  };
  
  // Also trigger thinking when capabilities change
  useEffect(() => {
    if (!authLoading && capabilitiesWorkflow.length > 0) {
      if (requestDetails.trim()) {
        setLeaderThought(null);
        setIsLeaderThinking(true);
        const to = setTimeout(() => {
          fetchFieldInsight(requestDetails.trim(), capabilitiesWorkflow);
        }, 1500);
        return () => clearTimeout(to);
      } else {
        setLeaderThought(null);
        setIsLeaderThinking(true);
        const to = setTimeout(() => {
          setIsLeaderThinking(false);
          setLeaderThought(t.teamsPage.updatedExecutionPlan);
        }, 1500);
        return () => clearTimeout(to);
      }
    }
  }, [capabilitiesWorkflow, authLoading]);

  const handleSubmit = async (status: "draft" | "open") => {
    if (!requestDetails.trim()) {
      toast.error(t.teamsPage.requestDetailsRequired);
      return;
    }

    setIsSubmitting(true);
    try {
      const finalTitle = title.trim() || t.teamsPage.newRequest;

      const endpoint = requestIdParam 
        ? `${API_BASE}/teams/${teamId}/requests/${requestIdParam}`
        : `${API_BASE}/teams/${teamId}/requests`;
      
      const method = requestIdParam ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: finalTitle,
          targetAgentId: targetType === "agent" ? targetAgentId || null : null,
          targetRole: targetType === "role" ? targetRole || null : null,
          requestDetails,
          capabilitiesWorkflow: capabilitiesWorkflow.length > 0 ? capabilitiesWorkflow : (suggestedCapability ? [suggestedCapability] : []),
          status
        }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error || `${t.teamsPage.failedAction} ${requestIdParam ? "update" : "create"} ${t.teamsPage.request}`);
      }

      toast.success(status === "draft" ? t.teamsPage.requestDraftSaved : t.teamsPage.requestCreated);
      router.push(`/teams/${teamId}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const leadAgent = agents.find(a => a.isLeader);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
      <Link href={`/teams/${teamId}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-3.5" />
        {t.teamsPage.backToTeam}
      </Link>

      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {selectedCapabilityInfo ? translate(selectedCapabilityInfo.name) : t.teamsPage.askAnything}
        </h1>
        <p className="text-muted-foreground text-sm">
          {selectedCapabilityInfo ? t.teamsPage.capabilityInfo : t.teamsPage.genericRequestInfo}
        </p>
      </div>

      <div className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">

        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {(!capabilitiesWorkflow.length && suggestedCapability) ? t.teamsPage.matchedCapability : selectedCapabilityInfo ? t.teamsPage.selectedCapability : t.teamsPage.capability}
          </Label>
          <SmartCapabilitySelect
            value={capabilitiesWorkflow.length > 0 ? capabilitiesWorkflow[0] : suggestedCapability}
            onChange={handleCapabilityChange}
            availableCapabilities={capabilities}
            translate={translate}
          />
        </div>

        <div className="space-y-3">
          <Label htmlFor="requestDetails" className="sr-only">Details of what you'd like done</Label>
          <textarea
            id="requestDetails"
            className="flex min-h-[160px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary shadow-sm"
            placeholder={t.teamsPage.requestPlaceholder}
            value={requestDetails}
            onChange={e => handleDetailsChange(e.target.value)}
            autoFocus
          />
        </div>

        {/* AI Thoughts Area */}
        <div className="min-h-[60px] flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/10">
          <div className="flex size-10 items-center justify-center rounded-full bg-background border shadow-sm text-lg shrink-0 mt-0.5">
            {leadAgent?.icon || "👑"}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-primary mb-1 block">{leadAgent?.name || t.teamsPage.statusLabels.open}</span>
            {isLeaderThinking ? (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground italic h-6">
                <span className="flex gap-0.5">
                  <span className="animate-bounce delay-75">.</span>
                  <span className="animate-bounce delay-150">.</span>
                  <span className="animate-bounce delay-300">.</span>
                </span>
                {t.teamsPage.analyzingRequest}
              </div>
            ) : leaderThought ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-left-2">
                <Markdown content={leaderThought} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic h-6 flex items-center">{t.teamsPage.waitingInput}</p>
            )}
          </div>
        </div>

        {/* Title and Capability Fields */}
        {title && (
          <div className="space-y-4 pt-4 border-t animate-in fade-in">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-medium">{t.teamsPage.requestTitle}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setHasUserEditedTitle(true);
                }}
                placeholder={t.teamsPage.requestTitle}
              />
            </div>
          </div>
        )}



        <div className="flex items-center justify-between pt-6 border-t">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-muted-foreground"
            onClick={() => handleSubmit("draft")}
            disabled={isSubmitting}
          >
            <Save className="size-4 mr-2" />
            {t.teamsPage.saveDraft}
          </Button>

          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link href={`/teams/${teamId}`}>{t.teamsPage.cancel}</Link>
            </Button>
            <Button 
              onClick={() => handleSubmit("open")}
              disabled={isSubmitting || !requestDetails.trim()}
              className="px-8 shadow-md"
            >
              <Send className="size-4 mr-2" />
              {t.teamsPage.submitRequest}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
