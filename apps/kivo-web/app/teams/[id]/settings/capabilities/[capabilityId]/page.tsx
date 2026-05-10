"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, Star } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { CapabilityForm, Capability } from "../CapabilityForm";
import { WorkflowBuilder } from "../WorkflowBuilder";

export default function CapabilityPage() {
  const { token, isLoading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const teamId = String(params.id);
  const capabilityId = String(params.capabilityId);
  const isNew = capabilityId === "new";

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [agents, setAgents] = useState<{id: string, name: string, roleId: string}[]>([]);
  const [allCapabilities, setAllCapabilities] = useState<Capability[]>([]);
  const [capability, setCapability] = useState<Capability>({
    id: "new", name: "", identifier: "", instructions: "", inputsDescription: "", 
    expectedOutputsDescription: "", tasksWorkflow: null, type: "task_template", isEnabled: true, scheduleConfig: null, 
    assignedAgentId: null, assignedRole: null, isFavorite: false
  });

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [agentsRes, capsRes] = await Promise.all([
        fetch(`${API_BASE}/agents?teamId=${teamId}`, { headers }),
        fetch(`${API_BASE}/teams/${teamId}/capabilities`, { headers })
      ]);

      if (agentsRes.ok) setAgents((await agentsRes.json()).data || []);
      
      let capabilitiesList: Capability[] = [];
      if (capsRes.ok) {
        capabilitiesList = (await capsRes.json()).data || [];
        setAllCapabilities(capabilitiesList);
      }

      if (!isNew) {
        const existingCap = capabilitiesList.find(c => c.id === capabilityId);
        if (existingCap) {
          setCapability(existingCap);
        } else {
          // Fallback fetch if not in the list
          const singleRes = await fetch(`${API_BASE}/teams/${teamId}/capabilities/${capabilityId}`, { headers });
          if (singleRes.ok) {
            setCapability((await singleRes.json()).data);
          } else {
            toast.error("Capability not found.");
            router.push(`/teams/${teamId}/settings`);
          }
        }
      }
    } catch (err) { 
      toast.error("Failed to load capability data."); 
    } finally { 
      setIsLoading(false); 
    }
  }, [teamId, capabilityId, isNew, token, router]);

  useEffect(() => {
    if (!authLoading) {
      if (!token) router.replace("/login");
      else fetchData();
    }
  }, [authLoading, token, fetchData, router]);

  const saveCapability = async () => {
    if (!token) return;
    setIsSaving(true);
    try {
      const url = isNew ? `${API_BASE}/teams/${teamId}/capabilities` : `${API_BASE}/teams/${teamId}/capabilities/${capabilityId}`;
      const method = isNew ? "POST" : "PUT";
      
      const payload = {
        name: capability.name,
        identifier: capability.identifier,
        instructions: capability.instructions,
        inputsDescription: capability.inputsDescription,
        expectedOutputsDescription: capability.expectedOutputsDescription,
        tasksWorkflow: capability.tasksWorkflow,
        type: capability.type,
        isEnabled: capability.isEnabled,
        isFavorite: capability.isFavorite,
        scheduleConfig: capability.scheduleConfig,
        assignedAgentId: capability.assignedAgentId,
        assignedRole: capability.assignedRole
      };

      const res = await fetch(url, {
        method, 
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        toast.success(`Capability ${isNew ? 'created' : 'updated'}`);
        router.push(`/teams/${teamId}/settings`);
      } else {
        toast.error("Failed to save capability");
      }
    } catch (e) { 
      toast.error("Failed to save capability"); 
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || isLoading) return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4">
        <Link href={`/teams/${teamId}/settings`} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ArrowLeft className="size-3.5" /> Back to Settings
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                {isNew ? "New Capability" : "Edit Capability"}
                <button
                  type="button"
                  onClick={() => setCapability({ ...capability, isFavorite: !capability.isFavorite })}
                  className="text-muted-foreground hover:text-amber-500 transition-colors"
                  title="Mark as favorite"
                >
                  <Star className={cn("size-6 mt-1", capability.isFavorite ? "fill-amber-500 text-amber-500" : "")} />
                </button>
              </h1>
              <div className="mt-2 space-y-1">
                <p className="text-muted-foreground text-sm">
                  {capability.type === 'workflow' ? (
                    "A workflow capability sequences other capabilities to achieve a larger goal."
                  ) : (
                    "A capability is a template for task execution. It defines exactly what an agent needs to do."
                  )}
                </p>
                {capability.type === 'task_template' && (
                  <p className="text-muted-foreground text-sm">
                    Detailing the inputs, execution instructions, and expected result (definition of done) is crucial for consistent and successful autonomous execution.
                  </p>
                )}
              </div>
            </div>
          </div>
          <Button onClick={saveCapability} disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} 
            Save Capability
          </Button>
        </div>
      </div>

      <div className="pb-20">
        {capability.type === 'workflow' ? (
          <WorkflowBuilder 
            capability={capability} 
            setCapability={setCapability} 
            allCapabilities={allCapabilities} 
            onOpenNewCapabilityModal={() => toast.error("Please create new task templates in the main settings screen to add them here.")} // Editing workflow doesn't allow new inline capability creation for now, unless we want to embed the modal. We'll add the modal logic to the wizard first.
          />
        ) : (
          <CapabilityForm 
            capability={capability} 
            setCapability={setCapability} 
            agents={agents} 
            allCapabilities={allCapabilities} 
            onSave={saveCapability}
            isSaving={isSaving}
          />
        )}
      </div>
    </div>
  );
}
