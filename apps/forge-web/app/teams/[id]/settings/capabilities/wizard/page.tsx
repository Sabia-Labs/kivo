"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, FileText, Network, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { CapabilityForm, Capability } from "../CapabilityForm";
import { WorkflowBuilder } from "../WorkflowBuilder";

export default function CapabilityWizardPage() {
  const { token, isLoading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const teamId = String(params.id);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [agents, setAgents] = useState<{id: string, name: string, type: string}[]>([]);
  const [allCapabilities, setAllCapabilities] = useState<Capability[]>([]);
  
  const [step, setStep] = useState<1 | 2>(1);
  const [capability, setCapability] = useState<Capability>({
    name: "", identifier: "", instructions: "", inputsDescription: "", 
    expectedOutputsDescription: "", tasksWorkflow: [], type: "workflow", isEnabled: true, scheduleConfig: null, 
    assignedAgentId: null, assignedRole: null, isFavorite: false
  });

  // Modal State
  const [isNewCapModalOpen, setIsNewCapModalOpen] = useState(false);
  const [newCapIndex, setNewCapIndex] = useState<number | null>(null);
  const [newCapabilityForm, setNewCapabilityForm] = useState<Capability>({
    name: "", identifier: "", instructions: "", inputsDescription: "", 
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
      if (capsRes.ok) setAllCapabilities((await capsRes.json()).data || []);
    } catch (err) { 
      toast.error("Failed to load capability data."); 
    } finally { 
      setIsLoading(false); 
    }
  }, [teamId, token]);

  useEffect(() => {
    if (!authLoading) {
      if (!token) router.replace("/login");
      else fetchData();
    }
  }, [authLoading, token, fetchData, router]);

  const handleSelectType = (type: "task_template" | "workflow") => {
    if (type === "task_template") {
      router.push(`/teams/${teamId}/settings/capabilities/new`);
    } else {
      setStep(2);
    }
  };

  const saveWorkflow = async () => {
    if (!token) return;
    setIsSaving(true);
    try {
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

      const res = await fetch(`${API_BASE}/teams/${teamId}/capabilities`, {
        method: "POST", 
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        toast.success("Workflow created successfully");
        router.push(`/teams/${teamId}/settings`);
      } else {
        toast.error("Failed to save workflow");
      }
    } catch (e) { 
      toast.error("Failed to save workflow"); 
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNewModalCapability = async () => {
    if (!token || newCapIndex === null) return;
    setIsSaving(true);
    try {
      const payload = { ...newCapabilityForm, type: "task_template" };
      const res = await fetch(`${API_BASE}/teams/${teamId}/capabilities`, {
        method: "POST", 
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const createdCap = (await res.json()).data;
        setAllCapabilities(prev => [...prev, createdCap]);
        
        // Add it to the workflow
        const newTasks = [...(capability.tasksWorkflow || [])];
        newTasks[newCapIndex] = createdCap.identifier;
        setCapability({ ...capability, tasksWorkflow: newTasks });
        
        toast.success("Task Template created and added to workflow");
        setIsNewCapModalOpen(false);
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
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              New Capability
            </h1>
            <p className="mt-2 text-muted-foreground text-sm">
              Define how your team handles new requests.
            </p>
          </div>
          {step === 2 && (
            <Button onClick={saveWorkflow} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} 
              Save Workflow
            </Button>
          )}
        </div>
      </div>

      <div className="pb-20">
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <button 
              onClick={() => handleSelectType("task_template")}
              className="flex flex-col items-center p-8 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-left text-foreground shadow-sm group"
            >
              <div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <FileText className="size-8" />
              </div>
              <h2 className="text-xl font-bold mb-2 text-center w-full">Create a Task Template</h2>
              <p className="text-sm text-muted-foreground text-center">
                Define a single, atomic task that agents can perform. Specifies instructions, inputs, and expected outcomes.
              </p>
            </button>
            
            <button 
              onClick={() => handleSelectType("workflow")}
              className="flex flex-col items-center p-8 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-left text-foreground shadow-sm group"
            >
              <div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Network className="size-8" />
              </div>
              <h2 className="text-xl font-bold mb-2 text-center w-full">Define a Workflow</h2>
              <p className="text-sm text-muted-foreground text-center">
                Chain multiple Task Templates together to form a sequential process. Great for complex, multi-step requests.
              </p>
            </button>
          </div>
        )}

        {step === 2 && (
          <WorkflowBuilder 
            capability={capability} 
            setCapability={setCapability} 
            allCapabilities={allCapabilities} 
            onOpenNewCapabilityModal={(index) => {
              setNewCapIndex(index);
              setNewCapabilityForm({
                name: "", identifier: "", instructions: "", inputsDescription: "", 
                expectedOutputsDescription: "", tasksWorkflow: null, type: "task_template", isEnabled: true, scheduleConfig: null, 
                assignedAgentId: null, assignedRole: null, isFavorite: false
              });
              setIsNewCapModalOpen(true);
            }} 
          />
        )}
      </div>

      {isNewCapModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground border rounded-lg shadow-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold">Add New Task Template</h2>
              <button 
                onClick={() => setIsNewCapModalOpen(false)}
                className="p-2 hover:bg-muted rounded-full transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6">
              <CapabilityForm 
                capability={newCapabilityForm}
                setCapability={setNewCapabilityForm}
                agents={agents}
                allCapabilities={allCapabilities}
                onSave={handleSaveNewModalCapability}
                isSaving={isSaving}
                isModal={true}
                onCancel={() => setIsNewCapModalOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
